// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! Platform subsystem reachability for dashboard health cards.

use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::server::AppState;
use security::RequireRead;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SubsystemPhase {
    Off,
    Unreachable,
    Live,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubsystemStatus {
    pub phase: SubsystemPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CapabilitiesResponse {
    pub vm_driver: SubsystemStatus,
    pub storage: SubsystemStatus,
    pub network_security: SubsystemStatus,
    pub auth: SubsystemStatus,
    pub events: SubsystemStatus,
}

/// GET /api/v1/capabilities — live status of core platform subsystems.
pub async fn get_capabilities(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<CapabilitiesResponse> {
    let vm_driver = probe_vm_driver(&state).await;
    let storage = probe_storage(&state).await;
    let network_security = probe_network_security(&state);
    let auth = probe_auth(&state);
    let events = probe_events(&state);

    Json(CapabilitiesResponse {
        vm_driver,
        storage,
        network_security,
        auth,
        events,
    })
}

async fn probe_vm_driver(state: &AppState) -> SubsystemStatus {
    match state.driver.list_machines().await {
        Ok(machines) => SubsystemStatus {
            phase: SubsystemPhase::Live,
            detail: Some(format!("{} machine(s) registered", machines.len())),
        },
        Err(e) => {
            tracing::debug!("capabilities: vm driver unreachable: {}", e);
            SubsystemStatus {
                phase: SubsystemPhase::Unreachable,
                detail: Some("Could not reach the FluxVM VM driver".to_string()),
            }
        }
    }
}

async fn probe_storage(state: &AppState) -> SubsystemStatus {
    let manager = state.storage_manager.read().await;
    let pools = manager.list_pools().await;
    let n = pools.len();
    SubsystemStatus {
        phase: SubsystemPhase::Live,
        detail: Some(format!("{n} storage pool(s)")),
    }
}

fn probe_auth(state: &AppState) -> SubsystemStatus {
    match (&state.jwt_config, &state.user_db) {
        (Some(_), Some(_)) => SubsystemStatus {
            phase: SubsystemPhase::Live,
            detail: Some("JWT and user database configured".to_string()),
        },
        (None, _) => SubsystemStatus {
            phase: SubsystemPhase::Off,
            detail: Some("Authentication disabled".to_string()),
        },
        _ => SubsystemStatus {
            phase: SubsystemPhase::Unreachable,
            detail: Some("Auth enabled but user database unavailable".to_string()),
        },
    }
}

fn probe_events(state: &AppState) -> SubsystemStatus {
    let receivers = state.event_tx.receiver_count();
    SubsystemStatus {
        phase: SubsystemPhase::Live,
        detail: Some(format!("SSE broadcast ready · {receivers} subscriber(s)")),
    }
}

fn probe_network_security(state: &AppState) -> SubsystemStatus {
    let policy_count = state
        .store
        .list_entities::<serde_json::Value>("network_policies")
        .map(|v| v.len())
        .unwrap_or(0);
    SubsystemStatus {
        phase: SubsystemPhase::Live,
        detail: Some(format!(
            "Policy engine active · {policy_count} network polic(ies)"
        )),
    }
}
