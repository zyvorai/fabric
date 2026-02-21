use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use content_library::{
    ComplianceResult, CreateLibraryRequest, GuestCustomizationSpec, HostProfile, Library,
    LibraryItem, LibraryType,
};

// ============================================================================
// Library handlers
// ============================================================================

pub async fn list_libraries(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<Library> = state.store.list_entities("libraries").unwrap_or_default();
    Json(items)
}

pub async fn create_library(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLibraryRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let library = Library {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        library_type: req.library_type,
        storage_path: req.storage_path,
        publish_url: req.publish_url,
        subscription_url: req.subscription_url,
        auto_sync: req.auto_sync,
        sync_interval_hours: req.sync_interval_hours.unwrap_or(24),
        last_sync: None,
        item_count: 0,
        total_size_bytes: 0,
        created: now,
        updated: now,
    };
    match state.store.save_entity("libraries", &library.id, &library) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&library).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_library(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<Library>("libraries", &id) {
        Ok(Some(l)) => Json(serde_json::to_value(&l).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_library(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("libraries", &id);
    StatusCode::NO_CONTENT
}

pub async fn sync_library(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut lib = match state.store.get_entity::<Library>("libraries", &id) {
        Ok(Some(l)) => l,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if lib.library_type != LibraryType::Subscribed {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": "Not a subscribed library"}))).into_response();
    }
    lib.last_sync = Some(Utc::now());
    lib.updated = Utc::now();
    let _ = state.store.save_entity("libraries", &lib.id, &lib);
    StatusCode::OK.into_response()
}

// ============================================================================
// Download handler
// ============================================================================

#[derive(serde::Deserialize)]
pub struct DownloadImageRequest {
    pub url: String,
    pub name: String,
    #[serde(default = "default_item_type")]
    pub item_type: content_library::ItemType,
}

fn default_item_type() -> content_library::ItemType {
    content_library::ItemType::VmImage
}

pub async fn download_image(
    State(state): State<Arc<AppState>>,
    Path(library_id): Path<String>,
    Json(req): Json<DownloadImageRequest>,
) -> impl IntoResponse {
    // Verify library exists
    match state.store.get_entity::<Library>("libraries", &library_id) {
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let mgr = content_library::ContentLibraryManager::new();

    // We need a library in the manager. Create a temporary one with the storage path.
    let lib = match state.store.get_entity::<Library>("libraries", &library_id) {
        Ok(Some(l)) => l,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    // Create library in the in-memory manager so download_image can find it
    let _ = mgr.create_library(content_library::CreateLibraryRequest {
        name: lib.name.clone(),
        description: lib.description.clone(),
        library_type: lib.library_type.clone(),
        storage_path: lib.storage_path.clone(),
        publish_url: None,
        subscription_url: None,
        auto_sync: false,
        sync_interval_hours: None,
    });

    // Find the library ID in the manager (it generates a new one)
    let manager_libs = mgr.list_libraries();
    let manager_lib_id = match manager_libs.first() {
        Some(l) => l.id.clone(),
        None => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    match mgr.download_image(&manager_lib_id, &req.url, &req.name, req.item_type).await {
        Ok(item) => {
            // Save to our state store
            let mut saved_item = item.clone();
            saved_item.library_id = library_id;
            let id = Uuid::new_v4().to_string();
            saved_item.id = id.clone();
            match state.store.save_entity("library_items", &id, &saved_item) {
                Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&saved_item).unwrap())).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
            }
        }
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}

// ============================================================================
// Library item handlers
// ============================================================================

pub async fn list_library_items(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<LibraryItem> = state.store.list_entities("library_items").unwrap_or_default();
    Json(items)
}

pub async fn add_library_item(
    State(state): State<Arc<AppState>>,
    Json(mut item): Json<LibraryItem>,
) -> impl IntoResponse {
    item.id = Uuid::new_v4().to_string();
    let now = Utc::now();
    item.created = now;
    item.updated = now;
    if item.version == 0 { item.version = 1; }
    match state.store.save_entity("library_items", &item.id, &item) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&item).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_library_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<LibraryItem>("library_items", &id) {
        Ok(Some(i)) => Json(serde_json::to_value(&i).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_library_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("library_items", &id);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search_items(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> impl IntoResponse {
    let items: Vec<LibraryItem> = state.store.list_entities("library_items").unwrap_or_default();
    let q = query.q.to_lowercase();
    let matched: Vec<_> = items.into_iter().filter(|i| i.name.to_lowercase().contains(&q)).collect();
    Json(matched)
}

// ============================================================================
// Customization spec handlers
// ============================================================================

pub async fn list_customization_specs(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<GuestCustomizationSpec> = state.store.list_entities("customization_specs").unwrap_or_default();
    Json(items)
}

pub async fn create_customization_spec(
    State(state): State<Arc<AppState>>,
    Json(mut spec): Json<GuestCustomizationSpec>,
) -> impl IntoResponse {
    spec.id = Uuid::new_v4().to_string();
    let now = Utc::now();
    spec.created = now;
    spec.updated = now;
    match state.store.save_entity("customization_specs", &spec.id, &spec) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&spec).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_customization_spec(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<GuestCustomizationSpec>("customization_specs", &id) {
        Ok(Some(s)) => Json(serde_json::to_value(&s).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_customization_spec(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("customization_specs", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Host profile handlers
// ============================================================================

pub async fn list_host_profiles(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<HostProfile> = state.store.list_entities("host_profiles").unwrap_or_default();
    Json(items)
}

pub async fn create_host_profile(
    State(state): State<Arc<AppState>>,
    Json(mut profile): Json<HostProfile>,
) -> impl IntoResponse {
    profile.id = Uuid::new_v4().to_string();
    let now = Utc::now();
    profile.created = now;
    profile.updated = now;
    match state.store.save_entity("host_profiles", &profile.id, &profile) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&profile).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn get_host_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<HostProfile>("host_profiles", &id) {
        Ok(Some(p)) => Json(serde_json::to_value(&p).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn delete_host_profile(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("host_profiles", &id);
    StatusCode::NO_CONTENT
}

#[derive(serde::Deserialize)]
pub struct HostComplianceRequest {
    pub host_id: String,
    pub current_config: serde_json::Value,
}

pub async fn check_host_compliance(
    State(state): State<Arc<AppState>>,
    Path(profile_id): Path<String>,
    Json(req): Json<HostComplianceRequest>,
) -> impl IntoResponse {
    let mgr = content_library::ContentLibraryManager::new();
    // Load profile into the manager for compliance check
    if let Ok(Some(profile)) = state.store.get_entity::<HostProfile>("host_profiles", &profile_id) {
        let _ = mgr.create_host_profile(profile);
    }
    let result = mgr.check_host_compliance(&req.host_id, &profile_id, &req.current_config);
    Json(serde_json::to_value(&result).unwrap())
}
