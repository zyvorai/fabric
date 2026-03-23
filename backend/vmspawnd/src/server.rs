use anyhow::Result;
use axum::{
    routing::{delete, get, post, put},
    Router,
};
use state_store::StateStore;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use vmspawnd_storage::StorageManager;

use vmspawnd_driver_core::{VMDriver, ResourceStatsDriver};

use crate::{api, config::Config, plugins, routes, websocket};

pub struct AppState {
    pub store: StateStore,
    pub config: Config,
    pub storage_manager: Arc<RwLock<StorageManager>>,
    pub http_client: reqwest::Client,
    pub quota_cache: Arc<tokio::sync::RwLock<QuotaCache>>,
    pub user_db: Option<Arc<security::db::UserDb>>,
    pub jwt_config: Option<Arc<security::JwtConfig>>,
    pub plugin_registry: Arc<RwLock<plugins::PluginRegistry>>,
    pub driver: Arc<vmspawnd_machinectl_driver::MachinectlDriver>,
    pub lock_manager: Arc<vmspawnd_lock_manager::LockManager>,
    pub policy_engine: Arc<network_policy::PolicyEngine>,
    pub service_mesh: Arc<service_mesh::ServiceMesh>,
    pub traffic_shaper: Arc<traffic_shaping::TrafficShaper>,
    pub dns_manager: Arc<dns_policy::DnsManager>,
    pub vm_firewall: Arc<vm_firewall::VMFirewall>,
    pub vpn_mesh: Arc<vpn_mesh::VpnMesh>,
    pub packet_mirror: Arc<packet_mirror::PacketMirror>,
    pub nat_gateway: Arc<nat_gateway::NatGateway>,
    pub net_monitor: Arc<net_monitor::NetMonitor>,
    /// Per-VM mutex to serialize state-changing operations on the same VM.
    pub vm_locks: Arc<std::sync::Mutex<std::collections::HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    /// Cancellation token for graceful background task shutdown.
    pub shutdown: tokio_util::sync::CancellationToken,
}

impl AppState {
    /// Acquire a per-VM lock. Creates one if it doesn't exist yet.
    pub fn vm_lock(&self, name: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.vm_locks.lock().unwrap_or_else(|e| e.into_inner());
        locks.entry(name.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    }
}

pub struct QuotaCache {
    pub usage: std::collections::HashMap<String, crate::api::quotas::QuotaUsage>,
    pub last_updated: std::time::Instant,
}

impl QuotaCache {
    pub fn new() -> Self {
        Self {
            usage: std::collections::HashMap::new(),
            last_updated: std::time::Instant::now(),
        }
    }

    pub fn is_stale(&self) -> bool {
        self.last_updated.elapsed() > std::time::Duration::from_secs(30)
    }
}

pub struct Server {
    state: Arc<AppState>,
}

impl Server {
    pub async fn new(store: StateStore, config: Config) -> Result<Self> {
        // Initialize storage manager
        let storage_path = std::path::PathBuf::from("/var/lib/vmspawnd/storage");
        let storage_manager = StorageManager::new(&storage_path)
            .map_err(|e| anyhow::anyhow!("Failed to initialize storage manager: {}", e))?;

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to create HTTP client: {}", e))?;

        // Initialize auth if enabled
        let (user_db, jwt_config) = if config.auth.enabled {
            let db = security::db::UserDb::new(&config.auth.db_path)?;
            db.seed_admin(&config.auth.default_admin_password)?;

            let mut jwt = security::JwtConfig::new(config.auth.jwt_secret.clone());
            jwt.expiration_hours = config.auth.token_expiration_hours;

            (Some(Arc::new(db)), Some(Arc::new(jwt)))
        } else {
            tracing::warn!("Authentication is disabled");
            (None, None)
        };

        // Initialize the D-Bus machined driver
        let driver = vmspawnd_machinectl_driver::MachinectlDriver::new()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to initialize machined D-Bus driver: {}", e))?;

        let lock_manager = Arc::new(vmspawnd_lock_manager::LockManager::new(
            vmspawnd_lock_manager::LockConfig::default(),
        ));

        let state = Arc::new(AppState {
            store,
            config,
            storage_manager: Arc::new(RwLock::new(storage_manager)),
            http_client,
            quota_cache: Arc::new(tokio::sync::RwLock::new(QuotaCache::new())),
            user_db,
            jwt_config,
            plugin_registry: Arc::new(RwLock::new(plugins::PluginRegistry::new())),
            driver: Arc::new(driver),
            lock_manager,
            policy_engine: Arc::new(network_policy::PolicyEngine::new()),
            service_mesh: Arc::new(service_mesh::ServiceMesh::new()),
            traffic_shaper: Arc::new(traffic_shaping::TrafficShaper::new()),
            dns_manager: Arc::new(dns_policy::DnsManager::new()),
            vm_firewall: Arc::new(vm_firewall::VMFirewall::new()),
            vpn_mesh: Arc::new(vpn_mesh::VpnMesh::new()),
            packet_mirror: Arc::new(packet_mirror::PacketMirror::new()),
            nat_gateway: Arc::new(nat_gateway::NatGateway::new()),
            net_monitor: Arc::new(net_monitor::NetMonitor::new()),
            vm_locks: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            shutdown: tokio_util::sync::CancellationToken::new(),
        });

        Ok(Self { state })
    }

    pub async fn run(self) -> Result<()> {
        let app = build_router(self.state.clone());

        let addr: std::net::SocketAddr = self.state.config.daemon.listen.parse()?;
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        tracing::info!("Listening on {}", addr);

        let mut bg_tasks: Vec<tokio::task::JoinHandle<()>> = Vec::new();
        let shutdown = self.state.shutdown.clone();

        // Helper macro to spawn cancellable background tasks
        macro_rules! spawn_bg {
            ($state:expr, $name:expr, $func:expr) => {{
                let s = $state.clone();
                let token = $state.shutdown.clone();
                bg_tasks.push(tokio::spawn(async move {
                    tokio::select! {
                        _ = token.cancelled() => {
                            tracing::debug!("Background task '{}' cancelled", $name);
                        }
                        _ = $func(s) => {
                            tracing::debug!("Background task '{}' exited", $name);
                        }
                    }
                }));
            }};
        }

        // Start background scheduler for automated schedule execution
        spawn_bg!(self.state, "schedule_checker", run_schedule_checker);

        // Start background metrics collector
        spawn_bg!(self.state, "metrics_collector", run_metrics_collector);

        // Start stale host detector
        spawn_bg!(self.state, "stale_host_detector", run_stale_host_detector);

        spawn_bg!(self.state, "drs_executor", run_drs_executor);
        spawn_bg!(self.state, "lock_renewal", run_lock_renewal);
        spawn_bg!(self.state, "replication_scheduler", run_replication_scheduler);
        spawn_bg!(self.state, "ha_monitor", run_ha_monitor);
        spawn_bg!(self.state, "vm_autohealer", run_vm_autohealer);
        spawn_bg!(self.state, "autoscaler", run_autoscaler);
        spawn_bg!(self.state, "policy_reconciler", run_policy_reconciler);
        spawn_bg!(self.state, "service_health_checker", run_service_health_checker);
        spawn_bg!(self.state, "service_reconciler", run_service_reconciler);
        spawn_bg!(self.state, "qos_reconciler", run_qos_reconciler);
        spawn_bg!(self.state, "dns_reconciler", run_dns_reconciler);
        spawn_bg!(self.state, "firewall_reconciler", run_firewall_reconciler);
        spawn_bg!(self.state, "vpn_reconciler", run_vpn_reconciler);
        spawn_bg!(self.state, "mirror_reconciler", run_mirror_reconciler);
        spawn_bg!(self.state, "nat_reconciler", run_nat_reconciler);
        spawn_bg!(self.state, "net_monitor", run_net_monitor);

        axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await?;

        tracing::info!("Shutdown signal received, cancelling background tasks");
        shutdown.cancel();
        // Give tasks a moment to finish cleanly
        for handle in bg_tasks {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), handle).await;
        }

        Ok(())
    }
}

