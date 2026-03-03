use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub id: String,
    pub pool_name: String,
    pub name: String,
    pub size: String,
    pub vm_attached: Option<String>,
    pub created: String,
    pub updated: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateVolumeRequest {
    pub name: String,
    pub size: String,
}

#[derive(Debug, Deserialize)]
pub struct ResizeVolumeRequest {
    pub size: String,
}

#[derive(Debug, Deserialize)]
pub struct AttachVolumeRequest {
    pub vm_name: String,
}

/// POST /api/storage/pools/:name/volumes - Create a volume in a pool
pub async fn create_volume(
    State(state): State<Arc<AppState>>,
    Path(pool_name): Path<String>,
    Json(req): Json<CreateVolumeRequest>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(create_volume));
    // Verify pool exists
    let manager = state.storage_manager.read().await;
    if manager.get_pool(&pool_name).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": format!("Pool '{}' not found", pool_name)})),
        )
            .into_response();
    }

    let now = Utc::now().to_rfc3339();
    let volume = Volume {
        id: Uuid::new_v4().to_string(),
        pool_name: pool_name.clone(),
        name: req.name,
        size: req.size,
        vm_attached: None,
        created: now.clone(),
        updated: now,
    };

    let store_key = format!("volumes_{}", pool_name);
    match state.store.save_entity(&store_key, &volume.id, &volume) {
        Ok(_) => (StatusCode::CREATED, Json(volume)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/storage/pools/:name/volumes - List volumes in a pool
pub async fn list_volumes(
    State(state): State<Arc<AppState>>,
    Path(pool_name): Path<String>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(list_volumes));
    let store_key = format!("volumes_{}", pool_name);
    let items: Vec<Volume> = state.store.list_entities(&store_key).unwrap_or_default();
    Json(items)
}

/// GET /api/storage/pools/:name/volumes/:id - Get a volume
pub async fn get_volume(
    State(state): State<Arc<AppState>>,
    Path((pool_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(get_volume));
    let store_key = format!("volumes_{}", pool_name);
    match state.store.get_entity::<Volume>(&store_key, &id) {
        Ok(Some(v)) => Json(v).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// DELETE /api/storage/pools/:name/volumes/:id - Delete a volume
pub async fn delete_volume(
    State(state): State<Arc<AppState>>,
    Path((pool_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(delete_volume));
    let store_key = format!("volumes_{}", pool_name);
    if let Err(e) = state.store.delete_entity(&store_key, &id) {
        tracing::error!("Failed to delete volume: {}", e);
    }
    StatusCode::NO_CONTENT
}

/// POST /api/storage/pools/:name/volumes/:id/resize - Resize a volume
pub async fn resize_volume(
    State(state): State<Arc<AppState>>,
    Path((pool_name, id)): Path<(String, String)>,
    Json(req): Json<ResizeVolumeRequest>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(resize_volume));
    let store_key = format!("volumes_{}", pool_name);
    match state.store.get_entity::<Volume>(&store_key, &id) {
        Ok(Some(mut v)) => {
            v.size = req.size;
            v.updated = Utc::now().to_rfc3339();
            match state.store.save_entity(&store_key, &v.id, &v) {
                Ok(_) => Json(v).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response(),
            }
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// POST /api/storage/pools/:name/volumes/:id/attach - Attach volume to VM
pub async fn attach_volume(
    State(state): State<Arc<AppState>>,
    Path((pool_name, id)): Path<(String, String)>,
    Json(req): Json<AttachVolumeRequest>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(attach_volume));
    let store_key = format!("volumes_{}", pool_name);
    match state.store.get_entity::<Volume>(&store_key, &id) {
        Ok(Some(mut v)) => {
            if v.vm_attached.is_some() {
                return (
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({"error": "Volume already attached to a VM"})),
                )
                    .into_response();
            }
            v.vm_attached = Some(req.vm_name);
            v.updated = Utc::now().to_rfc3339();
            match state.store.save_entity(&store_key, &v.id, &v) {
                Ok(_) => Json(v).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response(),
            }
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// POST /api/storage/pools/:name/volumes/:id/detach - Detach volume from VM
pub async fn detach_volume(
    State(state): State<Arc<AppState>>,
    Path((pool_name, id)): Path<(String, String)>,
) -> impl IntoResponse {
    tracing::debug!("volumes::{}", stringify!(detach_volume));
    let store_key = format!("volumes_{}", pool_name);
    match state.store.get_entity::<Volume>(&store_key, &id) {
        Ok(Some(mut v)) => {
            v.vm_attached = None;
            v.updated = Utc::now().to_rfc3339();
            match state.store.save_entity(&store_key, &v.id, &v) {
                Ok(_) => Json(v).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": e.to_string()})),
                )
                    .into_response(),
            }
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
