use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use vm_firewall::compiler::VMSnapshot;
use vm_firewall::models::{
    AssignFirewallRequest, CreateFirewallProfileRequest, CreateFirewallZoneRequest,
    FirewallProfile, FirewallStatus, FirewallZone, VMFirewallAssignment,
};

use crate::server::AppState;

const PROFILES_KEY: &str = "firewall_profiles";
const ZONES_KEY: &str = "firewall_zones";
const ASSIGNMENTS_KEY: &str = "firewall_assignments";

// ── Firewall Profile CRUD ───────────────────────────────────────────

pub async fn create_profile(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFirewallProfileRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let profile = FirewallProfile {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        default_action: req.default_action,
        rules: req.rules,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(PROFILES_KEY, &profile.id.to_string(), &profile)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    (StatusCode::CREATED, Json(profile)).into_response()
}

pub async fn list_profiles(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.store.list_entities::<FirewallProfile>(PROFILES_KEY) {
        Ok(profiles) => (StatusCode::OK, Json(profiles)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_profile(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<FirewallProfile>(PROFILES_KEY, &id) {
        Ok(Some(profile)) => (StatusCode::OK, Json(profile)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Firewall profile not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn update_profile(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<CreateFirewallProfileRequest>,
) -> impl IntoResponse {
    let existing = match state.store.get_entity::<FirewallProfile>(PROFILES_KEY, &id) {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Firewall profile not found" })),
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

    let profile = FirewallProfile {
        id: existing.id,
        name: req.name,
        description: req.description,
        default_action: req.default_action,
        rules: req.rules,
        created: existing.created,
        updated: Utc::now(),
    };

    if let Err(e) = state.store.save_entity(PROFILES_KEY, &id, &profile) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_firewall(&state).await {
        tracing::warn!("Post-update firewall reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(profile)).into_response()
}

pub async fn delete_profile(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(PROFILES_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_firewall(&state).await {
        tracing::warn!("Post-delete firewall reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Firewall Zone CRUD ──────────────────────────────────────────────

pub async fn create_zone(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFirewallZoneRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let zone = FirewallZone {
        id: Uuid::new_v4(),
        name: req.name,
        description: req.description,
        default_profile_id: req.default_profile_id,
        created: now,
        updated: now,
    };

    if let Err(e) = state
        .store
        .save_entity(ZONES_KEY, &zone.id.to_string(), &zone)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    (StatusCode::CREATED, Json(zone)).into_response()
}

pub async fn list_zones(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.store.list_entities::<FirewallZone>(ZONES_KEY) {
        Ok(zones) => (StatusCode::OK, Json(zones)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_zone(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<FirewallZone>(ZONES_KEY, &id) {
        Ok(Some(zone)) => (StatusCode::OK, Json(zone)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Firewall zone not found" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_zone(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(ZONES_KEY, &id) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── VM Firewall Assignment ──────────────────────────────────────────

pub async fn get_vm_firewall(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state
        .store
        .get_entity::<VMFirewallAssignment>(ASSIGNMENTS_KEY, &name)
    {
        Ok(Some(assignment)) => (StatusCode::OK, Json(assignment)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No firewall assignment for this VM" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn assign_vm_firewall(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    Json(req): Json<AssignFirewallRequest>,
) -> impl IntoResponse {
    let assignment = VMFirewallAssignment {
        vm_name: name.clone(),
        profile_id: req.profile_id,
        zone_id: req.zone_id,
    };

    if let Err(e) = state
        .store
        .save_entity(ASSIGNMENTS_KEY, &name, &assignment)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_firewall(&state).await {
        tracing::warn!("Post-assign firewall reconciliation failed: {}", e);
    }

    (StatusCode::OK, Json(assignment)).into_response()
}

pub async fn remove_vm_firewall(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = state.store.delete_entity(ASSIGNMENTS_KEY, &name) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    if let Err(e) = reconcile_firewall(&state).await {
        tracing::warn!("Post-remove firewall reconciliation failed: {}", e);
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Sync and status ─────────────────────────────────────────────────

pub async fn sync_firewall(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match reconcile_firewall(&state).await {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "synced" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_firewall_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let profiles: Vec<FirewallProfile> = match state.store.list_entities(PROFILES_KEY) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let assignments: Vec<VMFirewallAssignment> = state
        .store
        .list_entities(ASSIGNMENTS_KEY)
        .unwrap_or_default();

    let statuses: Vec<FirewallStatus> = profiles
        .iter()
        .map(|profile| {
            let assigned = assignments
                .iter()
                .filter(|a| a.profile_id == profile.id)
                .count();

            FirewallStatus {
                profile_id: profile.id,
                name: profile.name.clone(),
                assigned_vms: assigned,
                rules_count: profile.rules.len(),
                enforced: assigned > 0,
            }
        })
        .collect();

    (StatusCode::OK, Json(statuses)).into_response()
}

// ── Reconciliation ──────────────────────────────────────────────────

pub async fn reconcile_firewall(state: &AppState) -> anyhow::Result<()> {
    let assignments: Vec<VMFirewallAssignment> = state.store.list_entities(ASSIGNMENTS_KEY)?;
    let profiles_list: Vec<FirewallProfile> = state.store.list_entities(PROFILES_KEY)?;

    let profiles: HashMap<Uuid, FirewallProfile> =
        profiles_list.into_iter().map(|p| (p.id, p)).collect();

    let vms = build_vm_snapshots(state);

    let chains = state
        .vm_firewall
        .compiler
        .compile_all(&assignments, &profiles, &vms);

    state.vm_firewall.enforcer.sync_chains(&chains)?;

    tracing::info!(
        "Reconciled {} firewall assignments → {} chains",
        assignments.len(),
        chains.len()
    );

    Ok(())
}

fn build_vm_snapshots(state: &AppState) -> Vec<VMSnapshot> {
    let vms = match state.store.list_vms() {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    vms.into_iter()
        .map(|vm| VMSnapshot {
            name: vm.name,
            ip: vm.ip,
        })
        .collect()
}