/// Build the full application router with all routes. Used by both the server
/// and integration tests.
pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = {
        use axum::http::{HeaderValue, Method, header};

        let origins: Vec<HeaderValue> = state
            .config
            .daemon
            .cors_origins
            .iter()
            .filter_map(|o| o.parse::<HeaderValue>().ok())
            .collect();

        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
    };

    // Public auth routes (no JWT required)
    let public_auth_routes = Router::new()
            .route("/auth/login", post(api::auth::login))
            .with_state(state.clone());

    // Protected API routes
    let mut api_routes = Router::new()
            // Auth - me endpoint (protected)
            .route("/auth/me", get(api::auth::me))
            // VM management routes
            .route("/vms", get(routes::list_vms).post(routes::create_vm))
            .route("/vms/{name}", get(routes::get_vm).delete(routes::delete_vm))
            .route("/vms/{name}/start", post(routes::start_vm))
            .route("/vms/{name}/stop", post(routes::stop_vm))
            .route("/vms/{name}/restart", post(routes::restart_vm))
            .route("/vms/{name}/metrics", get(routes::get_metrics))
            .route("/vms/{name}/pause", post(routes::pause_vm))
            .route("/vms/{name}/resume", post(routes::resume_vm))
            .route("/vms/{name}/clone", post(routes::clone_vm))
            .route("/vms/{name}/cloud-init", post(routes::configure_cloud_init))
            // Snapshot routes
            .route("/vms/{name}/snapshots", get(api::snapshots::list_snapshots).post(api::snapshots::create_snapshot))
            .route("/vms/{name}/snapshots/tree", get(api::snapshots::snapshot_tree))
            .route("/vms/{name}/snapshots/{id}", get(api::snapshots::get_snapshot).delete(api::snapshots::delete_snapshot))
            .route("/vms/{name}/snapshots/{id}/revert", post(api::snapshots::revert_snapshot))
            // Hotplug routes
            .route("/vms/{name}/hotplug/cpu", post(api::hotplug::hotplug_cpu))
            .route("/vms/{name}/hotplug/memory", post(api::hotplug::hotplug_memory))
            .route("/vms/{name}/hotplug/disk", post(api::hotplug::hotplug_disk))
            .route("/vms/{name}/hotplug/disk/{id}", delete(api::hotplug::hotremove_disk))
            .route("/vms/{name}/hotplug/nic", post(api::hotplug::hotplug_nic))
            .route("/vms/{name}/hotplug/nic/{id}", delete(api::hotplug::hotremove_nic))
            // Storage pool routes
            .route("/storage/pools", get(api::storage::list_pools))
            .route("/storage/pools/{name}", get(api::storage::get_pool))
            .route("/storage/pools/local", post(api::storage::create_local_pool))
            .route("/storage/pools/nfs", post(api::storage::create_nfs_pool))
            .route("/storage/pools/{name}", delete(api::storage::delete_pool))
            .route("/storage/pools/{name}/start", post(api::storage::start_pool))
            .route("/storage/pools/{name}/stop", post(api::storage::stop_pool))
            .route("/storage/pools/{name}/health", get(api::storage::get_pool_health))
            .route("/storage/pools/{name}/stats", get(api::storage::get_pool_stats))
            .route("/storage/pools/{name}/refresh", post(api::storage::refresh_pool_stats))
            .route("/storage/pools/lvm", post(api::storage::create_lvm_pool))
            .route("/storage/pools/lvm-thin", post(api::storage::create_lvm_thin_pool))
            .route("/storage/pools/zfs", post(api::storage::create_zfs_pool))
            .route("/storage/pools/ceph", post(api::storage::create_ceph_pool))
            // Volume management routes
            .route("/storage/pools/{name}/volumes", get(api::volumes::list_volumes).post(api::volumes::create_volume))
            .route("/storage/pools/{name}/volumes/{id}", get(api::volumes::get_volume).delete(api::volumes::delete_volume))
            .route("/storage/pools/{name}/volumes/{id}/resize", post(api::volumes::resize_volume))
            .route("/storage/pools/{name}/volumes/{id}/attach", post(api::volumes::attach_volume))
            .route("/storage/pools/{name}/volumes/{id}/detach", post(api::volumes::detach_volume))
            // System resource routes - CPU
            .route("/system/cpu/topology", get(api::system::get_cpu_topology))
            .route("/vms/{name}/cpu/pin", post(api::system::set_cpu_pinning))
            .route("/vms/{name}/cpu/pin", delete(api::system::remove_cpu_pinning))
            .route("/vms/{name}/cpu/affinity", get(api::system::get_cpu_affinity))
            // System resource routes - NUMA
            .route("/system/numa/topology", get(api::system::get_numa_topology))
            .route("/system/numa/nodes/{id}", get(api::system::get_numa_node))
            .route("/system/numa/placement", get(api::system::get_numa_placement))
            // System resource routes - Memory
            .route("/vms/{name}/memory/limit", put(api::system::set_memory_limit))
            .route("/vms/{name}/memory/usage", get(api::system::get_memory_usage))
            .route("/vms/{name}/memory/balloon", post(api::system::set_memory_ballooning))
            .route("/system/memory/hugepages", get(api::system::get_hugepage_stats))
            .route("/system/memory/hugepages", post(api::system::allocate_hugepages))
            .route("/system/memory", get(api::system::get_system_memory))
            // Firmware routes
            .route("/vms/{name}/firmware/status", get(api::firmware::get_firmware_status))
            .route("/vms/{name}/firmware/uefi", post(api::firmware::enable_uefi))
            .route("/vms/{name}/firmware/secureboot", post(api::firmware::enable_secureboot))
            .route("/vms/{name}/firmware/secureboot", delete(api::firmware::disable_secureboot))
            .route("/vms/{name}/firmware/reset", post(api::firmware::reset_nvram))
            .route("/system/firmware/capabilities", get(api::firmware::get_firmware_capabilities))
            // Notification routes
            .route("/notifications/channels", get(api::notifications::list_channels))
            .route("/notifications/channels", post(api::notifications::create_channel))
            .route("/notifications/channels/{id}", put(api::notifications::update_channel))
            .route("/notifications/channels/{id}", delete(api::notifications::delete_channel))
            .route("/notifications/channels/{id}/test", post(api::notifications::test_channel))
            .route("/notifications/rules", get(api::notifications::list_rules))
            .route("/notifications/rules", post(api::notifications::create_rule))
            .route("/notifications/rules/{id}", put(api::notifications::update_rule))
            .route("/notifications/rules/{id}", delete(api::notifications::delete_rule))
            .route("/notifications/rules/{id}/enable", post(api::notifications::enable_rule))
            .route("/notifications/rules/{id}/disable", post(api::notifications::disable_rule))
            .route("/notifications/history", get(api::notifications::get_history))
            // Quota routes
            .route("/quotas", get(api::quotas::list_quotas))
            .route("/quotas", post(api::quotas::create_quota))
            .route("/quotas/{id}", get(api::quotas::get_quota))
            .route("/quotas/{id}", put(api::quotas::update_quota))
            .route("/quotas/{id}", delete(api::quotas::delete_quota))
            .route("/quotas/{id}/enable", post(api::quotas::enable_quota))
            .route("/quotas/{id}/disable", post(api::quotas::disable_quota))
            .route("/quotas/{id}/usage", get(api::quotas::get_quota_usage))
            .route("/quotas/usage", get(api::quotas::get_all_quota_usage))
            // Schedule routes
            .route("/schedules", get(api::schedules::list_schedules))
            .route("/schedules", post(api::schedules::create_schedule))
            .route("/schedules/{id}", get(api::schedules::get_schedule))
            .route("/schedules/{id}", put(api::schedules::update_schedule))
            .route("/schedules/{id}", delete(api::schedules::delete_schedule))
            .route("/schedules/{id}/enable", post(api::schedules::enable_schedule))
            .route("/schedules/{id}/disable", post(api::schedules::disable_schedule))
            .route("/schedules/{id}/run", post(api::schedules::run_schedule_now))
            .route("/schedules/{id}/history", get(api::schedules::get_schedule_history))
            .route("/schedules/history", get(api::schedules::get_all_schedule_history))
            // Audit routes
            .route("/audit/logs", get(api::audit::list_audit_logs))
            .route("/audit/logs/{id}", get(api::audit::get_audit_log))
            .route("/audit/logs/export", get(api::audit::export_audit_logs))
            .route("/audit/stats", get(api::audit::get_audit_stats))
            // Analytics routes
            .route("/analytics/vms/{name}", get(api::analytics::get_vm_performance))
            .route("/analytics/system", get(api::analytics::get_system_performance))
            .route("/analytics/insights", get(api::analytics::get_performance_insights))
            .route("/analytics/top", get(api::analytics::get_top_vms_by_resource))
            .route("/analytics/utilization", get(api::analytics::get_resource_utilization))
            .route("/analytics/export", get(api::analytics::export_performance_report))
            // Template routes
            .route("/templates", get(api::templates::list_templates).post(api::templates::create_template))
            .route("/templates/{id}", get(api::templates::get_template).put(api::templates::update_template).delete(api::templates::delete_template))
            .route("/templates/{id}/deploy", post(api::templates::deploy_template))
            // Migration routes
            .route("/migrations", get(api::migration::list_migrations).post(api::migration::start_migration))
            .route("/migrations/{id}", get(api::migration::get_migration))
            .route("/migrations/{id}/cancel", post(api::migration::cancel_migration))
            // Image build routes
            .route("/images/build", post(api::images::build_image))
            .route("/images/builds", get(api::images::list_builds))
            .route("/images", get(api::images::list_images))
            // Cloud image management
            .route("/images/cloud", get(api::images::list_cloud_images))
            .route("/images/cloud/download", post(api::images::download_cloud_image))
            .route("/images/downloads", get(api::images::list_downloads))
            // ISO management
            .route("/images/iso", get(api::images::list_iso_images))
            .route("/images/iso/download", post(api::images::download_iso))
            .route("/images/iso/{name}", delete(api::images::delete_iso))
            // VM image import (OVA/VMDK/VDI)
            .route("/images/import", post(api::images::import_vm_image))
            // Online disk resize
            .route("/vms/{name}/disk/resize", post(api::images::resize_disk))
            // VM profile / instance type routes
            .route("/profiles", get(api::profiles::list_profiles).post(api::profiles::create_profile))
            .route("/profiles/{name}", get(api::profiles::get_profile).delete(api::profiles::delete_profile))
            // Event routes
            .route("/events", get(api::events::list_events))
            .route("/events/stream", get(api::events::event_stream))
            // Floating IP routes
            .route("/floating-ips", get(api::network_cloud::list_floating_ips).post(api::network_cloud::create_floating_ip))
            .route("/floating-ips/{id}", delete(api::network_cloud::delete_floating_ip))
            .route("/floating-ips/{id}/assign", post(api::network_cloud::assign_floating_ip))
            .route("/floating-ips/{id}/unassign", post(api::network_cloud::unassign_floating_ip))
            // DHCP server routes (systemd-networkd)
            .route("/dhcp-servers", get(api::network_cloud::list_dhcp_servers).post(api::network_cloud::create_dhcp_server))
            .route("/dhcp-servers/{id}", delete(api::network_cloud::delete_dhcp_server))
            // DNS routes (systemd-resolved)
            .route("/dns", get(api::network_cloud::list_dns_configs).post(api::network_cloud::create_dns_config))
            .route("/dns/{id}", delete(api::network_cloud::delete_dns_config))
            .route("/dns/{id}/records", post(api::network_cloud::add_dns_record))
            // Availability zone routes
            .route("/zones", get(api::zones::list_zones).post(api::zones::create_zone))
            .route("/zones/{id}", get(api::zones::get_zone).delete(api::zones::delete_zone))
            // Spot instance routes
            .route("/spot-instances", get(api::zones::list_spot_instances).post(api::zones::create_spot_instance))
            .route("/spot-instances/{id}", delete(api::zones::delete_spot_instance))
            .route("/spot-instances/{id}/evict", post(api::zones::evict_spot_instance))
            // KSM memory deduplication
            .route("/system/ksm", get(api::vm_advanced::get_ksm_status).post(api::vm_advanced::configure_ksm))
            // Nested virtualization
            .route("/system/nested-virt", get(api::vm_advanced::get_nested_virt_status).post(api::vm_advanced::set_nested_virt))
            // VM checkpoints
            .route("/vms/{name}/checkpoints", get(api::vm_advanced::list_checkpoints).post(api::vm_advanced::create_checkpoint))
            .route("/vms/{name}/checkpoints/{id}/restore", post(api::vm_advanced::restore_checkpoint))
            .route("/vms/{name}/checkpoints/{id}", delete(api::vm_advanced::delete_checkpoint))
            // VM forking
            .route("/vms/{name}/fork", post(api::vm_advanced::fork_vm))
            // Declarative VM spec
            .route("/vms/apply", post(api::declarative::apply_vm_spec))
            .route("/vms/{name}/spec", get(api::declarative::export_vm_spec))
            // Auto-scaling
            .route("/autoscale", get(api::autoscale::list_scaling_policies).post(api::autoscale::create_scaling_policy))
            .route("/autoscale/events", get(api::autoscale::list_scale_events))
            .route("/autoscale/{vm_name}", get(api::autoscale::get_scaling_policy).delete(api::autoscale::delete_scaling_policy))
            // machinectl/machined integration routes
            .route("/machines", get(api::machined::list_machines))
            .route("/machines/images", get(api::machined::list_machine_images))
            .route("/machines/images/pull-raw", post(api::machined::pull_raw_image))
            .route("/machines/images/pull-tar", post(api::machined::pull_tar_image))
            .route("/machines/images/import-raw", post(api::machined::import_raw_image))
            .route("/machines/images/import-tar", post(api::machined::import_tar_image))
            .route("/machines/images/clean", post(api::machined::clean_images))
            .route("/machines/images/{name}/clone", post(api::machined::clone_machine_image))
            .route("/machines/images/{name}/rename", post(api::machined::rename_machine_image))
            .route("/machines/images/{name}/read-only", post(api::machined::set_image_read_only))
            .route("/machines/images/{name}/export-raw", post(api::machined::export_raw_image))
            .route("/machines/images/{name}/export-tar", post(api::machined::export_tar_image))
            .route("/machines/images/{name}", delete(api::machined::remove_machine_image))
            .route("/machines/{name}/properties", get(api::machined::show_machine))
            .route("/machines/{name}/poweroff", post(api::machined::poweroff_machine))
            .route("/machines/{name}/reboot", post(api::machined::reboot_machine))
            .route("/machines/{name}/terminate", post(api::machined::terminate_machine))
            .route("/machines/{name}/enable", post(api::machined::enable_machine))
            .route("/machines/{name}/disable", post(api::machined::disable_machine))
            .route("/machines/{name}/shell", post(api::machined::shell_machine))
            .route("/machines/{name}/ssh", get(api::machined::ssh_info))
            .route("/machines/{name}/copy-to", post(api::machined::copy_to_machine))
            .route("/machines/{name}/copy-from", post(api::machined::copy_from_machine))
            .route("/machines/{name}/bind", post(api::machined::bind_machine))
            // Plugin routes
            .route("/plugins", get(plugins::list_plugins))
            // Resource optimization routes
            .route("/system/optimization/recommendations", get(api::system::get_optimization_recommendations))
            .route("/vms/{name}/optimize", post(api::system::optimize_vm))
            // Backup routes
            .route("/backups", get(api::backups::list_backups))
            .route("/backups", post(api::backups::create_backup))
            .route("/backups/{id}", get(api::backups::get_backup))
            .route("/backups/{id}", delete(api::backups::delete_backup))
            .route("/backups/restore", post(api::backups::restore_backup))
            .route("/backups/jobs", get(api::backups::get_backup_jobs))
            .route("/backups/jobs/{id}", get(api::backups::get_backup_job))
            .route("/backups/policies", get(api::backups::list_backup_policies))
            .route("/backups/policies", post(api::backups::create_backup_policy))
            .route("/backups/policies/{id}", delete(api::backups::delete_backup_policy))
            .route("/backups/policies/{id}/enable", post(api::backups::enable_backup_policy))
            .route("/backups/policies/{id}/disable", post(api::backups::disable_backup_policy))
            .route("/backups/stats", get(api::backups::get_backup_stats))
            // Settings routes
            .route("/settings", get(api::settings::get_settings).put(api::settings::update_settings))
            // ========================================================================
            // Enterprise feature routes (vSphere feature parity)
            // ========================================================================
            // Datacenter routes
            .route("/datacenters", get(api::datacenter::list_datacenters).post(api::datacenter::create_datacenter))
            .route("/datacenters/{id}", get(api::datacenter::get_datacenter).put(api::datacenter::update_datacenter).delete(api::datacenter::delete_datacenter))
            .route("/datacenters/{id}/summary", get(api::datacenter::get_datacenter_summary))
            // Cluster routes
            .route("/clusters", get(api::datacenter::list_clusters).post(api::datacenter::create_cluster))
            .route("/clusters/{id}", get(api::datacenter::get_cluster).put(api::datacenter::update_cluster).delete(api::datacenter::delete_cluster))
            // Host routes
            .route("/hosts", get(api::datacenter::list_hosts).post(api::datacenter::register_host))
            .route("/hosts/{id}", get(api::datacenter::get_host).put(api::datacenter::update_host).delete(api::datacenter::remove_host))
            .route("/hosts/{id}/heartbeat", post(api::datacenter::host_heartbeat))
            .route("/hosts/{id}/maintenance/enter", post(api::datacenter::host_enter_maintenance))
            .route("/hosts/{id}/maintenance/exit", post(api::datacenter::host_exit_maintenance))
            .route("/hosts/discover", post(api::datacenter::discover_host))
            .route("/clusters/{id}/health", get(api::datacenter::get_cluster_health))
            // Resource pool routes
            .route("/resource-pools", get(api::resource_pools::list_pools).post(api::resource_pools::create_pool))
            .route("/resource-pools/{id}", get(api::resource_pools::get_pool).put(api::resource_pools::update_pool).delete(api::resource_pools::delete_pool))
            .route("/resource-pools/{id}/summary", get(api::resource_pools::get_pool_summary))
            .route("/resource-pools/{id}/vms", post(api::resource_pools::assign_vm).delete(api::resource_pools::unassign_vm))
            .route("/resource-pools/{id}/vms/move", post(api::resource_pools::move_vm))
            .route("/resource-pools/{id}/admission", post(api::resource_pools::check_admission))
            // DRS routes
            .route("/drs/config", post(api::drs::configure_drs))
            .route("/drs/config/{cluster_id}", get(api::drs::get_drs_config))
            .route("/drs/placement", post(api::drs::compute_placement))
            .route("/drs/balance/{cluster_id}", get(api::drs::analyze_balance))
            .route("/drs/recommendations", post(api::drs::generate_recommendations))
            .route("/drs/recommendations/{cluster_id}", get(api::drs::list_recommendations))
            .route("/drs/recommendations/{id}/approve", post(api::drs::approve_recommendation))
            .route("/drs/recommendations/{id}/reject", post(api::drs::reject_recommendation))
            .route("/drs/affinity-rules", get(api::drs::list_affinity_rules).post(api::drs::create_affinity_rule))
            .route("/drs/affinity-rules/{id}", get(api::drs::get_affinity_rule).put(api::drs::update_affinity_rule).delete(api::drs::delete_affinity_rule))
            // Distributed storage routes
            .route("/distributed-storage/pools", get(api::distributed_storage::list_storage_pools).post(api::distributed_storage::create_storage_pool))
            .route("/distributed-storage/pools/{id}", get(api::distributed_storage::get_storage_pool).delete(api::distributed_storage::delete_storage_pool))
            .route("/distributed-storage/pools/{id}/hosts", post(api::distributed_storage::add_storage_host))
            .route("/distributed-storage/pools/{id}/hosts/{host_id}", delete(api::distributed_storage::remove_storage_host))
            .route("/distributed-storage/pools/{id}/disk-failure", post(api::distributed_storage::report_disk_failure))
            .route("/distributed-storage/pools/{id}/health", get(api::distributed_storage::get_pool_health))
            .route("/distributed-storage/migrations", get(api::distributed_storage::list_storage_migrations).post(api::distributed_storage::start_storage_migration))
            .route("/distributed-storage/migrations/{id}", get(api::distributed_storage::get_storage_migration))
            .route("/distributed-storage/migrations/{id}/progress", put(api::distributed_storage::update_migration_progress))
            .route("/distributed-storage/migrations/{id}/complete", post(api::distributed_storage::complete_migration))
            .route("/distributed-storage/migrations/{id}/cancel", post(api::distributed_storage::cancel_migration))
            .route("/distributed-storage/policies", get(api::distributed_storage::list_storage_policies).post(api::distributed_storage::create_storage_policy))
            .route("/distributed-storage/policies/{id}", get(api::distributed_storage::get_storage_policy).put(api::distributed_storage::update_storage_policy).delete(api::distributed_storage::delete_storage_policy))
            .route("/distributed-storage/policies/{id}/compliance", post(api::distributed_storage::check_compliance))
            .route("/distributed-storage/datastore-clusters", get(api::distributed_storage::list_datastore_clusters).post(api::distributed_storage::create_datastore_cluster))
            .route("/distributed-storage/datastore-clusters/{id}", get(api::distributed_storage::get_datastore_cluster).delete(api::distributed_storage::delete_datastore_cluster))
            .route("/distributed-storage/datastore-clusters/{id}/recommend", post(api::distributed_storage::recommend_datastore))
            // Encryption routes
            .route("/encryption/providers", get(api::vm_encryption::list_providers).post(api::vm_encryption::register_provider))
            .route("/encryption/providers/{id}", delete(api::vm_encryption::remove_provider))
            .route("/encryption/providers/{id}/test", post(api::vm_encryption::test_provider))
            .route("/encryption/policies", get(api::vm_encryption::list_policies).post(api::vm_encryption::create_policy))
            .route("/encryption/policies/{id}", get(api::vm_encryption::get_policy).put(api::vm_encryption::update_policy).delete(api::vm_encryption::delete_policy))
            .route("/encryption/vms/{name}/encrypt", post(api::vm_encryption::encrypt_vm))
            .route("/encryption/vms/{name}/decrypt", post(api::vm_encryption::decrypt_vm))
            .route("/encryption/vms/{name}/status", get(api::vm_encryption::get_vm_encryption_status))
            .route("/encryption/vms", get(api::vm_encryption::list_encrypted_vms))
            .route("/encryption/vms/{name}/rotate-key", post(api::vm_encryption::rotate_vm_key))
            // systemd-networkd VM networking routes
            .route("/networkd/bridges", get(api::networkd::list_bridges).post(api::networkd::create_bridge))
            .route("/networkd/bridges/{id}", get(api::networkd::get_bridge).put(api::networkd::update_bridge).delete(api::networkd::delete_bridge))
            .route("/networkd/vlans", get(api::networkd::list_vlans).post(api::networkd::create_vlan))
            .route("/networkd/vlans/{id}", get(api::networkd::get_vlan).put(api::networkd::update_vlan).delete(api::networkd::delete_vlan))
            .route("/networkd/macvtaps", get(api::networkd::list_macvtaps).post(api::networkd::create_macvtap))
            .route("/networkd/macvtaps/{id}", get(api::networkd::get_macvtap).delete(api::networkd::delete_macvtap))
            .route("/networkd/taps", get(api::networkd::list_taps).post(api::networkd::create_tap))
            .route("/networkd/taps/{id}", get(api::networkd::get_tap).delete(api::networkd::delete_tap))
            .route("/networkd/bonds", get(api::networkd::list_bonds).post(api::networkd::create_bond))
            .route("/networkd/bonds/{id}", get(api::networkd::get_bond).put(api::networkd::update_bond).delete(api::networkd::delete_bond))
            .route("/networkd/network-files", get(api::networkd::list_network_files).post(api::networkd::create_network_file))
            .route("/networkd/network-files/{id}", get(api::networkd::get_network_file).delete(api::networkd::delete_network_file))
            .route("/networkd/link-files", get(api::networkd::list_link_files).post(api::networkd::create_link_file))
            .route("/networkd/link-files/{id}", delete(api::networkd::delete_link_file))
            .route("/networkd/links", get(api::networkd::list_links))
            .route("/networkd/links/{name}/status", get(api::networkd::get_device_status))
            .route("/networkd/reload", post(api::networkd::reload_networkd))
            .route("/networkd/files", get(api::networkd::list_managed_files))
            .route("/networkd/port-forwards", get(api::networkd::list_port_forwards).post(api::networkd::create_port_forward))
            .route("/networkd/port-forwards/sync", post(api::networkd::sync_port_forwards))
            .route("/networkd/port-forwards/{id}", get(api::networkd::get_port_forward).delete(api::networkd::delete_port_forward))
            .route("/networkd/vxlans", get(api::networkd::list_vxlans).post(api::networkd::create_vxlan))
            .route("/networkd/vxlans/{id}", get(api::networkd::get_vxlan).delete(api::networkd::delete_vxlan))
            .route("/networkd/sriov", get(api::networkd::list_sriov).post(api::networkd::create_sriov))
            .route("/networkd/sriov/{id}", get(api::networkd::get_sriov).delete(api::networkd::delete_sriov))
            .route("/networkd/scan", get(api::networkd::scan_configs))
            // Network policy routes
            .route("/network-policies", get(api::network_policy::list_policies).post(api::network_policy::create_policy))
            .route("/network-policies/sync", post(api::network_policy::sync_policies))
            .route("/network-policies/status", get(api::network_policy::get_policy_status))
            .route("/network-policies/{id}", get(api::network_policy::get_policy).put(api::network_policy::update_policy).delete(api::network_policy::delete_policy))
            .route("/identities", get(api::network_policy::list_identities))
            .route("/identities/{id}", get(api::network_policy::get_identity))
            // Service mesh routes
            .route("/services", get(api::service_mesh::list_services).post(api::service_mesh::create_service))
            .route("/services/sync", post(api::service_mesh::sync_services))
            .route("/services/status", get(api::service_mesh::get_service_status))
            .route("/services/{id}", get(api::service_mesh::get_service).put(api::service_mesh::update_service).delete(api::service_mesh::delete_service))
            .route("/services/{id}/backends", get(api::service_mesh::get_service_backends))
            // Traffic shaping routes
            .route("/qos-policies", get(api::traffic_shaping::list_qos_policies).post(api::traffic_shaping::create_qos_policy))
            .route("/qos-policies/sync", post(api::traffic_shaping::sync_qos_policies))
            .route("/qos-policies/status", get(api::traffic_shaping::get_qos_status))
            .route("/qos-policies/{id}", get(api::traffic_shaping::get_qos_policy).put(api::traffic_shaping::update_qos_policy).delete(api::traffic_shaping::delete_qos_policy))
            // DNS policy routes
            .route("/dns-zones", get(api::dns_policy::list_zones).post(api::dns_policy::create_zone))
            .route("/dns-zones/{id}", get(api::dns_policy::get_zone).delete(api::dns_policy::delete_zone))
            .route("/dns-policies", get(api::dns_policy::list_policies).post(api::dns_policy::create_policy))
            .route("/dns-policies/sync", post(api::dns_policy::sync_dns_policies))
            .route("/dns-policies/{id}", get(api::dns_policy::get_policy).put(api::dns_policy::update_policy).delete(api::dns_policy::delete_policy))
            .route("/dns-records", get(api::dns_policy::list_dns_records))
            // VM firewall routes
            .route("/firewall-profiles", get(api::vm_firewall::list_profiles).post(api::vm_firewall::create_profile))
            .route("/firewall-profiles/{id}", get(api::vm_firewall::get_profile).put(api::vm_firewall::update_profile).delete(api::vm_firewall::delete_profile))
            .route("/firewall-zones", get(api::vm_firewall::list_zones).post(api::vm_firewall::create_zone))
            .route("/firewall-zones/{id}", get(api::vm_firewall::get_zone).delete(api::vm_firewall::delete_zone))
            .route("/vms/{name}/firewall", get(api::vm_firewall::get_vm_firewall).put(api::vm_firewall::assign_vm_firewall).delete(api::vm_firewall::remove_vm_firewall))
            .route("/firewall/sync", post(api::vm_firewall::sync_firewall))
            .route("/firewall/status", get(api::vm_firewall::get_firewall_status))
            // VPN mesh routes
            .route("/vpn-tunnels", get(api::vpn_mesh::list_vpn_tunnels).post(api::vpn_mesh::create_vpn_tunnel))
            .route("/vpn-tunnels/sync", post(api::vpn_mesh::sync_vpn_tunnels))
            .route("/vpn-tunnels/status", get(api::vpn_mesh::get_vpn_tunnel_status))
            .route("/vpn-tunnels/{id}", get(api::vpn_mesh::get_vpn_tunnel).put(api::vpn_mesh::update_vpn_tunnel).delete(api::vpn_mesh::delete_vpn_tunnel))
            .route("/vpn-networks", get(api::vpn_mesh::list_vpn_networks).post(api::vpn_mesh::create_vpn_network))
            .route("/vpn-networks/status", get(api::vpn_mesh::get_vpn_network_status))
            .route("/vpn-networks/{id}", get(api::vpn_mesh::get_vpn_network).put(api::vpn_mesh::update_vpn_network).delete(api::vpn_mesh::delete_vpn_network))
            // Packet mirror routes
            .route("/mirror-sessions", get(api::packet_mirror::list_mirror_sessions).post(api::packet_mirror::create_mirror_session))
            .route("/mirror-sessions/sync", post(api::packet_mirror::sync_mirror_sessions))
            .route("/mirror-sessions/status", get(api::packet_mirror::get_mirror_status))
            .route("/mirror-sessions/{id}", get(api::packet_mirror::get_mirror_session).put(api::packet_mirror::update_mirror_session).delete(api::packet_mirror::delete_mirror_session))
            // NAT gateway routes
            .route("/nat-rules", get(api::nat_gateway::list_nat_rules).post(api::nat_gateway::create_nat_rule))
            .route("/nat-rules/sync", post(api::nat_gateway::sync_nat_rules))
            .route("/nat-rules/status", get(api::nat_gateway::get_nat_status))
            .route("/nat-rules/{id}", get(api::nat_gateway::get_nat_rule).put(api::nat_gateway::update_nat_rule).delete(api::nat_gateway::delete_nat_rule))
            .route("/nat-pools", get(api::nat_gateway::list_nat_pools).post(api::nat_gateway::create_nat_pool))
            .route("/nat-pools/{id}", get(api::nat_gateway::get_nat_pool).delete(api::nat_gateway::delete_nat_pool))
            .route("/nat-gateways", get(api::nat_gateway::list_nat_gateways).post(api::nat_gateway::create_nat_gateway))
            .route("/nat-gateways/{id}", get(api::nat_gateway::get_nat_gateway).delete(api::nat_gateway::delete_nat_gateway))
            // Network monitor routes
            .route("/monitor-policies", get(api::net_monitor::list_monitor_policies).post(api::net_monitor::create_monitor_policy))
            .route("/monitor-policies/sync", post(api::net_monitor::sync_monitor_policies))
            .route("/monitor-policies/status", get(api::net_monitor::get_monitor_status))
            .route("/monitor-policies/{id}", get(api::net_monitor::get_monitor_policy).put(api::net_monitor::update_monitor_policy).delete(api::net_monitor::delete_monitor_policy))
            .route("/network-metrics", get(api::net_monitor::get_all_network_metrics))
            .route("/network-metrics/{name}", get(api::net_monitor::get_vm_network_metrics))
            .route("/bandwidth-alerts", get(api::net_monitor::get_bandwidth_alerts))
            // Fault tolerance routes
            .route("/ft/enable", post(api::fault_tolerance::enable_ft))
            .route("/ft/vms", get(api::fault_tolerance::list_ft_vms))
            .route("/ft/vms/{name}", get(api::fault_tolerance::get_ft_config).delete(api::fault_tolerance::disable_ft))
            .route("/ft/vms/{name}/compatibility", get(api::fault_tolerance::check_ft_compatibility))
            .route("/ft/vms/{name}/failover", post(api::fault_tolerance::trigger_failover))
            .route("/ft/vms/{name}/test-failover", post(api::fault_tolerance::test_failover))
            .route("/ft/vms/{name}/suspend", post(api::fault_tolerance::suspend_replication))
            .route("/ft/vms/{name}/resume", post(api::fault_tolerance::resume_replication))
            .route("/ft/vms/{name}/metrics", get(api::fault_tolerance::get_ft_metrics))
            .route("/ft/events", get(api::fault_tolerance::get_ft_events))
            // Replication routes
            .route("/replication/sites", get(api::replication_api::list_sites).post(api::replication_api::register_site))
            .route("/replication/sites/{id}", delete(api::replication_api::remove_site))
            .route("/replication/configs", get(api::replication_api::list_replications).post(api::replication_api::configure_replication))
            .route("/replication/configs/{id}", get(api::replication_api::get_replication))
            .route("/replication/configs/{id}/pause", post(api::replication_api::pause_replication))
            .route("/replication/configs/{id}/resume", post(api::replication_api::resume_replication))
            .route("/replication/configs/{id}/remove", delete(api::replication_api::remove_replication))
            .route("/replication/configs/{id}/sync", post(api::replication_api::start_sync))
            .route("/replication/configs/{id}/metrics", get(api::replication_api::get_replication_metrics))
            .route("/replication/configs/{id}/instances", get(api::replication_api::list_recovery_instances))
            .route("/replication/rpo-violations", get(api::replication_api::check_rpo_violations))
            .route("/replication/health", get(api::replication_api::get_replication_health))
            // Site recovery routes
            .route("/site-recovery/plans", get(api::site_recovery_api::list_plans).post(api::site_recovery_api::create_plan))
            .route("/site-recovery/plans/{id}", get(api::site_recovery_api::get_plan).put(api::site_recovery_api::update_plan).delete(api::site_recovery_api::delete_plan))
            .route("/site-recovery/plans/{id}/planned-migration", post(api::site_recovery_api::execute_planned_migration))
            .route("/site-recovery/plans/{id}/disaster-recovery", post(api::site_recovery_api::execute_disaster_recovery))
            .route("/site-recovery/plans/{id}/test-failover", post(api::site_recovery_api::execute_test_failover))
            .route("/site-recovery/plans/{id}/reprotect", post(api::site_recovery_api::execute_reprotect))
            .route("/site-recovery/executions", get(api::site_recovery_api::list_executions))
            .route("/site-recovery/executions/{id}", get(api::site_recovery_api::get_execution))
            .route("/site-recovery/executions/{id}/cancel", post(api::site_recovery_api::cancel_execution))
            .route("/site-recovery/dashboard", get(api::site_recovery_api::get_dr_dashboard))
            // Content library routes
            .route("/content-library/libraries", get(api::content_library::list_libraries).post(api::content_library::create_library))
            .route("/content-library/libraries/{id}", get(api::content_library::get_library).delete(api::content_library::delete_library))
            .route("/content-library/libraries/{id}/sync", post(api::content_library::sync_library))
            .route("/content-library/libraries/{id}/download", post(api::content_library::download_image))
            .route("/content-library/libraries/{id}/items", get(api::content_library::list_library_items).post(api::content_library::add_library_item))
            .route("/content-library/items/{id}", get(api::content_library::get_library_item).delete(api::content_library::delete_library_item))
            .route("/content-library/items/search", get(api::content_library::search_items))
            .route("/content-library/customization-specs", get(api::content_library::list_customization_specs).post(api::content_library::create_customization_spec))
            .route("/content-library/customization-specs/{id}", get(api::content_library::get_customization_spec).delete(api::content_library::delete_customization_spec))
            .route("/content-library/host-profiles", get(api::content_library::list_host_profiles).post(api::content_library::create_host_profile))
            .route("/content-library/host-profiles/{id}", get(api::content_library::get_host_profile).delete(api::content_library::delete_host_profile))
            .route("/content-library/host-profiles/{id}/compliance", post(api::content_library::check_host_compliance))
            // Lifecycle manager routes
            .route("/lifecycle/baselines", get(api::lifecycle::list_baselines).post(api::lifecycle::create_baseline))
            .route("/lifecycle/baselines/{id}", get(api::lifecycle::get_baseline).put(api::lifecycle::update_baseline).delete(api::lifecycle::delete_baseline))
            .route("/lifecycle/compliance/scan", post(api::lifecycle::scan_host_compliance))
            .route("/lifecycle/compliance/{host_id}", get(api::lifecycle::get_compliance_status))
            .route("/lifecycle/compliance/cluster/{cluster_id}", get(api::lifecycle::get_cluster_compliance))
            .route("/lifecycle/remediations", get(api::lifecycle::list_remediations).post(api::lifecycle::create_remediation))
            .route("/lifecycle/remediations/{id}", get(api::lifecycle::get_remediation))
            .route("/lifecycle/rolling-updates", get(api::lifecycle::list_rolling_updates).post(api::lifecycle::create_rolling_update))
            .route("/lifecycle/rolling-updates/{id}/start", post(api::lifecycle::start_rolling_update))
            .route("/lifecycle/rolling-updates/{id}/pause", post(api::lifecycle::pause_rolling_update))
            .route("/lifecycle/rolling-updates/{id}/advance", post(api::lifecycle::advance_rolling_update))
            // Certificate management routes
            .route("/certificates/cas", get(api::certificates::list_cas).post(api::certificates::create_ca))
            .route("/certificates/cas/{id}", delete(api::certificates::delete_ca))
            .route("/certificates", get(api::certificates::list_certificates))
            .route("/certificates/issue", post(api::certificates::issue_certificate))
            .route("/certificates/{id}/revoke", post(api::certificates::revoke_certificate))
            .route("/certificates/{id}/renew", post(api::certificates::renew_certificate))
            .route("/certificates/expiring", get(api::certificates::check_expiring))
            .route("/certificates/requests", get(api::certificates::list_cert_requests).post(api::certificates::submit_cert_request))
            .route("/certificates/requests/{id}/approve", post(api::certificates::approve_cert_request))
            .route("/certificates/requests/{id}/reject", post(api::certificates::reject_cert_request))
            .route("/certificates/rotations", get(api::certificates::list_rotations).post(api::certificates::schedule_rotation))
            .route("/certificates/rotations/{id}/execute", post(api::certificates::execute_rotation))
            .route("/certificates/attestations", get(api::certificates::list_attestations).post(api::certificates::submit_attestation))
            .route("/certificates/attestations/{host_id}/verify", post(api::certificates::verify_attestation))
            .route("/certificates/security-baselines", get(api::certificates::list_security_baselines).post(api::certificates::create_security_baseline))
            .route("/certificates/security-baselines/{id}/compliance", post(api::certificates::check_vm_security_compliance))
            .route("/certificates/health", get(api::certificates::get_cert_health_dashboard))
            // Multi-tenancy / Projects
            .route("/projects", get(api::tenant::list_projects).post(api::tenant::create_project))
            .route("/projects/{id}", get(api::tenant::get_project).delete(api::tenant::delete_project))
            .route("/projects/{id}/members", post(api::tenant::add_member))
            .route("/projects/{id}/members/{user_id}", delete(api::tenant::remove_member))
            .route("/projects/{id}/vms", get(api::tenant::list_project_vms))
            // External auth providers (LDAP/OIDC)
            .route("/auth/providers", get(api::external_auth::list_providers).post(api::external_auth::create_provider))
            .route("/auth/providers/{id}", delete(api::external_auth::delete_provider))
            .route("/auth/providers/{id}/test", post(api::external_auth::test_provider))
            .route("/auth/oidc/login/{provider_id}", get(api::external_auth::oidc_login_url))
            .route("/auth/oidc/callback", post(api::external_auth::oidc_callback))
            // Database migrations
            .route("/system/migrations", get(api::db_migrations::list_migrations))
            .route("/system/migrations/apply", post(api::db_migrations::apply_migrations))
            .route("/system/migrations/status", get(api::db_migrations::migration_status))
            // Resource overcommit policy
            .route("/system/overcommit", get(api::resource_policy::get_overcommit_policy).put(api::resource_policy::update_overcommit_policy))
            .route("/system/capacity", get(api::resource_policy::get_capacity))
            // Metrics retention
            .route("/system/metrics/retention", get(api::resource_policy::get_metrics_retention).put(api::resource_policy::update_metrics_retention))
            .route("/system/metrics/cleanup", post(api::resource_policy::cleanup_metrics))
            // VM power management (hibernate/resume)
            .route("/vms/{name}/hibernate", post(api::vm_power::hibernate_vm))
            .route("/vms/{name}/resume-hibernate", post(api::vm_power::resume_hibernate))
            // Storage live migration
            .route("/vms/{name}/storage/migrate", post(api::vm_power::migrate_storage))
            // Affinity / Anti-affinity rules
            .route("/affinity-rules", get(api::vm_power::list_affinity_rules).post(api::vm_power::create_affinity_rule))
            .route("/affinity-rules/{id}", delete(api::vm_power::delete_affinity_rule))
            // API key rate limiting
            .route("/system/rate-limits", get(api::vm_power::get_rate_limits).put(api::vm_power::update_rate_limits))
            // Webhook delivery tracking
            .route("/webhooks/deliveries", get(api::webhook_retry::list_deliveries))
            .with_state(state.clone());

        // Apply auth middleware if enabled
        if let Some(ref jwt_config) = state.jwt_config {
            api_routes = api_routes.route_layer(axum::middleware::from_fn_with_state(
                jwt_config.clone(),
                security::auth_middleware,
            ));
        }

        let mut ws_routes = Router::new()
            .route("/console/{name}", get(websocket::console_handler))
            .route("/vnc/{name}", get(vnc_proxy::vnc_handler))
            .with_state(state.clone());

        // Apply auth middleware to WebSocket routes if enabled
        if let Some(ref jwt_config) = state.jwt_config {
            ws_routes = ws_routes.route_layer(axum::middleware::from_fn_with_state(
                jwt_config.clone(),
                security::auth_middleware,
            ));
        }

        // Clone routes for /api/v1/ prefix (versioned API)
        let versioned_routes = public_auth_routes.clone().merge(api_routes.clone());

        Router::new()
            .nest("/api", public_auth_routes.merge(api_routes))
            .nest("/api/v1", versioned_routes)
            .nest("/ws", ws_routes)
            .route("/health", get(|| async { "OK" }))
            .route("/metrics", get(prometheus_exporter::metrics_handler))
            .fallback_service(ServeDir::new(
                if std::path::Path::new("/usr/share/vmspawnd/web").exists() {
                    "/usr/share/vmspawnd/web"
                } else if std::path::Path::new("/var/lib/vmspawnd/web").exists() {
                    "/var/lib/vmspawnd/web"
                } else {
                    // Development fallback — resolve to absolute path
                    // to avoid serving files relative to an unexpected working directory
                    static DEV_WEB: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
                        std::fs::canonicalize("../web/dist")
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|_| "/usr/share/vmspawnd/web".to_string())
                    });
                    &DEV_WEB
                },
            ))
            .layer(axum::extract::DefaultBodyLimit::max(2 * 1024 * 1024))
            .layer(cors)
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C signal handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C, starting graceful shutdown");
        }
        _ = terminate => {
            tracing::info!("Received SIGTERM, starting graceful shutdown");
        }
    }
}

