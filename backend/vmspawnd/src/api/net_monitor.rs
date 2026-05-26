// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use net_monitor::collector::VMSnapshot;
use net_monitor::models::{CreateMonitorPolicyRequest, MonitorPolicy, MonitorStatus};

use crate::server::AppState;

const STORE_KEY: &str = "monitor_policies";

// ── Monitor Policy CRUD ─────────────────────────────────────────────

pub async fn create_monitor_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateMonitorPolicyRequest>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(create_monitor_policy));
    if let Err((status, msg)) = crate::validation::validate_entity_name(&req.name) {
        return (status, Json(json!({"error": msg}))).into_response();
    }
    if let Some(ref url) = req.webhook_url {
        if let Err(e) = crate::api::notifications::validate_external_url_public(url) {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": format!("Invalid webhook_url: {}", e)}))).into_response();
        }
    }
    let now = Utc::now();
    let policy = MonitorPolicy {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        selector: req.selector,
        thresholds: req.thresholds,
        action: req.action,
        webhook_url: req.webhook_url,
        sample_interval_secs: req.sample_interval_secs,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(STORE_KEY, &policy.id.to_string(), &policy)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_monitor(&state).await {
        tracing::warn!("Post-create monitor reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(policy)).into_response()
}

pub async fn list_monitor_policies(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(list_monitor_policies));
    match state.store.list_entities::<MonitorPolicy>(STORE_KEY) {
        Ok(policies) => (StatusCode::OK, Json(policies)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_monitor_policy(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(get_monitor_policy));
    match state.store.get_entity::<MonitorPolicy>(STORE_KEY, &id) {
        Ok(Some(policy)) => (StatusCode::OK, Json(policy)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Monitor policy not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_monitor_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateMonitorPolicyRequest>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(update_monitor_policy));
    let existing = match state.store.get_entity::<MonitorPolicy>(STORE_KEY, &id) {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Monitor policy not found" })),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let policy = MonitorPolicy {
        id: existing.id,
        name: req.name,
        description: req.description,
        selector: req.selector,
        thresholds: req.thresholds,
        action: req.action,
        webhook_url: req.webhook_url,
        sample_interval_secs: req.sample_interval_secs,
        enabled: req.enabled,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(STORE_KEY, &id, &policy) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_monitor(&state).await {
        tracing::warn!("Post-update monitor reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(policy)).into_response()
}

pub async fn delete_monitor_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(delete_monitor_policy));
    if let Err(e) = state.store.delete_entity(STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_monitor(&state).await {
        tracing::warn!("Post-delete monitor reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Sync and status ─────────────────────────────────────────────────

pub async fn sync_monitor_policies(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(sync_monitor_policies));
    match reconcile_monitor(&state).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "synced" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_monitor_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(get_monitor_status));
    let policies: Vec<MonitorPolicy> = match state.store.list_entities(STORE_KEY) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let vms = build_vm_snapshots(state.as_ref());
    let active_alerts = state.net_monitor.evaluator.get_active_alerts().await;

    let statuses: Vec<MonitorStatus> = policies
        .iter()
        .map(|policy| {
            let matching = vms
                .iter()
                .filter(|vm| policy.selector.matches(&vm.labels))
                .count();
            let policy_alerts = active_alerts
                .iter()
                .filter(|a| a.policy_name == policy.name)
                .count();

            MonitorStatus {
                policy_id: policy.id,
                name: policy.name.clone(),
                matching_vms: matching,
                active_alerts: policy_alerts,
                enforced: policy.enabled,
            }
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

// ── Metrics and alerts ──────────────────────────────────────────────

pub async fn get_all_network_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(get_all_network_metrics));
    let metrics = state.net_monitor.collector.get_all_metrics().await;
    (StatusCode::OK, Json(metrics)).into_response()
}

pub async fn get_vm_network_metrics(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(get_vm_network_metrics));
    match state.net_monitor.collector.get_vm_metrics(&name).await {
        Some(metrics) => (StatusCode::OK, Json(metrics)).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No metrics found for VM" })),
        )
            .into_response(),
    }
}

pub async fn get_bandwidth_alerts(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("net_monitor::{}", stringify!(get_bandwidth_alerts));
    let alerts = state.net_monitor.evaluator.get_active_alerts().await;
    (StatusCode::OK, Json(alerts)).into_response()
}

// ── Reconciliation ──────────────────────────────────────────────────

pub async fn reconcile_monitor(state: &AppState) -> anyhow::Result<()> {
    tracing::debug!("net_monitor::{}", stringify!(reconcile_monitor));
    let policies: Vec<MonitorPolicy> = state.store.list_entities(STORE_KEY)?;

    let vms = build_vm_snapshots(state);

    let enabled: Vec<MonitorPolicy> = policies.into_iter().filter(|p| p.enabled).collect();

    // Collect metrics
    let metrics = state
        .net_monitor
        .collector
        .collect_for_vms(&enabled, &vms)
        .await;

    // Evaluate thresholds
    let alerts = state
        .net_monitor
        .evaluator
        .evaluate(&enabled, &metrics, &vms)
        .await;

    tracing::info!(
        "Reconciled {} monitor policies: {} metrics collected, {} alerts",
        enabled.len(),
        metrics.len(),
        alerts.len()
    );

    Ok(())
}

fn build_vm_snapshots(state: &AppState) -> Vec<VMSnapshot> {
    let vms = match state.store.list_vms() {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    vms.into_iter()
        .map(|vm| {
            let tap = Some(format!("tap-{}", vm.name));
            VMSnapshot {
                name: vm.name,
                labels: vm.labels.clone().unwrap_or_default(),
                tap_interface: tap,
            }
        })
        .collect()
}
