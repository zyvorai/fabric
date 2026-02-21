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

use crate::{api, config::Config, routes, websocket};

pub struct AppState {
    pub store: StateStore,
    pub config: Config,
    pub storage_manager: Arc<RwLock<StorageManager>>,
    pub http_client: reqwest::Client,
    pub quota_cache: Arc<std::sync::RwLock<QuotaCache>>,
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
    pub fn new(store: StateStore, config: Config) -> Result<Self> {
        // Initialize storage manager
        let storage_path = std::path::PathBuf::from("/var/lib/vmspawnd/storage");
        let storage_manager = StorageManager::new(&storage_path)
            .map_err(|e| anyhow::anyhow!("Failed to initialize storage manager: {}", e))?;

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .pool_max_idle_per_host(10)
            .build()
            .map_err(|e| anyhow::anyhow!("Failed to create HTTP client: {}", e))?;

        let state = Arc::new(AppState {
            store,
            config,
            storage_manager: Arc::new(RwLock::new(storage_manager)),
            http_client,
            quota_cache: Arc::new(std::sync::RwLock::new(QuotaCache::new())),
        });

        Ok(Self { state })
    }

    pub async fn run(self) -> Result<()> {
        let app = build_router(self.state.clone());

        let addr: std::net::SocketAddr = self.state.config.daemon.listen.parse()?;
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        tracing::info!("Listening on {}", addr);

        // Start background scheduler for automated schedule execution
        let scheduler_state = self.state.clone();
        tokio::spawn(async move {
            run_schedule_checker(scheduler_state).await;
        });

        axum::serve(listener, app).await?;

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

    let api_routes = Router::new()
            // VM management routes
            .route("/vms", get(routes::list_vms).post(routes::create_vm))
            .route("/vms/:name", get(routes::get_vm).delete(routes::delete_vm))
            .route("/vms/:name/start", post(routes::start_vm))
            .route("/vms/:name/stop", post(routes::stop_vm))
            .route("/vms/:name/restart", post(routes::restart_vm))
            .route("/vms/:name/metrics", get(routes::get_metrics))
            .route("/vms/:name/cloud-init", post(routes::configure_cloud_init))
            // Storage pool routes
            .route("/storage/pools", get(api::storage::list_pools))
            .route("/storage/pools/:name", get(api::storage::get_pool))
            .route("/storage/pools/local", post(api::storage::create_local_pool))
            .route("/storage/pools/nfs", post(api::storage::create_nfs_pool))
            .route("/storage/pools/:name", delete(api::storage::delete_pool))
            .route("/storage/pools/:name/start", post(api::storage::start_pool))
            .route("/storage/pools/:name/stop", post(api::storage::stop_pool))
            .route("/storage/pools/:name/health", get(api::storage::get_pool_health))
            .route("/storage/pools/:name/stats", get(api::storage::get_pool_stats))
            .route("/storage/pools/:name/refresh", post(api::storage::refresh_pool_stats))
            // System resource routes - CPU
            .route("/system/cpu/topology", get(api::system::get_cpu_topology))
            .route("/vms/:name/cpu/pin", post(api::system::set_cpu_pinning))
            .route("/vms/:name/cpu/pin", delete(api::system::remove_cpu_pinning))
            .route("/vms/:name/cpu/affinity", get(api::system::get_cpu_affinity))
            // System resource routes - NUMA
            .route("/system/numa/topology", get(api::system::get_numa_topology))
            .route("/system/numa/nodes/:id", get(api::system::get_numa_node))
            .route("/system/numa/placement", get(api::system::get_numa_placement))
            // System resource routes - Memory
            .route("/vms/:name/memory/limit", put(api::system::set_memory_limit))
            .route("/vms/:name/memory/usage", get(api::system::get_memory_usage))
            .route("/vms/:name/memory/balloon", post(api::system::set_memory_ballooning))
            .route("/system/memory/hugepages", get(api::system::get_hugepage_stats))
            .route("/system/memory/hugepages", post(api::system::allocate_hugepages))
            .route("/system/memory", get(api::system::get_system_memory))
            // Firmware routes
            .route("/vms/:name/firmware/status", get(api::firmware::get_firmware_status))
            .route("/vms/:name/firmware/uefi", post(api::firmware::enable_uefi))
            .route("/vms/:name/firmware/secureboot", post(api::firmware::enable_secureboot))
            .route("/vms/:name/firmware/secureboot", delete(api::firmware::disable_secureboot))
            .route("/vms/:name/firmware/reset", post(api::firmware::reset_nvram))
            .route("/system/firmware/capabilities", get(api::firmware::get_firmware_capabilities))
            // Notification routes
            .route("/notifications/channels", get(api::notifications::list_channels))
            .route("/notifications/channels", post(api::notifications::create_channel))
            .route("/notifications/channels/:id", put(api::notifications::update_channel))
            .route("/notifications/channels/:id", delete(api::notifications::delete_channel))
            .route("/notifications/channels/:id/test", post(api::notifications::test_channel))
            .route("/notifications/rules", get(api::notifications::list_rules))
            .route("/notifications/rules", post(api::notifications::create_rule))
            .route("/notifications/rules/:id", put(api::notifications::update_rule))
            .route("/notifications/rules/:id", delete(api::notifications::delete_rule))
            .route("/notifications/rules/:id/enable", post(api::notifications::enable_rule))
            .route("/notifications/rules/:id/disable", post(api::notifications::disable_rule))
            .route("/notifications/history", get(api::notifications::get_history))
            // Quota routes
            .route("/quotas", get(api::quotas::list_quotas))
            .route("/quotas", post(api::quotas::create_quota))
            .route("/quotas/:id", get(api::quotas::get_quota))
            .route("/quotas/:id", put(api::quotas::update_quota))
            .route("/quotas/:id", delete(api::quotas::delete_quota))
            .route("/quotas/:id/enable", post(api::quotas::enable_quota))
            .route("/quotas/:id/disable", post(api::quotas::disable_quota))
            .route("/quotas/:id/usage", get(api::quotas::get_quota_usage))
            .route("/quotas/usage", get(api::quotas::get_all_quota_usage))
            // Schedule routes
            .route("/schedules", get(api::schedules::list_schedules))
            .route("/schedules", post(api::schedules::create_schedule))
            .route("/schedules/:id", get(api::schedules::get_schedule))
            .route("/schedules/:id", put(api::schedules::update_schedule))
            .route("/schedules/:id", delete(api::schedules::delete_schedule))
            .route("/schedules/:id/enable", post(api::schedules::enable_schedule))
            .route("/schedules/:id/disable", post(api::schedules::disable_schedule))
            .route("/schedules/:id/run", post(api::schedules::run_schedule_now))
            .route("/schedules/:id/history", get(api::schedules::get_schedule_history))
            .route("/schedules/history", get(api::schedules::get_all_schedule_history))
            // Audit routes
            .route("/audit/logs", get(api::audit::list_audit_logs))
            .route("/audit/logs/:id", get(api::audit::get_audit_log))
            .route("/audit/logs/export", get(api::audit::export_audit_logs))
            .route("/audit/stats", get(api::audit::get_audit_stats))
            // Analytics routes
            .route("/analytics/vms/:name", get(api::analytics::get_vm_performance))
            .route("/analytics/system", get(api::analytics::get_system_performance))
            .route("/analytics/insights", get(api::analytics::get_performance_insights))
            .route("/analytics/top", get(api::analytics::get_top_vms_by_resource))
            .route("/analytics/utilization", get(api::analytics::get_resource_utilization))
            .route("/analytics/export", get(api::analytics::export_performance_report))
            // Backup routes
            .route("/backups", get(api::backups::list_backups))
            .route("/backups", post(api::backups::create_backup))
            .route("/backups/:id", get(api::backups::get_backup))
            .route("/backups/:id", delete(api::backups::delete_backup))
            .route("/backups/restore", post(api::backups::restore_backup))
            .route("/backups/jobs", get(api::backups::get_backup_jobs))
            .route("/backups/jobs/:id", get(api::backups::get_backup_job))
            .route("/backups/policies", get(api::backups::list_backup_policies))
            .route("/backups/policies", post(api::backups::create_backup_policy))
            .route("/backups/policies/:id", delete(api::backups::delete_backup_policy))
            .route("/backups/policies/:id/enable", post(api::backups::enable_backup_policy))
            .route("/backups/policies/:id/disable", post(api::backups::disable_backup_policy))
            .route("/backups/stats", get(api::backups::get_backup_stats))
            // Settings routes
            .route("/settings", get(api::settings::get_settings).put(api::settings::update_settings))
            // ========================================================================
            // Enterprise feature routes (vSphere feature parity)
            // ========================================================================
            // Datacenter routes
            .route("/datacenters", get(api::datacenter::list_datacenters).post(api::datacenter::create_datacenter))
            .route("/datacenters/:id", get(api::datacenter::get_datacenter).put(api::datacenter::update_datacenter).delete(api::datacenter::delete_datacenter))
            .route("/datacenters/:id/summary", get(api::datacenter::get_datacenter_summary))
            // Cluster routes
            .route("/clusters", get(api::datacenter::list_clusters).post(api::datacenter::create_cluster))
            .route("/clusters/:id", get(api::datacenter::get_cluster).put(api::datacenter::update_cluster).delete(api::datacenter::delete_cluster))
            // Host routes
            .route("/hosts", get(api::datacenter::list_hosts).post(api::datacenter::register_host))
            .route("/hosts/:id", get(api::datacenter::get_host).put(api::datacenter::update_host).delete(api::datacenter::remove_host))
            .route("/hosts/:id/heartbeat", post(api::datacenter::host_heartbeat))
            .route("/hosts/:id/maintenance/enter", post(api::datacenter::host_enter_maintenance))
            .route("/hosts/:id/maintenance/exit", post(api::datacenter::host_exit_maintenance))
            // Resource pool routes
            .route("/resource-pools", get(api::resource_pools::list_pools).post(api::resource_pools::create_pool))
            .route("/resource-pools/:id", get(api::resource_pools::get_pool).put(api::resource_pools::update_pool).delete(api::resource_pools::delete_pool))
            .route("/resource-pools/:id/summary", get(api::resource_pools::get_pool_summary))
            .route("/resource-pools/:id/vms", post(api::resource_pools::assign_vm).delete(api::resource_pools::unassign_vm))
            .route("/resource-pools/:id/vms/move", post(api::resource_pools::move_vm))
            .route("/resource-pools/:id/admission", post(api::resource_pools::check_admission))
            // DRS routes
            .route("/drs/config", post(api::drs::configure_drs))
            .route("/drs/config/:cluster_id", get(api::drs::get_drs_config))
            .route("/drs/placement", post(api::drs::compute_placement))
            .route("/drs/balance/:cluster_id", get(api::drs::analyze_balance))
            .route("/drs/recommendations", post(api::drs::generate_recommendations))
            .route("/drs/recommendations/:cluster_id", get(api::drs::list_recommendations))
            .route("/drs/recommendations/:id/approve", post(api::drs::approve_recommendation))
            .route("/drs/recommendations/:id/reject", post(api::drs::reject_recommendation))
            .route("/drs/affinity-rules", get(api::drs::list_affinity_rules).post(api::drs::create_affinity_rule))
            .route("/drs/affinity-rules/:id", get(api::drs::get_affinity_rule).put(api::drs::update_affinity_rule).delete(api::drs::delete_affinity_rule))
            // Distributed storage routes
            .route("/distributed-storage/pools", get(api::distributed_storage::list_storage_pools).post(api::distributed_storage::create_storage_pool))
            .route("/distributed-storage/pools/:id", get(api::distributed_storage::get_storage_pool).delete(api::distributed_storage::delete_storage_pool))
            .route("/distributed-storage/pools/:id/hosts", post(api::distributed_storage::add_storage_host))
            .route("/distributed-storage/pools/:id/hosts/:host_id", delete(api::distributed_storage::remove_storage_host))
            .route("/distributed-storage/pools/:id/disk-failure", post(api::distributed_storage::report_disk_failure))
            .route("/distributed-storage/pools/:id/health", get(api::distributed_storage::get_pool_health))
            .route("/distributed-storage/migrations", get(api::distributed_storage::list_storage_migrations).post(api::distributed_storage::start_storage_migration))
            .route("/distributed-storage/migrations/:id", get(api::distributed_storage::get_storage_migration))
            .route("/distributed-storage/migrations/:id/progress", put(api::distributed_storage::update_migration_progress))
            .route("/distributed-storage/migrations/:id/complete", post(api::distributed_storage::complete_migration))
            .route("/distributed-storage/migrations/:id/cancel", post(api::distributed_storage::cancel_migration))
            .route("/distributed-storage/policies", get(api::distributed_storage::list_storage_policies).post(api::distributed_storage::create_storage_policy))
            .route("/distributed-storage/policies/:id", get(api::distributed_storage::get_storage_policy).put(api::distributed_storage::update_storage_policy).delete(api::distributed_storage::delete_storage_policy))
            .route("/distributed-storage/policies/:id/compliance", post(api::distributed_storage::check_compliance))
            .route("/distributed-storage/datastore-clusters", get(api::distributed_storage::list_datastore_clusters).post(api::distributed_storage::create_datastore_cluster))
            .route("/distributed-storage/datastore-clusters/:id", get(api::distributed_storage::get_datastore_cluster).delete(api::distributed_storage::delete_datastore_cluster))
            .route("/distributed-storage/datastore-clusters/:id/recommend", post(api::distributed_storage::recommend_datastore))
            // Encryption routes
            .route("/encryption/providers", get(api::vm_encryption::list_providers).post(api::vm_encryption::register_provider))
            .route("/encryption/providers/:id", delete(api::vm_encryption::remove_provider))
            .route("/encryption/providers/:id/test", post(api::vm_encryption::test_provider))
            .route("/encryption/policies", get(api::vm_encryption::list_policies).post(api::vm_encryption::create_policy))
            .route("/encryption/policies/:id", get(api::vm_encryption::get_policy).put(api::vm_encryption::update_policy).delete(api::vm_encryption::delete_policy))
            .route("/encryption/vms/:name/encrypt", post(api::vm_encryption::encrypt_vm))
            .route("/encryption/vms/:name/decrypt", post(api::vm_encryption::decrypt_vm))
            .route("/encryption/vms/:name/status", get(api::vm_encryption::get_vm_encryption_status))
            .route("/encryption/vms", get(api::vm_encryption::list_encrypted_vms))
            .route("/encryption/vms/:name/rotate-key", post(api::vm_encryption::rotate_vm_key))
            // systemd-networkd VM networking routes
            .route("/networkd/bridges", get(api::networkd::list_bridges).post(api::networkd::create_bridge))
            .route("/networkd/bridges/:id", get(api::networkd::get_bridge).put(api::networkd::update_bridge).delete(api::networkd::delete_bridge))
            .route("/networkd/vlans", get(api::networkd::list_vlans).post(api::networkd::create_vlan))
            .route("/networkd/vlans/:id", get(api::networkd::get_vlan).put(api::networkd::update_vlan).delete(api::networkd::delete_vlan))
            .route("/networkd/macvtaps", get(api::networkd::list_macvtaps).post(api::networkd::create_macvtap))
            .route("/networkd/macvtaps/:id", get(api::networkd::get_macvtap).delete(api::networkd::delete_macvtap))
            .route("/networkd/taps", get(api::networkd::list_taps).post(api::networkd::create_tap))
            .route("/networkd/taps/:id", get(api::networkd::get_tap).delete(api::networkd::delete_tap))
            .route("/networkd/bonds", get(api::networkd::list_bonds).post(api::networkd::create_bond))
            .route("/networkd/bonds/:id", get(api::networkd::get_bond).put(api::networkd::update_bond).delete(api::networkd::delete_bond))
            .route("/networkd/network-files", get(api::networkd::list_network_files).post(api::networkd::create_network_file))
            .route("/networkd/network-files/:id", get(api::networkd::get_network_file).delete(api::networkd::delete_network_file))
            .route("/networkd/link-files", get(api::networkd::list_link_files).post(api::networkd::create_link_file))
            .route("/networkd/link-files/:id", delete(api::networkd::delete_link_file))
            .route("/networkd/links", get(api::networkd::list_links))
            .route("/networkd/links/:name/status", get(api::networkd::get_device_status))
            .route("/networkd/reload", post(api::networkd::reload_networkd))
            .route("/networkd/files", get(api::networkd::list_managed_files))
            .route("/networkd/port-forwards", get(api::networkd::list_port_forwards).post(api::networkd::create_port_forward))
            .route("/networkd/port-forwards/sync", post(api::networkd::sync_port_forwards))
            .route("/networkd/port-forwards/:id", get(api::networkd::get_port_forward).delete(api::networkd::delete_port_forward))
            .route("/networkd/scan", get(api::networkd::scan_configs))
            // Fault tolerance routes
            .route("/ft/enable", post(api::fault_tolerance::enable_ft))
            .route("/ft/vms", get(api::fault_tolerance::list_ft_vms))
            .route("/ft/vms/:name", get(api::fault_tolerance::get_ft_config).delete(api::fault_tolerance::disable_ft))
            .route("/ft/vms/:name/compatibility", get(api::fault_tolerance::check_ft_compatibility))
            .route("/ft/vms/:name/failover", post(api::fault_tolerance::trigger_failover))
            .route("/ft/vms/:name/test-failover", post(api::fault_tolerance::test_failover))
            .route("/ft/vms/:name/suspend", post(api::fault_tolerance::suspend_replication))
            .route("/ft/vms/:name/resume", post(api::fault_tolerance::resume_replication))
            .route("/ft/vms/:name/metrics", get(api::fault_tolerance::get_ft_metrics))
            .route("/ft/events", get(api::fault_tolerance::get_ft_events))
            // Replication routes
            .route("/replication/sites", get(api::replication_api::list_sites).post(api::replication_api::register_site))
            .route("/replication/sites/:id", delete(api::replication_api::remove_site))
            .route("/replication/configs", get(api::replication_api::list_replications).post(api::replication_api::configure_replication))
            .route("/replication/configs/:id", get(api::replication_api::get_replication))
            .route("/replication/configs/:id/pause", post(api::replication_api::pause_replication))
            .route("/replication/configs/:id/resume", post(api::replication_api::resume_replication))
            .route("/replication/configs/:id/remove", delete(api::replication_api::remove_replication))
            .route("/replication/configs/:id/sync", post(api::replication_api::start_sync))
            .route("/replication/configs/:id/metrics", get(api::replication_api::get_replication_metrics))
            .route("/replication/configs/:id/instances", get(api::replication_api::list_recovery_instances))
            .route("/replication/rpo-violations", get(api::replication_api::check_rpo_violations))
            .route("/replication/health", get(api::replication_api::get_replication_health))
            // Site recovery routes
            .route("/site-recovery/plans", get(api::site_recovery_api::list_plans).post(api::site_recovery_api::create_plan))
            .route("/site-recovery/plans/:id", get(api::site_recovery_api::get_plan).put(api::site_recovery_api::update_plan).delete(api::site_recovery_api::delete_plan))
            .route("/site-recovery/plans/:id/planned-migration", post(api::site_recovery_api::execute_planned_migration))
            .route("/site-recovery/plans/:id/disaster-recovery", post(api::site_recovery_api::execute_disaster_recovery))
            .route("/site-recovery/plans/:id/test-failover", post(api::site_recovery_api::execute_test_failover))
            .route("/site-recovery/plans/:id/reprotect", post(api::site_recovery_api::execute_reprotect))
            .route("/site-recovery/executions", get(api::site_recovery_api::list_executions))
            .route("/site-recovery/executions/:id", get(api::site_recovery_api::get_execution))
            .route("/site-recovery/executions/:id/cancel", post(api::site_recovery_api::cancel_execution))
            .route("/site-recovery/dashboard", get(api::site_recovery_api::get_dr_dashboard))
            // Content library routes
            .route("/content-library/libraries", get(api::content_library::list_libraries).post(api::content_library::create_library))
            .route("/content-library/libraries/:id", get(api::content_library::get_library).delete(api::content_library::delete_library))
            .route("/content-library/libraries/:id/sync", post(api::content_library::sync_library))
            .route("/content-library/libraries/:id/items", get(api::content_library::list_library_items).post(api::content_library::add_library_item))
            .route("/content-library/items/:id", get(api::content_library::get_library_item).delete(api::content_library::delete_library_item))
            .route("/content-library/items/search", get(api::content_library::search_items))
            .route("/content-library/customization-specs", get(api::content_library::list_customization_specs).post(api::content_library::create_customization_spec))
            .route("/content-library/customization-specs/:id", get(api::content_library::get_customization_spec).delete(api::content_library::delete_customization_spec))
            .route("/content-library/host-profiles", get(api::content_library::list_host_profiles).post(api::content_library::create_host_profile))
            .route("/content-library/host-profiles/:id", get(api::content_library::get_host_profile).delete(api::content_library::delete_host_profile))
            .route("/content-library/host-profiles/:id/compliance", post(api::content_library::check_host_compliance))
            // Lifecycle manager routes
            .route("/lifecycle/baselines", get(api::lifecycle::list_baselines).post(api::lifecycle::create_baseline))
            .route("/lifecycle/baselines/:id", get(api::lifecycle::get_baseline).put(api::lifecycle::update_baseline).delete(api::lifecycle::delete_baseline))
            .route("/lifecycle/compliance/scan", post(api::lifecycle::scan_host_compliance))
            .route("/lifecycle/compliance/:host_id", get(api::lifecycle::get_compliance_status))
            .route("/lifecycle/compliance/cluster/:cluster_id", get(api::lifecycle::get_cluster_compliance))
            .route("/lifecycle/remediations", get(api::lifecycle::list_remediations).post(api::lifecycle::create_remediation))
            .route("/lifecycle/remediations/:id", get(api::lifecycle::get_remediation))
            .route("/lifecycle/rolling-updates", get(api::lifecycle::list_rolling_updates).post(api::lifecycle::create_rolling_update))
            .route("/lifecycle/rolling-updates/:id/start", post(api::lifecycle::start_rolling_update))
            .route("/lifecycle/rolling-updates/:id/pause", post(api::lifecycle::pause_rolling_update))
            .route("/lifecycle/rolling-updates/:id/advance", post(api::lifecycle::advance_rolling_update))
            // Certificate management routes
            .route("/certificates/cas", get(api::certificates::list_cas).post(api::certificates::create_ca))
            .route("/certificates/cas/:id", delete(api::certificates::delete_ca))
            .route("/certificates", get(api::certificates::list_certificates))
            .route("/certificates/issue", post(api::certificates::issue_certificate))
            .route("/certificates/:id/revoke", post(api::certificates::revoke_certificate))
            .route("/certificates/:id/renew", post(api::certificates::renew_certificate))
            .route("/certificates/expiring", get(api::certificates::check_expiring))
            .route("/certificates/requests", get(api::certificates::list_cert_requests).post(api::certificates::submit_cert_request))
            .route("/certificates/requests/:id/approve", post(api::certificates::approve_cert_request))
            .route("/certificates/requests/:id/reject", post(api::certificates::reject_cert_request))
            .route("/certificates/rotations", get(api::certificates::list_rotations).post(api::certificates::schedule_rotation))
            .route("/certificates/rotations/:id/execute", post(api::certificates::execute_rotation))
            .route("/certificates/attestations", get(api::certificates::list_attestations).post(api::certificates::submit_attestation))
            .route("/certificates/attestations/:host_id/verify", post(api::certificates::verify_attestation))
            .route("/certificates/security-baselines", get(api::certificates::list_security_baselines).post(api::certificates::create_security_baseline))
            .route("/certificates/security-baselines/:id/compliance", post(api::certificates::check_vm_security_compliance))
            .route("/certificates/health", get(api::certificates::get_cert_health_dashboard))
            .with_state(state.clone());

        let ws_routes = Router::new()
            .route("/console/:name", get(websocket::console_handler))
            .route("/vnc/:name", get(vnc_proxy::vnc_handler))
            .with_state(state.clone());

        Router::new()
            .nest("/api", api_routes)
            .nest("/ws", ws_routes)
            .route("/health", get(|| async { "OK" }))
            .route("/metrics", get(prometheus_exporter::metrics_handler))
            .fallback_service(ServeDir::new(
                if std::path::Path::new("/usr/share/vmspawnd/web").exists() {
                    "/usr/share/vmspawnd/web"
                } else {
                    "../web/dist"
                },
            ))
            .layer(cors)
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
                    tracing::warn!("Schedule checker: too many concurrent executions, skipping '{}'", schedule.name);
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
                        tracing::warn!("Snapshot action not implemented");
                        Ok(())
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
                    let _ = state_clone.store.save_entity("schedules", &sched.id, &sched);
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
                let _ = state_clone.store.save_entity("schedule_history", &history_id, &history);
            });
        }
    }
}