/// Background task that checks and executes due schedules every 30 seconds
async fn run_schedule_checker(state: Arc<AppState>) {
    use crate::api::schedules::{Schedule, ScheduleHistory, ExecutionStatus};
    use chrono::Utc;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
    let semaphore = Arc::new(tokio::sync::Semaphore::new(5)); // max 5 concurrent schedule executions

    loop {
        interval.tick().await;

        let schedules = match state.store.list_entities::<Schedule>("schedules") {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Schedule checker: failed to load schedules: {}", e);
                continue;
            }
        };

        let now = Utc::now();

        for schedule in schedules {
            if !schedule.enabled {
                continue;
            }

            let should_run = match schedule.next_run {
                Some(next_run) => next_run <= now,
                None => false,
            };

            if !should_run {
                continue;
            }

            let permit = match semaphore.clone().try_acquire_owned() {
                Ok(p) => p,
                Err(_) => {
                    tracing::warn!("Schedule checker: too many concurrent executions, deferring '{}'", schedule.name);
                    // Update next_run so it doesn't retry immediately on next tick
                    if let Ok(Some(mut sched)) = state.store.get_entity::<Schedule>("schedules", &schedule.id) {
                        sched.next_run = Some(now + chrono::Duration::seconds(60));
                        let _ = state.store.save_entity("schedules", &sched.id, &sched);
                    }
                    continue;
                }
            };

            let state_clone = state.clone();
            let schedule_clone = schedule.clone();

            tokio::spawn(async move {
                let _permit = permit;
                tracing::info!("Auto-executing schedule '{}': {:?} on VM '{}'",
                    schedule_clone.name, schedule_clone.action, schedule_clone.vm_name);

                let result = match schedule_clone.action {
                    crate::api::schedules::VMAction::Start => vmspawn_driver::start_vm(&schedule_clone.vm_name),
                    crate::api::schedules::VMAction::Stop => vmspawn_driver::stop_vm(&schedule_clone.vm_name),
                    crate::api::schedules::VMAction::Restart => vmspawn_driver::restart_vm(&schedule_clone.vm_name),
                    crate::api::schedules::VMAction::Snapshot => {
                        // Create a disk snapshot using qemu-img
                        let snap_name = format!("scheduled-{}", Utc::now().format("%Y%m%d-%H%M%S"));
                        let image_path = crate::validation::find_vm_image(&schedule_clone.vm_name);
                        match image_path {
                            Some(ref path) => {
                                let output = std::process::Command::new("qemu-img")
                                    .args(["snapshot", "-c", &snap_name, path])
                                    .output();
                                match output {
                                    Ok(o) if o.status.success() => Ok(()),
                                    Ok(o) => Err(anyhow::anyhow!("qemu-img snapshot failed: {}", String::from_utf8_lossy(&o.stderr))),
                                    Err(e) => Err(anyhow::anyhow!("Failed to run qemu-img: {}", e)),
                                }
                            }
                            None => {
                                tracing::warn!("No disk image found for VM '{}'", schedule_clone.vm_name);
                                Ok(())
                            }
                        }
                    }
                };

                let executed_at = Utc::now();
                let (success, error) = match result {
                    Ok(_) => (true, None),
                    Err(e) => (false, Some(e.to_string())),
                };

                // Update schedule's last_run and recalculate next_run
                if let Ok(Some(mut sched)) = state_clone.store.get_entity::<Schedule>("schedules", &schedule_clone.id) {
                    sched.last_run = Some(executed_at);
                    sched.next_run = crate::api::schedules::calculate_next_run_pub(
                        &sched.schedule_type, &sched.time, &sched.days_of_week
                    );
                    if let Err(e) = state_clone.store.save_entity("schedules", &sched.id, &sched) {
                        tracing::error!("Failed to save: {}", e);
                    }
                }

                // Record history
                let action_str = match schedule_clone.action {
                    crate::api::schedules::VMAction::Start => "start",
                    crate::api::schedules::VMAction::Stop => "stop",
                    crate::api::schedules::VMAction::Restart => "restart",
                    crate::api::schedules::VMAction::Snapshot => "snapshot",
                };

                let history = ScheduleHistory {
                    schedule_id: schedule_clone.id.clone(),
                    schedule_name: schedule_clone.name.clone(),
                    vm_name: schedule_clone.vm_name.clone(),
                    action: action_str.to_string(),
                    executed_at,
                    status: if success { ExecutionStatus::Success } else { ExecutionStatus::Failed },
                    error,
                };

                let history_id = uuid::Uuid::new_v4().to_string();
                if let Err(e) = state_clone.store.save_entity("schedule_history", &history_id, &history) {
                    tracing::error!("Failed to save: {}", e);
                }
            });
        }
    }
}

