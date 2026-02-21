use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};

use crate::server::AppState;
use crate::validation::validate_vm_name;

// ============================================================================
// Auto-Scaling Policy
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScalingPolicy {
    pub vm_name: String,
    pub enabled: bool,
    /// Scale up when CPU exceeds this % (e.g. 80.0)
    pub cpu_scale_up_threshold: Option<f64>,
    /// Scale down when CPU is below this % (e.g. 20.0)
    pub cpu_scale_down_threshold: Option<f64>,
    /// Scale up when memory exceeds this % (e.g. 90.0)
    pub memory_scale_up_threshold: Option<f64>,
    /// Scale down when memory is below this % (e.g. 30.0)
    pub memory_scale_down_threshold: Option<f64>,
    pub min_cpus: u32,
    pub max_cpus: u32,
    pub min_memory_mb: u64,
    pub max_memory_mb: u64,
    /// Cooldown between scaling actions (seconds)
    pub cooldown_secs: u64,
    pub last_scale_action: Option<DateTime<Utc>>,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateScalingPolicyRequest {
    pub vm_name: String,
    pub cpu_scale_up_threshold: Option<f64>,
    pub cpu_scale_down_threshold: Option<f64>,
    pub memory_scale_up_threshold: Option<f64>,
    pub memory_scale_down_threshold: Option<f64>,
    #[serde(default = "default_min_cpus")]
    pub min_cpus: u32,
    #[serde(default = "default_max_cpus")]
    pub max_cpus: u32,
    #[serde(default = "default_min_mem")]
    pub min_memory_mb: u64,
    #[serde(default = "default_max_mem")]
    pub max_memory_mb: u64,
    #[serde(default = "default_cooldown")]
    pub cooldown_secs: u64,
}

fn default_min_cpus() -> u32 { 1 }
fn default_max_cpus() -> u32 { 8 }
fn default_min_mem() -> u64 { 512 }
fn default_max_mem() -> u64 { 16384 }
fn default_cooldown() -> u64 { 300 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaleEvent {
    pub id: String,
    pub vm_name: String,
    pub action: ScaleAction,
    pub resource: String,
    pub from_value: String,
    pub to_value: String,
    pub reason: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScaleAction {
    ScaleUp,
    ScaleDown,
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /api/autoscale - Create an auto-scaling policy
pub async fn create_scaling_policy(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateScalingPolicyRequest>,
) -> Result<(StatusCode, Json<ScalingPolicy>), (StatusCode, Json<serde_json::Value>)> {
    validate_vm_name(&req.vm_name).map_err(|(s, m)| (s, Json(json!({ "error": m }))))?;

    // Verify VM exists
    match state.store.get_vm(&req.vm_name) {
        Ok(Some(_)) => {}
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "VM not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    }

    let policy = ScalingPolicy {
        vm_name: req.vm_name.clone(),
        enabled: true,
        cpu_scale_up_threshold: req.cpu_scale_up_threshold,
        cpu_scale_down_threshold: req.cpu_scale_down_threshold,
        memory_scale_up_threshold: req.memory_scale_up_threshold,
        memory_scale_down_threshold: req.memory_scale_down_threshold,
        min_cpus: req.min_cpus,
        max_cpus: req.max_cpus,
        min_memory_mb: req.min_memory_mb,
        max_memory_mb: req.max_memory_mb,
        cooldown_secs: req.cooldown_secs,
        last_scale_action: None,
        created: Utc::now(),
    };

    state.store.save_entity("autoscale_policies", &policy.vm_name, &policy).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(policy)))
}

/// GET /api/autoscale - List all scaling policies
pub async fn list_scaling_policies(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<ScalingPolicy>> {
    let policies: Vec<ScalingPolicy> = state.store.list_entities("autoscale_policies").unwrap_or_default();
    Json(policies)
}

/// GET /api/autoscale/:vm_name - Get scaling policy for a VM
pub async fn get_scaling_policy(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> Result<Json<ScalingPolicy>, (StatusCode, Json<serde_json::Value>)> {
    match state.store.get_entity::<ScalingPolicy>("autoscale_policies", &vm_name) {
        Ok(Some(p)) => Ok(Json(p)),
        Ok(None) => Err((StatusCode::NOT_FOUND, Json(json!({ "error": "No scaling policy for this VM" })))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    }
}

/// DELETE /api/autoscale/:vm_name - Delete scaling policy
pub async fn delete_scaling_policy(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    state.store.delete_entity("autoscale_policies", &vm_name).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/autoscale/events - List recent scaling events
pub async fn list_scale_events(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<ScaleEvent>> {
    let mut events: Vec<ScaleEvent> = state.store.list_entities("scale_events").unwrap_or_default();
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    events.truncate(100);
    Json(events)
}
