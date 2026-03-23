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
use security::{RequireRead, RequireWrite, RequireAdmin};
use encryption::{EncryptionPolicy, KeyProvider, VmEncryptionStatus};

// ============================================================================
// Key provider handlers
// ============================================================================

pub async fn list_providers(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(list_providers));
    let items: Vec<KeyProvider> = state.store.list_entities("key_providers").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    Json(items)
}

pub async fn register_provider(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut provider): Json<KeyProvider>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(register_provider));
    if provider.id.is_empty() { provider.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    provider.created = now;
    provider.updated = now;
    match state.store.save_entity("key_providers", &provider.id, &provider) {
        Ok(_) => (StatusCode::CREATED, Json(provider)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn remove_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(remove_provider));
    if let Err(e) = state.store.delete_entity("key_providers", &id) {
        tracing::error!("Failed to delete entity: {}", e);
    }
    StatusCode::NO_CONTENT
}

pub async fn test_provider(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(test_provider));
    match state.store.get_entity::<KeyProvider>("key_providers", &id) {
        Ok(Some(p)) => {
            let ok = match p.provider_type {
                encryption::KeyProviderType::Local => true,
                _ => p.endpoint.is_some() && p.status != encryption::KeyProviderStatus::Error,
            };
            Json(serde_json::json!({"connected": ok})).into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// ============================================================================
// Encryption policy handlers
// ============================================================================

pub async fn list_policies(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(list_policies));
    let items: Vec<EncryptionPolicy> = state.store.list_entities("encryption_policies").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    Json(items)
}

pub async fn create_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut policy): Json<EncryptionPolicy>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(create_policy));
    if policy.id.is_empty() { policy.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    policy.created = now;
    policy.updated = now;
    match state.store.save_entity("encryption_policies", &policy.id, &policy) {
        Ok(_) => (StatusCode::CREATED, Json(policy)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_policy(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(get_policy));
    match state.store.get_entity::<EncryptionPolicy>("encryption_policies", &id) {
        Ok(Some(p)) => Json(p).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut policy): Json<EncryptionPolicy>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(update_policy));
    policy.id = id.clone();
    policy.updated = Utc::now();
    if let Err(e) = state.store.save_entity("encryption_policies", &id, &policy) {
        tracing::error!("Failed to save: {}", e);
    }
    Json(policy)
}

pub async fn delete_policy(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(delete_policy));
    if let Err(e) = state.store.delete_entity("encryption_policies", &id) {
        tracing::error!("Failed to delete: {}", e);
    }
    StatusCode::NO_CONTENT
}

// ============================================================================
// VM encryption handlers
// ============================================================================

#[derive(serde::Deserialize)]
pub struct EncryptVmRequest {
    pub vm_name: String,
    pub policy_id: String,
}

pub async fn encrypt_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<EncryptVmRequest>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(encrypt_vm));
    let policy = match state.store.get_entity::<EncryptionPolicy>("encryption_policies", &req.policy_id) {
        Ok(Some(p)) => p,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Policy not found"}))).into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let status = VmEncryptionStatus {
        vm_name: req.vm_name.clone(),
        encrypted: true,
        policy_id: Some(req.policy_id),
        key_id: Some(Uuid::new_v4().to_string()),
        algorithm: Some(policy.algorithm),
        vmotion_encrypted: policy.encrypt_vmotion,
        last_key_rotation: None,
    };
    if let Err(e) = state.store.save_entity("vm_encryption", &req.vm_name, &status) {
        tracing::error!("Failed to save: {}", e);
    }
    (StatusCode::OK, Json(status)).into_response()
}

#[derive(serde::Deserialize)]
pub struct DecryptVmRequest {
    pub vm_name: String,
}

pub async fn decrypt_vm(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<DecryptVmRequest>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(decrypt_vm));
    let status = VmEncryptionStatus {
        vm_name: req.vm_name.clone(),
        encrypted: false,
        policy_id: None,
        key_id: None,
        algorithm: None,
        vmotion_encrypted: false,
        last_key_rotation: None,
    };
    if let Err(e) = state.store.save_entity("vm_encryption", &req.vm_name, &status) {
        tracing::error!("Failed to save: {}", e);
    }
    StatusCode::OK
}

pub async fn get_vm_encryption_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(get_vm_encryption_status));
    match state.store.get_entity::<VmEncryptionStatus>("vm_encryption", &vm_name) {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn list_encrypted_vms(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(list_encrypted_vms));
    let items: Vec<VmEncryptionStatus> = state.store.list_entities("vm_encryption").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    let encrypted: Vec<_> = items.into_iter().filter(|s| s.encrypted).collect();
    Json(encrypted)
}

pub async fn rotate_vm_key(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(rotate_vm_key));
    let mut status = match state.store.get_entity::<VmEncryptionStatus>("vm_encryption", &vm_name) {
        Ok(Some(s)) => s,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if !status.encrypted {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "VM is not encrypted"}))).into_response();
    }
    status.key_id = Some(Uuid::new_v4().to_string());
    status.last_key_rotation = Some(Utc::now());
    if let Err(e) = state.store.save_entity("vm_encryption", &vm_name, &status) {
        tracing::error!("Failed to save: {}", e);
    }
    Json(status).into_response()
}
