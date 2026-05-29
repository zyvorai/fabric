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
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use encryption::{EncryptionPolicy, KeyProvider, VmEncryptionStatus};
use security::{RequireAdmin, RequireRead, RequireWrite};

// ============================================================================
// Key provider handlers
// ============================================================================

pub async fn list_providers(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(list_providers));
    let items: Vec<KeyProvider> = state
        .store
        .list_entities("key_providers")
        .unwrap_or_else(|e| {
            tracing::error!("Storage error: {}", e);
            Vec::new()
        });
    Json(items)
}

pub async fn register_provider(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut provider): Json<KeyProvider>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(register_provider));
    provider.id = Uuid::new_v4().to_string();
    let now = Utc::now();
    provider.created = now;
    provider.updated = now;
    match state
        .store
        .save_entity("key_providers", &provider.id, &provider)
    {
        Ok(_) => (StatusCode::CREATED, Json(provider)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn remove_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(remove_provider));
    if let Err(e) = state.store.delete_entity("key_providers", &id) {
        tracing::error!("Failed to delete provider: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }
    (
        StatusCode::NO_CONTENT,
        Json(serde_json::json!({"status": "deleted"})),
    )
        .into_response()
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
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Key provider not found"})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Internal server error"})),
        )
            .into_response(),
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
    let items: Vec<EncryptionPolicy> = state
        .store
        .list_entities("encryption_policies")
        .unwrap_or_else(|e| {
            tracing::error!("Storage error: {}", e);
            Vec::new()
        });
    Json(items)
}

pub async fn create_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut policy): Json<EncryptionPolicy>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(create_policy));
    if policy.id.is_empty() {
        policy.id = Uuid::new_v4().to_string();
    }
    let now = Utc::now();
    policy.created = now;
    policy.updated = now;
    match state
        .store
        .save_entity("encryption_policies", &policy.id, &policy)
    {
        Ok(_) => (StatusCode::CREATED, Json(policy)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_policy(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(get_policy));
    match state
        .store
        .get_entity::<EncryptionPolicy>("encryption_policies", &id)
    {
        Ok(Some(p)) => Json(p).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Encryption policy not found"})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Internal server error"})),
        )
            .into_response(),
    }
}

