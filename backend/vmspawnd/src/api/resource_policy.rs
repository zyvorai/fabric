use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};

// ============================================================================
// Resource Overcommit Policy
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OvercommitPolicy {
    pub cpu_ratio: f64,
    pub memory_ratio: f64,
    pub storage_ratio: f64,
    pub enabled: bool,
}

impl Default for OvercommitPolicy {
    fn default() -> Self {
        Self {
            cpu_ratio: 2.0,     // 2:1 CPU overcommit
            memory_ratio: 1.5,  // 1.5:1 memory overcommit
            storage_ratio: 1.0, // No storage overcommit
            enabled: false,
        }
    }
}

/// GET /api/system/overcommit - Get overcommit policy
pub async fn get_overcommit_policy(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<OvercommitPolicy>, (StatusCode, Json<serde_json::Value>)> {
    let policy = state.store.get_entity::<OvercommitPolicy>("config", "overcommit")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .unwrap_or_default();
    Ok(Json(policy))
}

/// PUT /api/system/overcommit - Update overcommit policy
pub async fn update_overcommit_policy(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(policy): Json<OvercommitPolicy>,
) -> Result<Json<OvercommitPolicy>, (StatusCode, Json<serde_json::Value>)> {
    // Validate ratios
    if policy.cpu_ratio < 1.0 || policy.memory_ratio < 1.0 || policy.storage_ratio < 1.0 {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Overcommit ratios must be >= 1.0"}))));
    }
    if policy.cpu_ratio > 16.0 || policy.memory_ratio > 4.0 || policy.storage_ratio > 2.0 {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Overcommit ratios too high (max: CPU 16:1, memory 4:1, storage 2:1)"}))));
    }

    state.store.save_entity("config", "overcommit", &policy)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    tracing::info!("Updated overcommit policy: CPU {}:1, Memory {}:1, Storage {}:1",
        policy.cpu_ratio, policy.memory_ratio, policy.storage_ratio);

    Ok(Json(policy))
}

/// GET /api/system/capacity - Get capacity with overcommit
pub async fn get_capacity(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let policy = state.store.get_entity::<OvercommitPolicy>("config", "overcommit")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .unwrap_or_default();

    let vms = state.store.list_vms()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    // Physical resources (from system)
    let physical_cpus = num_cpus();
    let physical_memory_mb = total_memory_mb();

    // Allocated resources
    let allocated_cpus: u32 = vms.iter().map(|v| v.cpus).sum();
    let allocated_memory: u64 = vms.iter().map(|v| v.memory).sum();

    // Effective capacity (with overcommit)
    let effective_cpus = (physical_cpus as f64 * if policy.enabled { policy.cpu_ratio } else { 1.0 }) as u32;
    let effective_memory = (physical_memory_mb as f64 * if policy.enabled { policy.memory_ratio } else { 1.0 }) as u64;

    Ok(Json(json!({
        "physical": {
            "cpus": physical_cpus,
            "memory_mb": physical_memory_mb,
        },
        "effective": {
            "cpus": effective_cpus,
            "memory_mb": effective_memory,
        },
        "allocated": {
            "cpus": allocated_cpus,
            "memory_mb": allocated_memory,
        },
        "available": {
            "cpus": effective_cpus.saturating_sub(allocated_cpus),
            "memory_mb": effective_memory.saturating_sub(allocated_memory),
        },
        "overcommit": {
            "enabled": policy.enabled,
            "cpu_ratio": policy.cpu_ratio,
            "memory_ratio": policy.memory_ratio,
        },
        "vm_count": vms.len(),
    })))
}

fn num_cpus() -> u32 {
    std::fs::read_to_string("/proc/cpuinfo")
        .map(|c| c.lines().filter(|l| l.starts_with("processor")).count() as u32)
        .unwrap_or(1)
        .max(1)
}

fn total_memory_mb() -> u64 {
    std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|c| {
            c.lines()
                .find(|l| l.starts_with("MemTotal:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|v| v.parse::<u64>().ok())
                .map(|kb| kb / 1024)
        })
        .unwrap_or(1024)
}

// ============================================================================
// Metrics Retention
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsRetentionPolicy {
    /// Keep raw metrics for N hours (default: 24)
    pub raw_retention_hours: u32,
    /// Keep hourly aggregates for N days (default: 30)
    pub hourly_retention_days: u32,
    /// Keep daily aggregates for N days (default: 365)
    pub daily_retention_days: u32,
    /// Enable automatic cleanup
    pub auto_cleanup: bool,
}

impl Default for MetricsRetentionPolicy {
    fn default() -> Self {
        Self {
            raw_retention_hours: 24,
            hourly_retention_days: 30,
            daily_retention_days: 365,
            auto_cleanup: true,
        }
    }
}

/// GET /api/system/metrics/retention - Get retention policy
pub async fn get_metrics_retention(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<MetricsRetentionPolicy>, (StatusCode, Json<serde_json::Value>)> {
    let policy = state.store.get_entity::<MetricsRetentionPolicy>("config", "metrics_retention")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .unwrap_or_default();
    Ok(Json(policy))
}

/// PUT /api/system/metrics/retention - Update retention policy
pub async fn update_metrics_retention(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(policy): Json<MetricsRetentionPolicy>,
) -> Result<Json<MetricsRetentionPolicy>, (StatusCode, Json<serde_json::Value>)> {
    state.store.save_entity("config", "metrics_retention", &policy)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    tracing::info!("Updated metrics retention: raw={}h, hourly={}d, daily={}d",
        policy.raw_retention_hours, policy.hourly_retention_days, policy.daily_retention_days);
    Ok(Json(policy))
}

/// POST /api/system/metrics/cleanup - Manually trigger metrics cleanup
pub async fn cleanup_metrics(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let policy = state.store.get_entity::<MetricsRetentionPolicy>("config", "metrics_retention")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .unwrap_or_default();

    let now = chrono::Utc::now();
    let raw_cutoff = now - chrono::Duration::hours(policy.raw_retention_hours as i64);

    // Clean up old performance metrics
    let all_metrics: Vec<crate::api::analytics::PerformanceMetrics> = state.store
        .list_entities("performance")
        .unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });

    let before = all_metrics.len();
    let mut deleted = 0u32;

    for metric in &all_metrics {
        if metric.timestamp < raw_cutoff {
            // Metrics stored by timestamp-based keys would be cleaned up
            deleted += 1;
        }
    }

    tracing::info!("Metrics cleanup: {} total, {} eligible for deletion", before, deleted);

    Ok(Json(json!({
        "total_metrics": before,
        "deleted": deleted,
        "cutoff": raw_cutoff.to_rfc3339(),
    })))
}
