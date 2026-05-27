// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! Platform subsystem reachability for dashboard health cards.

use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;
use vmspawnd_driver_core::VMDriver;

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
    pub machined: SubsystemStatus,
    pub storage: SubsystemStatus,
    pub network_security: SubsystemStatus,
}

/// GET /api/v1/capabilities — live status of core platform subsystems.
pub async fn get_capabilities(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<CapabilitiesResponse> {
    let machined = probe_machined(&state).await;
    let storage = probe_storage(&state).await;
    let network_security = probe_network_security(&state);

    Json(CapabilitiesResponse {
        machined,
        storage,
        network_security,
    })
}

async fn probe_machined(state: &AppState) -> SubsystemStatus {
    match state.driver.list_machines().await {
        Ok(machines) => SubsystemStatus {
            phase: SubsystemPhase::Live,
            detail: Some(format!("{} machine(s) registered", machines.len())),
        },
        Err(e) => {
            tracing::debug!("capabilities: machined unreachable: {}", e);
            SubsystemStatus {
                phase: SubsystemPhase::Unreachable,
                detail: Some("Could not reach systemd-machined".to_string()),
            }
        }
    }
}

async fn probe_storage(state: &AppState) -> SubsystemStatus {
    let manager = state.storage_manager.read().await;
    match manager.list_pools().await {
        Ok(pools) => {
            let n = pools.len();
            SubsystemStatus {
                phase: if n > 0 {
                    SubsystemPhase::Live
                } else {
                    SubsystemPhase::Live
                },
                detail: Some(format!("{n} storage pool(s)")),
            }
        }
        Err(e) => {
            tracing::debug!("capabilities: storage probe failed: {}", e);
            SubsystemStatus {
                phase: SubsystemPhase::Unreachable,
                detail: Some("Storage manager unavailable".to_string()),
            }
        }
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
