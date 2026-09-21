// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Fabric AI Workloads — Inference plane (preview).
//!
//! REST resources for model artifacts, inference profiles, deployments, and
//! OpenAI-compatible endpoints backed by QEMU GPU VMs via FluxVM. Marked
//! preview: APIs and reconciler behaviour may change before GA.
//!
//! Golden image: bake CUDA + vLLM into a qcow2; cloud-init only writes the
//! systemd unit that points vLLM at the mounted model path. Set
//! `FLUXVM_AI_IMAGE` to that qcow2. For model materialization without a
//! Hugging Face download, set `FLUXVM_AI_MODEL_DIR` to a verified local tree.

pub mod autoscaling;
pub mod capacity;
pub mod deployments;
pub mod endpoints;
pub mod gateway;
pub mod gpus;
pub mod keys;
pub mod maglev;
pub mod model_cache;
pub mod models;
pub mod placement;
pub mod profiles;
pub mod reconcile;
pub mod rollouts;
pub mod routing;
pub mod types;

use crate::server::AppState;
use zyvor_fabric_fluxvm_client::FluxVmClient;

pub(crate) const STORE_MODELS: &str = "ai_model_artifacts";
pub(crate) const STORE_PROFILES: &str = "ai_inference_profiles";
pub(crate) const STORE_DEPLOYMENTS: &str = "ai_inference_deployments";
pub(crate) const STORE_ENDPOINTS: &str = "ai_inference_endpoints";

pub(crate) fn fluxvm_client(
    state: &AppState,
) -> Result<FluxVmClient, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    let client = FluxVmClient::new(&state.config.driver.fluxvm_url).map_err(|e| {
        (
            axum::http::StatusCode::BAD_GATEWAY,
            axum::Json(serde_json::json!({ "error": format!("FluxVM client: {e}") })),
        )
    })?;
    Ok(match state.config.driver.fluxvm_token.as_deref() {
        Some(t) if !t.is_empty() => client.with_token(t.to_owned()),
        _ => client,
    })
}

pub(crate) fn audit(state: &AppState, user: &str, action: &str, resource: &str, status: &str) {
    let entry = security::AuditLog::new(
        user.to_string(),
        action.to_string(),
        resource.to_string(),
        status.to_string(),
    );
    if let Err(e) = entry.log() {
        tracing::warn!("Failed to write audit log: {}", e);
    }
    if let Err(e) = state.store.save_entity("audit_logs", &entry.id, &entry) {
        tracing::warn!("Failed to persist audit log: {}", e);
    }
}

pub(crate) fn err(
    status: axum::http::StatusCode,
    msg: impl Into<String>,
) -> (axum::http::StatusCode, axum::Json<serde_json::Value>) {
    (
        status,
        axum::Json(serde_json::json!({ "error": msg.into() })),
    )
}
