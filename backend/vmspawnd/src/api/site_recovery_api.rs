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
use site_recovery::{
    DrDashboard, DrHealth, ExecutionStatus, ExecutionType, PlanStatus, RecoveryExecution,
    RecoveryPlan, RecoveryStep, SiteRecoveryManager,
};

// ============================================================================
// Recovery plan handlers
// ============================================================================

pub async fn list_plans(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<RecoveryPlan> = state.store.list_entities("recovery_plans").unwrap_or_default();
    Json(items)
}

pub async fn create_plan(
    State(state): State<Arc<AppState>>,
    Json(mut plan): Json<RecoveryPlan>,
) -> impl IntoResponse {
    plan.id = Uuid::new_v4().to_string();
    plan.created = Utc::now();
    plan.updated = None;
    plan.status = PlanStatus::Ready;
    plan.priority_groups.sort_by_key(|g| g.priority);
    match state.store.save_entity("recovery_plans", &plan.id, &plan) {
        Ok(_) => (StatusCode::CREATED, Json(plan)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_plan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<RecoveryPlan>("recovery_plans", &id) {
        Ok(Some(p)) => Json(p).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_plan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut plan): Json<RecoveryPlan>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<RecoveryPlan>("recovery_plans", &id) {
        Ok(Some(p)) => p,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    plan.id = existing.id;
    plan.created = existing.created;
    plan.updated = Some(Utc::now());
    plan.priority_groups.sort_by_key(|g| g.priority);
    if let Err(e) = state.store.save_entity("recovery_plans", &id, &plan) {
        tracing::error!("Failed to save entity: {}", e);
    }
    Json(plan).into_response()
}

pub async fn delete_plan(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity("recovery_plans", &id) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}

// ============================================================================
// Execution handlers
// ============================================================================

fn start_execution(
    state: &Arc<AppState>,
    plan_id: &str,
    exec_type: ExecutionType,
) -> Result<RecoveryExecution, StatusCode> {
    let plan = state
        .store
        .get_entity::<RecoveryPlan>("recovery_plans", plan_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let steps = SiteRecoveryManager::generate_recovery_steps(&plan, exec_type.clone());
    let execution = RecoveryExecution {
        id: Uuid::new_v4().to_string(),
        plan_id: plan.id.clone(),
        plan_name: plan.name.clone(),
        execution_type: exec_type,
        status: ExecutionStatus::Running,
        started: Utc::now(),
        completed: None,
        steps,
        rto_actual_minutes: None,
        vms_recovered: 0,
        vms_failed: 0,
        error: None,
        initiated_by: "api".to_string(),
    };
    state
        .store
        .save_entity("recovery_executions", &execution.id, &execution)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(execution)
}

pub async fn execute_planned_migration(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
) -> impl IntoResponse {
    match start_execution(&state, &plan_id, ExecutionType::PlannedMigration) {
        Ok(exec) => (StatusCode::CREATED, Json(exec)).into_response(),
        Err(sc) => sc.into_response(),
    }
}

pub async fn execute_disaster_recovery(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
) -> impl IntoResponse {
    match start_execution(&state, &plan_id, ExecutionType::DisasterRecovery) {
        Ok(exec) => (StatusCode::CREATED, Json(exec)).into_response(),
        Err(sc) => sc.into_response(),
    }
}

pub async fn execute_test_failover(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
) -> impl IntoResponse {
    match start_execution(&state, &plan_id, ExecutionType::TestFailover) {
        Ok(exec) => (StatusCode::CREATED, Json(exec)).into_response(),
        Err(sc) => sc.into_response(),
    }
}

pub async fn execute_reprotect(
    State(state): State<Arc<AppState>>,
    Path(plan_id): Path<String>,
) -> impl IntoResponse {
    match start_execution(&state, &plan_id, ExecutionType::Reprotect) {
        Ok(exec) => (StatusCode::CREATED, Json(exec)).into_response(),
        Err(sc) => sc.into_response(),
    }
}

pub async fn list_executions(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<RecoveryExecution> = state.store.list_entities("recovery_executions").unwrap_or_default();
    Json(items)
}

pub async fn get_execution(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<RecoveryExecution>("recovery_executions", &id) {
        Ok(Some(e)) => Json(e).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn cancel_execution(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut exec = match state.store.get_entity::<RecoveryExecution>("recovery_executions", &id) {
        Ok(Some(e)) => e,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    exec.status = ExecutionStatus::Cancelled;
    exec.completed = Some(Utc::now());
    if let Err(e) = state.store.save_entity("recovery_executions", &exec.id, &exec) {
        tracing::error!("Failed to save entity: {}", e);
    }
    StatusCode::OK.into_response()
}

// ============================================================================
// Dashboard
// ============================================================================

pub async fn get_dr_dashboard(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let plans: Vec<RecoveryPlan> = state.store.list_entities("recovery_plans").unwrap_or_default();
    let total_plans = plans.len() as u32;
    let ready_plans = plans.iter().filter(|p| p.status == PlanStatus::Ready).count() as u32;
    let failed_plans = plans.iter().filter(|p| p.status == PlanStatus::Failed).count() as u32;
    let mut protected_vms = std::collections::HashSet::new();
    for plan in &plans {
        for group in &plan.priority_groups {
            for vm in &group.vm_names {
                protected_vms.insert(vm.clone());
            }
        }
    }
    let rpo_violations = plans.iter().filter(|p| p.last_tested.is_none() && p.last_executed.is_none()).count() as u32;
    let overall_health = if failed_plans > 0 {
        DrHealth::Critical
    } else if rpo_violations > 0 {
        DrHealth::Warning
    } else {
        DrHealth::Healthy
    };
    let dashboard = DrDashboard {
        total_plans,
        ready_plans,
        failed_plans,
        protected_vms: protected_vms.len() as u32,
        unprotected_vms: 0,
        rpo_violations,
        last_test_results: Vec::new(),
        overall_health,
    };
    Json(dashboard)
}