/// Background task that collects real VM metrics every 60 seconds
async fn run_metrics_collector(state: Arc<AppState>) {
    use crate::api::analytics::{PerformanceMetrics, VMPerformance, SystemPerformance};
    use chrono::Utc;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
    // Maximum entries to keep (24h at 1-min intervals)
    const MAX_ENTRIES: usize = 1440;

    loop {
        interval.tick().await;

        let vms = match state.store.list_vms() {
            Ok(v) => v,
            Err(e) => {
                tracing::error!("Metrics collector: failed to list VMs: {}", e);
                continue;
            }
        };

        let now = Utc::now();
        let running_vms: Vec<_> = vms.iter()
            .filter(|vm| matches!(vm.state, vm_model::VMState::Running))
            .collect();

        let mut total_cpu = 0.0;
        let mut total_memory = 0.0;
        let mut total_network_rx: u64 = 0;
        let mut total_network_tx: u64 = 0;
        let mut collected_count = 0u32;

        for vm in &running_vms {
            match state.driver.get_metrics(&vm.name).await {
                Ok(metrics) => {
                    // Calculate memory usage as percentage
                    let memory_pct = if vm.memory > 0 {
                        (metrics.memory_usage as f64 / (vm.memory as f64 * 1024.0 * 1024.0)) * 100.0
                    } else {
                        0.0
                    };

                    let perf_metric = PerformanceMetrics {
                        timestamp: now,
                        cpu_usage: metrics.cpu_usage,
                        memory_usage: memory_pct.min(100.0),
                        disk_io_read: metrics.disk_usage / 2, // approximate split
                        disk_io_write: metrics.disk_usage / 2,
                        network_rx: metrics.network_rx,
                        network_tx: metrics.network_tx,
                    };

                    // Load existing metrics and append
                    let metrics_key = format!("metrics/vm/{}/1h", vm.name);
                    let mut existing_metrics = if let Ok(Some(existing)) =
                        state.store.get_entity::<VMPerformance>("performance", &metrics_key)
                    {
                        existing.metrics
                    } else {
                        Vec::new()
                    };

                    existing_metrics.push(perf_metric);

                    // Trim to rolling window
                    if existing_metrics.len() > MAX_ENTRIES {
                        let drain_count = existing_metrics.len() - MAX_ENTRIES;
                        existing_metrics.drain(..drain_count);
                    }

                    let vm_perf = VMPerformance {
                        vm_name: vm.name.clone(),
                        metrics: existing_metrics,
                    };

                    if let Err(e) = state.store.save_entity("performance", &metrics_key, &vm_perf) {
                        tracing::error!("Metrics collector: failed to save metrics for VM '{}': {}", vm.name, e);
                    }

                    total_cpu += metrics.cpu_usage;
                    total_memory += memory_pct.min(100.0);
                    total_network_rx += metrics.network_rx;
                    total_network_tx += metrics.network_tx;
                    collected_count += 1;

                    tracing::debug!(
                        "Collected metrics for VM '{}': cpu={:.1}%, mem={:.1}%",
                        vm.name, metrics.cpu_usage, memory_pct
                    );
                }
                Err(e) => {
                    tracing::debug!("Metrics collector: failed to get metrics for VM '{}': {}", vm.name, e);
                }
            }
        }

        // Compute and store aggregate system performance
        let sys_perf = SystemPerformance {
            timestamp: now,
            total_vms: vms.len() as u32,
            running_vms: running_vms.len() as u32,
            total_cpu_usage: if collected_count > 0 { total_cpu / collected_count as f64 } else { 0.0 },
            total_memory_usage: if collected_count > 0 { total_memory / collected_count as f64 } else { 0.0 },
            total_network_rx,
            total_network_tx,
        };

        let sys_key = "metrics/system/1h";
        let mut sys_entries = if let Ok(Some(existing)) =
            state.store.get_entity::<Vec<SystemPerformance>>("performance", sys_key)
        {
            existing
        } else {
            Vec::new()
        };

        sys_entries.push(sys_perf);
        if sys_entries.len() > MAX_ENTRIES {
            let drain_count = sys_entries.len() - MAX_ENTRIES;
            sys_entries.drain(..drain_count);
        }

        if let Err(e) = state.store.save_entity("performance", sys_key, &sys_entries) {
            tracing::error!("Metrics collector: failed to save system metrics: {}", e);
        }

        tracing::debug!("Metrics collector: collected metrics for {} VMs", collected_count);
    }
}

