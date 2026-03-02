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

use packet_mirror::compiler::VMSnapshot;
use packet_mirror::models::{CreateMirrorSessionRequest, MirrorSession, MirrorStatus};

use crate::server::AppState;

const STORE_KEY: &str = "mirror_sessions";

// ── Mirror Session CRUD ─────────────────────────────────────────────

pub async fn create_mirror_session(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateMirrorSessionRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let session = MirrorSession {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        selector: req.selector,
        collector_type: req.collector_type,
        collector_target: req.collector_target,
        direction: req.direction,
        filter: req.filter,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(STORE_KEY, &session.id.to_string(), &session)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_mirrors(&state).await {
        tracing::warn!("Post-create mirror reconciliation failed: {}", e);
    }

    (StatusCode::CREATED, Json(session)).into_response()
}

pub async fn list_mirror_sessions(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.store.list_entities::<MirrorSession>(STORE_KEY) {
        Ok(sessions) => (StatusCode::OK, Json(sessions)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_mirror_session(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<MirrorSession>(STORE_KEY, &id) {
        Ok(Some(session)) => (StatusCode::OK, Json(session)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Mirror session not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_mirror_session(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateMirrorSessionRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<MirrorSession>(STORE_KEY, &id) {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Mirror session not found" })),
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

    let session = MirrorSession {
        id: existing.id,
        name: req.name,
        description: req.description,
        selector: req.selector,
        collector_type: req.collector_type,
        collector_target: req.collector_target,
        direction: req.direction,
        filter: req.filter,
        enabled: req.enabled,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(STORE_KEY, &id, &session) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_mirrors(&state).await {
        tracing::warn!("Post-update mirror reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(session)).into_response()
}

pub async fn delete_mirror_session(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(STORE_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_mirrors(&state).await {
        tracing::warn!("Post-delete mirror reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Sync and status ─────────────────────────────────────────────────

pub async fn sync_mirror_sessions(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match reconcile_mirrors(&state).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "synced" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_mirror_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let sessions: Vec<MirrorSession> = match state.store.list_entities(STORE_KEY) {
        Ok(s) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let vms = build_vm_snapshots(state.as_ref());
    let statuses: Vec<MirrorStatus> = sessions
        .iter()
        .map(|session| {
            let rules = state
                .packet_mirror
                .compiler
                .compile_session(session, &vms);

            MirrorStatus {
                session_id: session.id,
                name: session.name.clone(),
                matching_vms: rules.len(),
                active_mirrors: rules.len(),
                enforced: session.enabled,
            }
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

// ── Reconciliation ──────────────────────────────────────────────────

pub async fn reconcile_mirrors(state: &AppState) -> anyhow::Result<()> {
    let sessions: Vec<MirrorSession> = state.store.list_entities(STORE_KEY)?;

    let vms = build_vm_snapshots(state);

    let enabled: Vec<MirrorSession> = sessions.into_iter().filter(|s| s.enabled).collect();
    let rules = state
        .packet_mirror
        .compiler
        .compile_all(&enabled, &vms);

    state.packet_mirror.enforcer.sync_all(&rules)?;

    tracing::info!(
        "Reconciled {} mirror sessions → {} rules",
        enabled.len(),
        rules.len()
    );

    Ok(())
}

fn build_vm_snapshots(state: &AppState) -> Vec<VMSnapshot> {
    let vms = match state.store.list_vms() {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    vms.into_iter()
        .filter_map(|vm| {
            let tap = Some(format!("tap-{}", vm.name));
            Some(VMSnapshot {
                name: vm.name,
                labels: vm.labels.clone().unwrap_or_default(),
                tap_interface: tap,
            })
        })
        .collect()
}
