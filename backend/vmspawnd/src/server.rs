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
        let cors = {
            use axum::http::{HeaderValue, Method, header};

            let origins: Vec<HeaderValue> = self
                .state
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
            .with_state(self.state.clone());

        let ws_routes = Router::new()
            .route("/console/:name", get(websocket::console_handler))
            .route("/vnc/:name", get(vnc_proxy::vnc_handler))
            .with_state(self.state.clone());

        let app = Router::new()
            .nest("/api", api_routes)
            .nest("/ws", ws_routes)
            .route("/health", get(|| async { "OK" }))
            .route("/metrics", get(prometheus_exporter::metrics_handler))
            .fallback_service(ServeDir::new("../web/dist"))
            .layer(cors);

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