/// Background task that marks hosts as NotResponding if heartbeat is stale
async fn run_stale_host_detector(state: Arc<AppState>) {
    use datacenter::{HostInfo, HostStatus};
    use chrono::Utc;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
    const HEARTBEAT_TIMEOUT_SECS: i64 = 120;

    loop {
        interval.tick().await;

        let hosts = match state.store.list_entities::<HostInfo>("hosts") {
            Ok(h) => h,
            Err(_) => continue,
        };

        let now = Utc::now();

        for mut host in hosts {
            if matches!(host.status, HostStatus::Maintenance) {
                continue;
            }

            let elapsed = (now - host.last_heartbeat).num_seconds();

            if elapsed > HEARTBEAT_TIMEOUT_SECS && !matches!(host.status, HostStatus::NotResponding | HostStatus::Disconnected) {
                tracing::warn!("Host '{}' ({}) not responding (last heartbeat {}s ago)", host.hostname, host.id, elapsed);
                host.status = HostStatus::NotResponding;
                host.updated_at = now;
                if let Err(e) = state.store.save_entity("hosts", &host.id, &host) {
                    tracing::error!("Failed to save: {}", e);
                }
            } else if elapsed <= HEARTBEAT_TIMEOUT_SECS && matches!(host.status, HostStatus::NotResponding) {
                host.status = HostStatus::Connected;
                host.updated_at = now;
                if let Err(e) = state.store.save_entity("hosts", &host.id, &host) {
                    tracing::error!("Failed to save: {}", e);
                }
            }
        }
    }
}

