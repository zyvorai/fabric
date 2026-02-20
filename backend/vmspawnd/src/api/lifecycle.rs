use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use lifecycle_manager::{
    Baseline, ComplianceSummary, HostComplianceStatus, RemediationTask, RollingUpdatePlan,
    RollingUpdateStatus,
};

// ============================================================================
// Baseline handlers
// ============================================================================

pub async fn list_baselines(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<Baseline> = state.store.list_entities("lm_baselines").unwrap_or_default();
    Json(items)
}

pub async fn create_baseline(
    State(state): State<Arc<AppState>>,
    Json(mut baseline): Json<Baseline>,
) -> impl IntoResponse {
    if baseline.id.is_empty() { baseline.id = Uuid::new_v4().to_string(); }
    baseline.created = Utc::now();
    baseline.updated = None;
    match state.store.save_entity("lm_baselines", &baseline.id, &baseline) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&baseline).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_baseline(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<Baseline>("lm_baselines", &id) {
        Ok(Some(b)) => Json(serde_json::to_value(&b).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_baseline(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut baseline): Json<Baseline>,
) -> impl IntoResponse {
    baseline.id = id.clone();
    baseline.updated = Some(Utc::now());
    let _ = state.store.save_entity("lm_baselines", &id, &baseline);
    Json(serde_json::to_value(&baseline).unwrap())
}

pub async fn delete_baseline(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("lm_baselines", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Compliance handlers
// ============================================================================

#[derive(serde::Deserialize)]
pub struct ScanComplianceRequest {
    pub host_id: String,
    pub hostname: String,
    pub baseline_id: String,
    pub installed_packages: Vec<lifecycle_manager::InstalledPatch>,
}

pub async fn scan_host_compliance(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScanComplianceRequest>,
) -> impl IntoResponse {
    let mgr = lifecycle_manager::LifecycleManager::new();
    // Load baseline into manager
    if let Ok(Some(baseline)) = state.store.get_entity::<Baseline>("lm_baselines", &req.baseline_id) {
        let _ = mgr.create_baseline(baseline);
    }
    match mgr.scan_host_compliance(&req.host_id, &req.hostname, &req.baseline_id, &req.installed_packages) {
        Ok(status) => {
            let id = Uuid::new_v4().to_string();
            let _ = state.store.save_entity("compliance_results", &id, &status);
            Json(serde_json::to_value(&status).unwrap()).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_compliance_status(
    State(state): State<Arc<AppState>>,
    Path(host_id): Path<String>,
) -> impl IntoResponse {
    let items: Vec<HostComplianceStatus> = state.store.list_entities("compliance_results").unwrap_or_default();
    let filtered: Vec<_> = items.into_iter().filter(|s| s.host_id == host_id).collect();
    Json(filtered)
}

pub async fn get_cluster_compliance(
    State(state): State<Arc<AppState>>,
    Path(cluster_id): Path<String>,
) -> impl IntoResponse {
    let items: Vec<HostComplianceStatus> = state.store.list_entities("compliance_results").unwrap_or_default();
    let mut total_hosts = 0u32;
    let mut compliant_hosts = 0u32;
    let mut non_compliant_hosts = 0u32;
    let mut critical_missing = 0u32;
    // Use the latest scan per host
    let mut seen = std::collections::HashSet::new();
    for status in items.iter().rev() {
        if seen.insert(status.host_id.clone()) {
            total_hosts += 1;
            if status.compliant {
                compliant_hosts += 1;
            } else {
                non_compliant_hosts += 1;
                critical_missing += status.missing_patches.iter()
                    .filter(|p| p.severity == Some(lifecycle_manager::PatchSeverity::Critical))
                    .count() as u32;
            }
        }
    }
    let summary = ComplianceSummary {
        total_hosts,
        compliant_hosts,
        non_compliant_hosts,
        critical_missing,
    };
    Json(summary)
}

// ============================================================================
// Remediation handlers
// ============================================================================

pub async fn list_remediations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<RemediationTask> = state.store.list_entities("remediations").unwrap_or_default();
    Json(items)
}

#[derive(serde::Deserialize)]
pub struct CreateRemediationRequest {
    pub host_id: String,
    pub hostname: String,
    pub baseline_id: String,
}

pub async fn create_remediation(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateRemediationRequest>,
) -> impl IntoResponse {
    let mgr = lifecycle_manager::LifecycleManager::new();
    match mgr.create_remediation(&req.host_id, &req.hostname, &req.baseline_id) {
        Ok(task) => {
            let _ = state.store.save_entity("remediations", &task.id, &task);
            (StatusCode::CREATED, Json(serde_json::to_value(&task).unwrap())).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_remediation(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<RemediationTask>("remediations", &id) {
        Ok(Some(t)) => Json(serde_json::to_value(&t).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// ============================================================================
// Rolling update handlers
// ============================================================================

pub async fn list_rolling_updates(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<RollingUpdatePlan> = state.store.list_entities("rolling_updates").unwrap_or_default();
    Json(items)
}

pub async fn create_rolling_update(
    State(state): State<Arc<AppState>>,
    Json(mut plan): Json<RollingUpdatePlan>,
) -> impl IntoResponse {
    if plan.id.is_empty() { plan.id = Uuid::new_v4().to_string(); }
    plan.status = RollingUpdateStatus::Planned;
    plan.current_host_index = 0;
    plan.started = None;
    plan.completed = None;
    if plan.max_concurrent == 0 { plan.max_concurrent = 1; }
    match state.store.save_entity("rolling_updates", &plan.id, &plan) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&plan).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn start_rolling_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut plan = match state.store.get_entity::<RollingUpdatePlan>("rolling_updates", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    plan.status = RollingUpdateStatus::InProgress;
    plan.started = Some(Utc::now());
    let _ = state.store.save_entity("rolling_updates", &plan.id, &plan);
    StatusCode::OK.into_response()
}

pub async fn pause_rolling_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut plan = match state.store.get_entity::<RollingUpdatePlan>("rolling_updates", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    plan.status = RollingUpdateStatus::Paused;
    let _ = state.store.save_entity("rolling_updates", &plan.id, &plan);
    StatusCode::OK.into_response()
}

pub async fn advance_rolling_update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut plan = match state.store.get_entity::<RollingUpdatePlan>("rolling_updates", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let index = plan.current_host_index as usize;
    if index >= plan.host_order.len() {
        plan.status = RollingUpdateStatus::Completed;
        plan.completed = Some(Utc::now());
        let _ = state.store.save_entity("rolling_updates", &plan.id, &plan);
        return Json(serde_json::json!({"completed": true})).into_response();
    }
    let host_id = plan.host_order[index].clone();
    plan.current_host_index += 1;
    let _ = state.store.save_entity("rolling_updates", &plan.id, &plan);
    Json(serde_json::json!({"next_host_id": host_id})).into_response()
}