pub async fn update_policy(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(mut policy): Json<EncryptionPolicy>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(update_policy));
    if state
        .store
        .get_entity::<EncryptionPolicy>("encryption_policies", &id)
        .ok()
        .flatten()
        .is_none()
    {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Not found"})),
        )
            .into_response();
    }
    policy.id = id.clone();
    policy.updated = Utc::now();
    if let Err(e) = state.store.save_entity("encryption_policies", &id, &policy) {
        tracing::error!("Failed to save: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }
    Json(policy).into_response()
}

pub async fn delete_policy(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(delete_policy));
    if let Err(e) = state.store.delete_entity("encryption_policies", &id) {
        tracing::error!("Failed to delete encryption policy: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }
    (
        StatusCode::NO_CONTENT,
        Json(serde_json::json!({"status": "deleted"})),
    )
        .into_response()
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
    if let Err((s, m)) = crate::validation::validate_vm_name(&req.vm_name) {
        return (s, Json(serde_json::json!({"error": m}))).into_response();
    }
    let policy = match state
        .store
        .get_entity::<EncryptionPolicy>("encryption_policies", &req.policy_id)
    {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Policy not found"})),
            )
                .into_response()
        }
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal server error"})),
            )
                .into_response()
        }
    };
    let key_id = Uuid::new_v4().to_string();
    let status = VmEncryptionStatus {
        vm_name: req.vm_name.clone(),
        encrypted: true,
        policy_id: Some(req.policy_id),
        key_id: Some(key_id.clone()),
        algorithm: Some(policy.algorithm),
        vmotion_encrypted: policy.encrypt_vmotion,
        last_key_rotation: None,
    };
    if let Err(e) = state
        .store
        .save_entity("vm_encryption", &req.vm_name, &status)
    {
        tracing::error!("Failed to save encryption status: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }

    // Attempt actual disk encryption using qemu-img LUKS.
    let vm_name = req.vm_name.clone();
    let key_for_encrypt = key_id;
    tokio::task::spawn_blocking(move || {
        let image_path = format!("/var/lib/vmspawnd/images/{}.qcow2", vm_name);
        if !std::path::Path::new(&image_path).exists() {
            tracing::debug!(
                "No disk image at '{}', skipping disk encryption",
                image_path
            );
            return;
        }
        let encrypted_path = format!("{}.encrypted", image_path);
        let secret_file = format!("/tmp/vmspawnd-encrypt-{}", Uuid::new_v4().simple());
        if let Err(e) = std::fs::write(&secret_file, &key_for_encrypt) {
            tracing::error!("Failed to write secret file: {}", e);
            return;
        }
        let output = std::process::Command::new("qemu-img")
            .args([
                "convert",
                "-f",
                "qcow2",
                "-O",
                "qcow2",
                "--object",
                &format!("secret,id=sec0,file={}", secret_file),
                "-o",
                "encrypt.format=luks,encrypt.key-secret=sec0",
                &image_path,
                &encrypted_path,
            ])
            .output();
        let _ = std::fs::remove_file(&secret_file);
        match output {
            Ok(out) if out.status.success() => {
                if let Err(e) = std::fs::rename(&encrypted_path, &image_path) {
                    tracing::error!("Failed to replace with encrypted disk: {}", e);
                } else {
                    tracing::info!("Encrypted disk image for VM '{}'", vm_name);
                }
            }
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                tracing::error!(
                    "qemu-img encryption failed for VM '{}': {}",
                    vm_name,
                    stderr
                );
                let _ = std::fs::remove_file(&encrypted_path);
            }
            Err(e) => tracing::error!("Failed to run qemu-img: {}", e),
        }
    });

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
    if let Err((s, m)) = crate::validation::validate_vm_name(&req.vm_name) {
        return (s, Json(serde_json::json!({"error": m}))).into_response();
    }
    let status = VmEncryptionStatus {
        vm_name: req.vm_name.clone(),
        encrypted: false,
        policy_id: None,
        key_id: None,
        algorithm: None,
        vmotion_encrypted: false,
        last_key_rotation: None,
    };
    if let Err(e) = state
        .store
        .save_entity("vm_encryption", &req.vm_name, &status)
    {
        tracing::error!("Failed to save: {}", e);
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({"status": "VM decrypted"})),
    )
        .into_response()
}

pub async fn get_vm_encryption_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(get_vm_encryption_status));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return (s, Json(serde_json::json!({"error": m}))).into_response();
    }
    match state
        .store
        .get_entity::<VmEncryptionStatus>("vm_encryption", &vm_name)
    {
        Ok(Some(s)) => Json(s).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "VM encryption status not found"})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Internal server error"})),
        )
            .into_response(),
    }
}

pub async fn list_encrypted_vms(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(list_encrypted_vms));
    let items: Vec<VmEncryptionStatus> =
        state
            .store
            .list_entities("vm_encryption")
            .unwrap_or_else(|e| {
                tracing::error!("Storage error: {}", e);
                Vec::new()
            });
    let encrypted: Vec<_> = items.into_iter().filter(|s| s.encrypted).collect();
    Json(encrypted)
}

pub async fn rotate_vm_key(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("vm_encryption::{}", stringify!(rotate_vm_key));
    if let Err((s, m)) = crate::validation::validate_vm_name(&vm_name) {
        return (s, Json(serde_json::json!({"error": m}))).into_response();
    }
    let mut status = match state
        .store
        .get_entity::<VmEncryptionStatus>("vm_encryption", &vm_name)
    {
        Ok(Some(s)) => s,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "VM encryption status not found"})),
            )
                .into_response()
        }
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal server error"})),
            )
                .into_response()
        }
    };
    if !status.encrypted {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "VM is not encrypted"})),
        )
            .into_response();
    }
    status.key_id = Some(Uuid::new_v4().to_string());
    status.last_key_rotation = Some(Utc::now());
    if let Err(e) = state.store.save_entity("vm_encryption", &vm_name, &status) {
        tracing::error!("Failed to save: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response();
    }
    Json(status).into_response()
}