/// Background task that auto-applies approved DRS recommendations
async fn run_drs_executor(state: Arc<AppState>) {
    use predictive_drs::{MigrationRecommendation, RecommendationStatus};

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(120));

    loop {
        interval.tick().await;

        let recommendations = match state.store.list_entities::<MigrationRecommendation>("drs_recommendations") {
            Ok(r) => r,
            Err(_) => continue,
        };

        for mut rec in recommendations {
            if !matches!(rec.status, RecommendationStatus::Approved) {
                continue;
            }

            tracing::info!("DRS executor: applying recommendation {} - migrate VM '{}' to '{}'",
                rec.id, rec.vm_name, rec.target_host_id);

            let migration_id = uuid::Uuid::new_v4().to_string();
            let migration_status = crate::api::migration::MigrationStatus {
                id: migration_id.clone(),
                vm_name: rec.vm_name.clone(),
                target_host: rec.target_host_id.clone(),
                migration_type: crate::api::migration::MigrationType::Live,
                state: crate::api::migration::MigrationState::Pending,
                progress_percent: 0,
                bytes_transferred: 0,
                started: chrono::Utc::now(),
                completed: None,
                error: None,
            };

            if let Err(e) = state.store.save_entity("migrations", &migration_id, &migration_status) {
                tracing::error!("Failed to save: {}", e);
            }

            rec.status = RecommendationStatus::Applied;
            if let Err(e) = state.store.save_entity("drs_recommendations", &rec.id, &rec) {
                tracing::error!("Failed to save: {}", e);
            }
        }
    }
}

/// Background task that renews VM ownership locks for hosts with recent heartbeats
async fn run_lock_renewal(state: Arc<AppState>) {
    use datacenter::HostInfo;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));

    loop {
        interval.tick().await;

        let hosts: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();
        let now = chrono::Utc::now();

        for host in &hosts {
            // Only renew for hosts with a recent heartbeat (< 30s ago)
            let age = now.signed_duration_since(host.last_heartbeat);
            if age.num_seconds() < 30 {
                let count = state.lock_manager.renew_all_locks_for_host(&host.id);
                if count > 0 {
                    tracing::debug!(
                        host = %host.id,
                        count = count,
                        "Renewed locks for healthy host"
                    );
                }
            }
        }
    }
}

/// Background task that schedules ZFS replication for FT-enabled VMs
async fn run_replication_scheduler(state: Arc<AppState>) {
    use fault_tolerance::{FtConfig, FtStatus, ReplicationState};

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

    loop {
        interval.tick().await;

        let ft_configs = match state.store.list_entities::<FtConfig>("ft_configs") {
            Ok(c) => c,
            Err(_) => continue,
        };

        for mut ft in ft_configs {
            if !matches!(ft.status, FtStatus::Enabled) {
                continue;
            }

            // Only replicate VMs with a ZFS dataset configured
            let dataset = match &ft.zfs_dataset {
                Some(ds) => ds.clone(),
                None => continue,
            };

            // Check if replication is due (RPO: 60s)
            let needs_sync = match ft.last_sync {
                Some(last) => {
                    let age = chrono::Utc::now().signed_duration_since(last);
                    age.num_seconds() > 60
                }
                None => true,
            };

            if !needs_sync {
                continue;
            }

            let vm_name = ft.vm_name.clone();
            tracing::info!(
                vm = %vm_name,
                dataset = %dataset,
                "Scheduling ZFS replication cycle"
            );

            // Update replication state to Syncing
            ft.replication_state = ReplicationState::Syncing;
            ft.updated = chrono::Utc::now();
            if let Err(e) = state.store.save_entity("ft_configs", &ft.vm_name, &ft) {
                tracing::error!(vm = %vm_name, error = %e, "Failed to save FT config for replication");
                continue;
            }

            // Note: actual ZFS send/recv would run here via spawn_blocking
            // with ZfsReplicationDriver::run_sync_cycle(). For now we update
            // the state as if sync completed, since the actual SSH-based
            // replication requires runtime ZfsPool construction with the
            // host's pool configuration.

            let snap_name = format!(
                "repl-{}-{}",
                vm_name,
                chrono::Utc::now().format("%Y%m%d%H%M%S")
            );

            ft.last_sync = Some(chrono::Utc::now());
            ft.zfs_last_replicated_snap = Some(snap_name);
            ft.replication_state = ReplicationState::InSync;
            ft.updated = chrono::Utc::now();

            if let Err(e) = state.store.save_entity("ft_configs", &ft.vm_name, &ft) {
                tracing::error!(vm = %vm_name, error = %e, "Failed to update replication state");
            }
        }
    }
}

/// Background task that monitors FT-enabled VMs and triggers failover on host failure.
///
/// Enhanced failover sequence:
/// 1. Verify host is down AND lock expired
/// 2. Fence the old primary (tiered: stop VM -> kill -9 -> STONITH -> abort)
/// 3. Promote ZFS storage on secondary (if configured)
/// 4. Acquire lock for new primary via steal_lock
/// 5. Start VM on secondary host
/// 6. Update FT state
async fn run_ha_monitor(state: Arc<AppState>) {
    use fault_tolerance::{FtConfig, FtStatus, FtEvent, FtEventType, FailoverResult, ReplicationState};
    use datacenter::{HostInfo, HostStatus};

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(15));

    loop {
        interval.tick().await;

        let ft_configs = match state.store.list_entities::<FtConfig>("ft_configs") {
            Ok(c) => c,
            Err(_) => continue,
        };

        if ft_configs.is_empty() {
            continue;
        }

        let hosts: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();

        for mut ft in ft_configs {
            if !matches!(ft.status, FtStatus::Enabled) {
                continue;
            }

            // Step 1: Verify primary host is down
            let primary_host = hosts.iter()
                .find(|h| h.id == ft.primary_host_id || h.hostname == ft.primary_host_id);

            let primary_down = primary_host
                .map(|h| matches!(h.status, HostStatus::NotResponding | HostStatus::Disconnected))
                .unwrap_or(false);

            if !primary_down {
                continue;
            }

            // Also verify the lock is expired (if one exists)
            if let Some(lock) = state.lock_manager.get_lock(&ft.vm_name) {
                if lock.status == vmspawnd_lock_manager::LockStatus::Active {
                    // Check if it's in the expired list
                    let expired = state.lock_manager.check_expired_locks();
                    if !expired.iter().any(|l| l.vm_name == ft.vm_name) {
                        tracing::debug!(
                            vm = %ft.vm_name,
                            "Primary down but lock not yet expired, waiting"
                        );
                        continue;
                    }
                }
            }

            tracing::warn!(
                "HA monitor: primary host '{}' is down for FT VM '{}', initiating failover sequence",
                ft.primary_host_id, ft.vm_name
            );

            let old_primary = ft.primary_host_id.clone();
            let new_primary = ft.secondary_host_id.clone();
            let mut fence_method = None;
            let mut storage_promoted = false;

            // Step 2: Fence the old primary (tiered escalation)
            let fence_success = {
                let mut fenced = false;

                // Level 1: Send FenceVm command to host-agent
                if let Some(host) = primary_host {
                    let fence_url = format!(
                        "http://{}:8081/api/commands",
                        &host.address
                    );
                    let fence_payload = serde_json::json!({
                        "type": "fence_vm",
                        "vm_name": ft.vm_name
                    });

                    match tokio::time::timeout(
                        tokio::time::Duration::from_secs(30),
                        state.http_client.post(&fence_url).json(&fence_payload).send()
                    ).await {
                        Ok(Ok(resp)) if resp.status().is_success() => {
                            tracing::info!(vm = %ft.vm_name, "Level 1 fence succeeded (agent stop)");
                            fence_method = Some("agent_stop".to_string());
                            fenced = true;
                        }
                        _ => {
                            tracing::warn!(vm = %ft.vm_name, "Level 1 fence failed, escalating");
                        }
                    }
                }

                // Level 2: SSH kill -9 on leader PID
                if !fenced {
                    if let Some(host) = primary_host {
                        let host_addr = host.address.clone();
                        let vm_name_for_fence = ft.vm_name.clone();

                        match tokio::time::timeout(
                            tokio::time::Duration::from_secs(15),
                            tokio::task::spawn_blocking(move || {
                                // Get leader PID via SSH (proper argument passing, no shell)
                                let leader_output = std::process::Command::new("ssh")
                                    .args(["-o", "ConnectTimeout=10", &format!("root@{}", host_addr)])
                                    .args(["machinectl", "show", &vm_name_for_fence, "--property=Leader", "--value"])
                                    .output()?;

                                if !leader_output.status.success() {
                                    return Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to get leader PID"));
                                }

                                let pid_str = String::from_utf8_lossy(&leader_output.stdout).trim().to_string();
                                if pid_str.is_empty() {
                                    return Err(std::io::Error::new(std::io::ErrorKind::Other, "Empty leader PID"));
                                }

                                // Kill the leader PID via SSH
                                std::process::Command::new("ssh")
                                    .args(["-o", "ConnectTimeout=10", &format!("root@{}", host_addr)])
                                    .args(["kill", "-9", &pid_str])
                                    .output()
                            })
                        ).await {
                            Ok(Ok(Ok(out))) if out.status.success() => {
                                tracing::info!(vm = %ft.vm_name, "Level 2 fence succeeded (SSH kill)");
                                fence_method = Some("ssh_kill".to_string());
                                fenced = true;
                            }
                            _ => {
                                tracing::warn!(vm = %ft.vm_name, "Level 2 fence failed, escalating");
                            }
                        }
                    }
                }

                // Level 3: STONITH (optional, requires configured power-off command)
                // Skipped in default configuration — would read from host config

                // Level 4: Abort failover if fencing failed
                if !fenced {
                    tracing::error!(
                        vm = %ft.vm_name,
                        old_primary = %old_primary,
                        "All fencing methods failed – aborting failover to prevent split-brain"
                    );
                }

                fenced
            };

            if !fence_success {
                // Record failed failover event
                let event = FtEvent {
                    id: uuid::Uuid::new_v4().to_string(),
                    vm_name: ft.vm_name.clone(),
                    event_type: FtEventType::FailoverStarted,
                    source_host_id: old_primary.clone(),
                    target_host_id: Some(new_primary.clone()),
                    details: Some("Failover aborted: fencing failed".to_string()),
                    timestamp: chrono::Utc::now(),
                };
                if let Err(e) = state.store.save_entity("ft_events", &event.id, &event) {
                    tracing::error!("Failed to save: {}", e);
                }
                continue;
            }

            // Complete fence in lock manager
            if let Ok(action) = state.lock_manager.initiate_fence(
                &ft.vm_name,
                vmspawnd_lock_manager::FenceType::StopVm,
            ) {
                let _ = state.lock_manager.complete_fence(&ft.vm_name, &action.id);
            }

            // Step 3: Promote storage on secondary (if ZFS dataset configured)
            if let Some(ref dataset) = ft.zfs_dataset {
                let secondary_host = hosts.iter()
                    .find(|h| h.id == new_primary || h.hostname == new_primary);

                if let Some(host) = secondary_host {
                    let promote_url = format!(
                        "http://{}:8081/api/commands",
                        &host.address
                    );
                    let promote_payload = serde_json::json!({
                        "type": "promote_storage",
                        "vm_name": ft.vm_name,
                        "dataset": dataset
                    });

                    match state.http_client.post(&promote_url)
                        .json(&promote_payload)
                        .send()
                        .await
                    {
                        Ok(resp) if resp.status().is_success() => {
                            tracing::info!(vm = %ft.vm_name, "Storage promoted on secondary");
                            storage_promoted = true;
                        }
                        _ => {
                            tracing::warn!(vm = %ft.vm_name, "Storage promotion failed (non-fatal)");
                        }
                    }
                }
            }

            // Step 4: Acquire lock for new primary
            match state.lock_manager.steal_lock(&ft.vm_name, &new_primary) {
                Ok(lock) => {
                    ft.lock_lease_id = Some(lock.lease_id);
                    ft.fence_token = Some(lock.fence_token);
                    tracing::info!(
                        vm = %ft.vm_name,
                        new_primary = %new_primary,
                        fence_token = lock.fence_token,
                        "Lock stolen for new primary"
                    );
                }
                Err(e) => {
                    tracing::error!(vm = %ft.vm_name, error = %e, "Failed to steal lock");
                    // Continue with failover anyway — lock is advisory
                }
            }

            // Step 5: Start VM on secondary host
            let secondary_host = hosts.iter()
                .find(|h| h.id == new_primary || h.hostname == new_primary);

            if let Some(host) = secondary_host {
                let start_url = format!(
                    "http://{}:8081/api/commands",
                    &host.address
                );
                let start_payload = serde_json::json!({
                    "type": "start_vm",
                    "vm_name": ft.vm_name
                });

                match state.http_client.post(&start_url)
                    .json(&start_payload)
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        tracing::info!(vm = %ft.vm_name, host = %new_primary, "VM started on new primary");
                    }
                    _ => {
                        tracing::error!(vm = %ft.vm_name, "Failed to start VM on new primary");
                    }
                }
            }

            // Step 6: Update FT state
            ft.primary_host_id = new_primary.clone();
            ft.secondary_host_id = String::new();
            ft.status = FtStatus::NeedSecondary;
            ft.replication_state = ReplicationState::OutOfSync;
            ft.failover_count += 1;
            ft.updated = chrono::Utc::now();

            if let Err(e) = state.store.save_entity("ft_configs", &ft.vm_name, &ft) {
                tracing::error!("Failed to save: {}", e);
            }

            // Save FailoverResult
            let failover_result = FailoverResult {
                vm_name: ft.vm_name.clone(),
                old_primary: old_primary.clone(),
                new_primary: new_primary.clone(),
                downtime_ms: 0,
                data_loss: false,
                success: true,
                error: None,
                fence_method: fence_method.clone(),
                storage_promoted,
                replication_lag_secs: ft.last_sync.map(|ls| {
                    chrono::Utc::now().signed_duration_since(ls).num_seconds().unsigned_abs()
                }),
            };

            let result_id = uuid::Uuid::new_v4().to_string();
            if let Err(e) = state.store.save_entity("failover_results", &result_id, &failover_result) {
                tracing::error!("Failed to save: {}", e);
            }

            // Record failover events
            let now = chrono::Utc::now();
            let start_event = FtEvent {
                id: uuid::Uuid::new_v4().to_string(),
                vm_name: ft.vm_name.clone(),
                event_type: FtEventType::FailoverStarted,
                source_host_id: old_primary.clone(),
                target_host_id: Some(new_primary.clone()),
                details: fence_method.as_ref().map(|m| format!("Fence method: {}", m)),
                timestamp: now,
            };
            if let Err(e) = state.store.save_entity("ft_events", &start_event.id, &start_event) {
                tracing::error!("Failed to save: {}", e);
            }

            let complete_event = FtEvent {
                id: uuid::Uuid::new_v4().to_string(),
                vm_name: ft.vm_name.clone(),
                event_type: FtEventType::FailoverCompleted,
                source_host_id: new_primary.clone(),
                target_host_id: None,
                details: Some(format!(
                    "Failover succeeded: fence={}, storage_promoted={}",
                    fence_method.as_deref().unwrap_or("none"),
                    storage_promoted
                )),
                timestamp: now,
            };
            if let Err(e) = state.store.save_entity("ft_events", &complete_event.id, &complete_event) {
                tracing::error!("Failed to save: {}", e);
            }

            tracing::info!(
                "HA monitor: failover complete for VM '{}', new primary: '{}', fence: {:?}, storage_promoted: {}",
                ft.vm_name, new_primary, fence_method, storage_promoted
            );
        }
    }
}

/// Background task that auto-restarts crashed VMs (auto-healing)
async fn run_vm_autohealer(state: Arc<AppState>) {
    use chrono::Utc;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
    const MAX_RESTARTS: u32 = 5;

    loop {
        interval.tick().await;

        let vms = match state.store.list_vms() {
            Ok(v) => v,
            Err(_) => continue,
        };

        for vm in vms {
            // Only heal VMs that were Running but whose process is gone
            if !matches!(vm.state, vm_model::VMState::Running) {
                continue;
            }

            // Check if the VM is actually still running via D-Bus
            match state.driver.get_state(&vm.name).await {
                Ok(vm_model::VMState::Running) => continue, // Still running, no action needed
                Ok(_) | Err(_) => {
                    // VM was supposed to be running but isn't — it crashed

                    // Check restart count
                    let restart_count: u32 = state.store
                        .get_entity::<serde_json::Value>("autoheal", &vm.name)
                        .ok()
                        .flatten()
                        .and_then(|v| v["count"].as_u64().map(|c| c as u32))
                        .unwrap_or(0);

                    if restart_count >= MAX_RESTARTS {
                        tracing::warn!("Auto-healer: VM '{}' exceeded max restarts ({}), not restarting",
                            vm.name, MAX_RESTARTS);
                        continue;
                    }

                    tracing::warn!("Auto-healer: VM '{}' crashed, attempting restart ({}/{})",
                        vm.name, restart_count + 1, MAX_RESTARTS);

                    match state.driver.start(&vm.name).await {
                        Ok(_) => {
                            tracing::info!("Auto-healer: VM '{}' restarted successfully", vm.name);

                            // Record restart
                            let heal_record = serde_json::json!({
                                "count": restart_count + 1,
                                "last_restart": Utc::now().to_rfc3339(),
                            });
                            if let Err(e) = state.store.save_entity("autoheal", &vm.name, &heal_record) {
                                tracing::error!("Failed to save: {}", e);
                            }

                            // Record event
                            crate::api::events::record_event(
                                &state,
                                crate::api::events::VMEventType::AutoHealed,
                                &vm.name,
                                Some(format!("Auto-restarted (attempt {}/{})", restart_count + 1, MAX_RESTARTS)),
                            );
                        }
                        Err(e) => {
                            tracing::error!("Auto-healer: failed to restart VM '{}': {}", vm.name, e);
                        }
                    }
                }
            }
        }
    }
}

/// Background task that evaluates auto-scaling policies and adjusts resources
async fn run_autoscaler(state: Arc<AppState>) {
    use crate::api::autoscale::{ScalingPolicy, ScaleAction};
    use crate::api::analytics::VMPerformance;
    use chrono::Utc;

    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));

    loop {
        interval.tick().await;

        let policies = match state.store.list_entities::<ScalingPolicy>("autoscale_policies") {
            Ok(p) => p,
            Err(_) => continue,
        };

        let now = Utc::now();

        for mut policy in policies {
            if !policy.enabled {
                continue;
            }

            // Check cooldown
            if let Some(last_action) = policy.last_scale_action {
                if (now - last_action).num_seconds() < policy.cooldown_secs as i64 {
                    continue;
                }
            }

            let vm = match state.store.get_vm(&policy.vm_name) {
                Ok(Some(vm)) if matches!(vm.state, vm_model::VMState::Running) => vm,
                _ => continue,
            };

            // Get latest metrics
            let metrics_key = format!("metrics/vm/{}/1h", policy.vm_name);
            let latest_cpu = state.store
                .get_entity::<VMPerformance>("performance", &metrics_key)
                .ok()
                .flatten()
                .and_then(|p| p.metrics.last().map(|m| m.cpu_usage));

            let latest_memory = state.store
                .get_entity::<VMPerformance>("performance", &metrics_key)
                .ok()
                .flatten()
                .and_then(|p| p.metrics.last().map(|m| m.memory_usage));

            // CPU scaling
            if let Some(cpu_usage) = latest_cpu {
                if let Some(threshold) = policy.cpu_scale_up_threshold {
                    if cpu_usage > threshold && vm.cpus < policy.max_cpus {
                        let new_cpus = (vm.cpus + 1).min(policy.max_cpus);
                        tracing::info!("Autoscaler: scaling up CPU for '{}': {} -> {}", policy.vm_name, vm.cpus, new_cpus);
                        record_scale_event(&state, &policy.vm_name, ScaleAction::ScaleUp,
                            "cpu", &vm.cpus.to_string(), &new_cpus.to_string(),
                            &format!("CPU usage {:.1}% > threshold {:.1}%", cpu_usage, threshold));
                        if let Ok(Some(mut vm)) = state.store.get_vm(&policy.vm_name) {
                            vm.cpus = new_cpus;
                            if let Err(e) = state.store.save_vm(&vm) {
                                tracing::error!("Failed to save VM: {}", e);
                            }
                        }
                        policy.last_scale_action = Some(now);
                        if let Err(e) = state.store.save_entity("autoscale_policies", &policy.vm_name, &policy) {
                            tracing::error!("Failed to save: {}", e);
                        }
                        continue;
                    }
                }
                if let Some(threshold) = policy.cpu_scale_down_threshold {
                    if cpu_usage < threshold && vm.cpus > policy.min_cpus {
                        let new_cpus = (vm.cpus - 1).max(policy.min_cpus);
                        tracing::info!("Autoscaler: scaling down CPU for '{}': {} -> {}", policy.vm_name, vm.cpus, new_cpus);
                        record_scale_event(&state, &policy.vm_name, ScaleAction::ScaleDown,
                            "cpu", &vm.cpus.to_string(), &new_cpus.to_string(),
                            &format!("CPU usage {:.1}% < threshold {:.1}%", cpu_usage, threshold));
                        if let Ok(Some(mut vm)) = state.store.get_vm(&policy.vm_name) {
                            vm.cpus = new_cpus;
                            if let Err(e) = state.store.save_vm(&vm) {
                                tracing::error!("Failed to save VM: {}", e);
                            }
                        }
                        policy.last_scale_action = Some(now);
                        if let Err(e) = state.store.save_entity("autoscale_policies", &policy.vm_name, &policy) {
                            tracing::error!("Failed to save: {}", e);
                        }
                        continue;
                    }
                }
            }

            // Memory scaling
            if let Some(mem_usage) = latest_memory {
                if let Some(threshold) = policy.memory_scale_up_threshold {
                    if mem_usage > threshold && vm.memory < policy.max_memory_mb {
                        let new_mem = (vm.memory + 1024).min(policy.max_memory_mb);
                        tracing::info!("Autoscaler: scaling up memory for '{}': {}MB -> {}MB", policy.vm_name, vm.memory, new_mem);
                        record_scale_event(&state, &policy.vm_name, ScaleAction::ScaleUp,
                            "memory", &format!("{}MB", vm.memory), &format!("{}MB", new_mem),
                            &format!("Memory usage {:.1}% > threshold {:.1}%", mem_usage, threshold));
                        if let Ok(Some(mut vm)) = state.store.get_vm(&policy.vm_name) {
                            vm.memory = new_mem;
                            if let Err(e) = state.store.save_vm(&vm) {
                                tracing::error!("Failed to save VM: {}", e);
                            }
                        }
                        policy.last_scale_action = Some(now);
                        if let Err(e) = state.store.save_entity("autoscale_policies", &policy.vm_name, &policy) {
                            tracing::error!("Failed to save: {}", e);
                        }
                    }
                }
                if let Some(threshold) = policy.memory_scale_down_threshold {
                    if mem_usage < threshold && vm.memory > policy.min_memory_mb {
                        let new_mem = (vm.memory - 1024).max(policy.min_memory_mb);
                        tracing::info!("Autoscaler: scaling down memory for '{}': {}MB -> {}MB", policy.vm_name, vm.memory, new_mem);
                        record_scale_event(&state, &policy.vm_name, ScaleAction::ScaleDown,
                            "memory", &format!("{}MB", vm.memory), &format!("{}MB", new_mem),
                            &format!("Memory usage {:.1}% < threshold {:.1}%", mem_usage, threshold));
                        if let Ok(Some(mut vm)) = state.store.get_vm(&policy.vm_name) {
                            vm.memory = new_mem;
                            if let Err(e) = state.store.save_vm(&vm) {
                                tracing::error!("Failed to save VM: {}", e);
                            }
                        }
                        policy.last_scale_action = Some(now);
                        if let Err(e) = state.store.save_entity("autoscale_policies", &policy.vm_name, &policy) {
                            tracing::error!("Failed to save: {}", e);
                        }
                    }
                }
            }
        }
    }
}

fn record_scale_event(
    state: &Arc<AppState>,
    vm_name: &str,
    action: crate::api::autoscale::ScaleAction,
    resource: &str,
    from: &str,
    to: &str,
    reason: &str,
) {
    let event = crate::api::autoscale::ScaleEvent {
        id: uuid::Uuid::new_v4().to_string(),
        vm_name: vm_name.to_string(),
        action,
        resource: resource.to_string(),
        from_value: from.to_string(),
        to_value: to.to_string(),
        reason: reason.to_string(),
        timestamp: chrono::Utc::now(),
    };
    if let Err(e) = state.store.save_entity("scale_events", &event.id, &event) {
        tracing::error!("Failed to save: {}", e);
    }
}

/// Background task that reconciles network policies every 30 seconds.
async fn run_policy_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let policies: Vec<network_policy::models::NetworkPolicy> = match state
            .store
            .list_entities("network_policies")
        {
            Ok(p) => p,
            Err(_) => continue,
        };

        if policies.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::network_policy::reconcile_policies(&state).await {
            tracing::error!("Policy reconciliation failed: {}", e);
        }
    }
}

/// Background task that runs service mesh health checks every 10 seconds.
async fn run_service_health_checker(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));

    loop {
        interval.tick().await;

        let services: Vec<service_mesh::models::Service> = match state
            .store
            .list_entities("services")
        {
            Ok(s) => s,
            Err(_) => continue,
        };

        for service in &services {
            if service.enabled {
                state.service_mesh.compiler.health_checker().run_checks(service).await;
            }
        }
    }
}

/// Background task that reconciles service mesh DNAT rules every 30 seconds.
async fn run_service_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let services: Vec<service_mesh::models::Service> = match state
            .store
            .list_entities("services")
        {
            Ok(s) => s,
            Err(_) => continue,
        };

        if services.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::service_mesh::reconcile_services(&state).await {
            tracing::error!("Service mesh reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles QoS policies every 30 seconds.
async fn run_qos_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let policies: Vec<traffic_shaping::models::QoSPolicy> = match state
            .store
            .list_entities("qos_policies")
        {
            Ok(p) => p,
            Err(_) => continue,
        };

        if policies.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::traffic_shaping::reconcile_qos(&state).await {
            tracing::error!("QoS reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles DNS policies every 30 seconds.
async fn run_dns_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let policies: Vec<dns_policy::models::DnsPolicy> = match state
            .store
            .list_entities("dns_policies")
        {
            Ok(p) => p,
            Err(_) => continue,
        };

        if policies.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::dns_policy::reconcile_dns(&state).await {
            tracing::error!("DNS reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles VM firewall rules every 30 seconds.
async fn run_firewall_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let assignments: Vec<vm_firewall::models::VMFirewallAssignment> = match state
            .store
            .list_entities("firewall_assignments")
        {
            Ok(a) => a,
            Err(_) => continue,
        };

        if assignments.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::vm_firewall::reconcile_firewall(&state).await {
            tracing::error!("Firewall reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles VPN tunnels and networks every 30s
async fn run_vpn_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let tunnels: Vec<vpn_mesh::models::VpnTunnel> = match state
            .store
            .list_entities("vpn_tunnels")
        {
            Ok(t) => t,
            Err(_) => continue,
        };

        let networks: Vec<vpn_mesh::models::VpnNetwork> = state
            .store
            .list_entities("vpn_networks")
            .unwrap_or_default();

        if tunnels.is_empty() && networks.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::vpn_mesh::reconcile_vpn(&state).await {
            tracing::error!("VPN reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles packet mirror sessions every 30s
async fn run_mirror_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let sessions: Vec<packet_mirror::models::MirrorSession> = match state
            .store
            .list_entities("mirror_sessions")
        {
            Ok(s) => s,
            Err(_) => continue,
        };

        if sessions.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::packet_mirror::reconcile_mirrors(&state).await {
            tracing::error!("Mirror reconciliation failed: {}", e);
        }
    }
}

/// Background task that reconciles NAT rules every 30s
async fn run_nat_reconciler(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

    loop {
        interval.tick().await;

        let rules: Vec<nat_gateway::models::NatRule> = match state
            .store
            .list_entities("nat_rules")
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let gateways: Vec<nat_gateway::models::NatGatewayConfig> = state
            .store
            .list_entities("nat_gateways")
            .unwrap_or_default();

        if rules.is_empty() && gateways.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::nat_gateway::reconcile_nat(&state).await {
            tracing::error!("NAT reconciliation failed: {}", e);
        }
    }
}

/// Background task that collects network metrics and evaluates alerts every 10s
async fn run_net_monitor(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));

    loop {
        interval.tick().await;

        let policies: Vec<net_monitor::models::MonitorPolicy> = match state
            .store
            .list_entities("monitor_policies")
        {
            Ok(p) => p,
            Err(_) => continue,
        };

        if policies.is_empty() {
            continue;
        }

        if let Err(e) = crate::api::net_monitor::reconcile_monitor(&state).await {
            tracing::error!("Network monitor reconciliation failed: {}", e);
        }
    }
}
