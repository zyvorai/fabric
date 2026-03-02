use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use tokio::process::Command;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMTemplate {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cpus: u32,
    pub memory: u64,
    pub disk: u64,
    pub image: String,
    pub cloud_init: Option<serde_json::Value>,
    pub tags: Vec<String>,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub cpus: u32,
    pub memory: u64,
    pub disk: u64,
    pub image: String,
    pub cloud_init: Option<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// If set, create template from existing VM config
    pub from_vm: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub cpus: Option<u32>,
    pub memory: Option<u64>,
    pub disk: Option<u64>,
    pub image: Option<String>,
    pub cloud_init: Option<serde_json::Value>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct DeployTemplateRequest {
    pub vm_name: String,
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /api/templates - Create a new template
pub async fn create_template(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateTemplateRequest>,
) -> Result<(StatusCode, Json<VMTemplate>), (StatusCode, Json<serde_json::Value>)> {
    let now = Utc::now();

    let (cpus, memory, disk, image, tags) = if let Some(ref vm_name) = req.from_vm {
        // Create template from existing VM
        match state.store.get_vm(vm_name) {
            Ok(Some(vm)) => (
                vm.cpus,
                vm.memory,
                vm.disk,
                vm.image.clone(),
                vm.tags.unwrap_or_default(),
            ),
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(json!({ "error": format!("VM '{}' not found", vm_name) })),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                ));
            }
        }
    } else {
        (req.cpus, req.memory, req.disk, req.image.clone(), req.tags.clone())
    };

    let template = VMTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        cpus,
        memory,
        disk,
        image,
        cloud_init: req.cloud_init,
        tags,
        created: now,
        updated: now,
    };

    state.store.save_entity("templates", &template.id, &template).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    Ok((StatusCode::CREATED, Json(template)))
}

/// GET /api/templates - List all templates
pub async fn list_templates(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<VMTemplate>>, (StatusCode, Json<serde_json::Value>)> {
    let templates = state.store.list_entities::<VMTemplate>("templates").map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    Ok(Json(templates))
}

/// GET /api/templates/:id - Get a template by ID
pub async fn get_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<VMTemplate>, (StatusCode, Json<serde_json::Value>)> {
    match state.store.get_entity::<VMTemplate>("templates", &id) {
        Ok(Some(template)) => Ok(Json(template)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Template not found" })),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )),
    }
}

/// PUT /api/templates/:id - Update a template
pub async fn update_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateTemplateRequest>,
) -> Result<Json<VMTemplate>, (StatusCode, Json<serde_json::Value>)> {
    let mut template = match state.store.get_entity::<VMTemplate>("templates", &id) {
        Ok(Some(t)) => t,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Template not found" })),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ));
        }
    };

    if let Some(name) = req.name {
        template.name = name;
    }
    if let Some(description) = req.description {
        template.description = Some(description);
    }
    if let Some(cpus) = req.cpus {
        template.cpus = cpus;
    }
    if let Some(memory) = req.memory {
        template.memory = memory;
    }
    if let Some(disk) = req.disk {
        template.disk = disk;
    }
    if let Some(image) = req.image {
        template.image = image;
    }
    if let Some(cloud_init) = req.cloud_init {
        template.cloud_init = Some(cloud_init);
    }
    if let Some(tags) = req.tags {
        template.tags = tags;
    }
    template.updated = Utc::now();

    state.store.save_entity("templates", &template.id, &template).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    Ok(Json(template))
}

/// DELETE /api/templates/:id - Delete a template
pub async fn delete_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify template exists
    match state.store.get_entity::<VMTemplate>("templates", &id) {
        Ok(Some(_)) => {}
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Template not found" })),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ));
        }
    }

    state.store.delete_entity("templates", &id).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/templates/:id/deploy - Deploy a new VM from a template
pub async fn deploy_template(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<DeployTemplateRequest>,
) -> Result<(StatusCode, Json<vm_model::VM>), (StatusCode, Json<serde_json::Value>)> {
    let template = match state.store.get_entity::<VMTemplate>("templates", &id) {
        Ok(Some(t)) => t,
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Template not found" })),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            ));
        }
    };

    // Check VM name not taken
    if let Ok(Some(_)) = state.store.get_vm(&req.vm_name) {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({ "error": "VM name already exists" })),
        ));
    }

    // Copy template image as new VM disk if image file exists
    let source_image = &template.image;
    if std::path::Path::new(source_image).exists() {
        let ext = std::path::Path::new(source_image)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("qcow2");
        let target_image = format!("/var/lib/vmspawnd/images/{}.{}", req.vm_name, ext);

        if let Some(parent) = std::path::Path::new(&target_image).parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                tracing::warn!("Failed to create directory: {}", e);
            }
        }

        let output = Command::new("cp")
            .args(["--reflink=auto", source_image, &target_image])
            .output()
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": format!("Failed to copy image: {}", e) })),
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Failed to copy image: {}", stderr) })),
            ));
        }
    }

    // Create VM from template config
    let create_req = vm_model::CreateVMRequest {
        name: req.vm_name.clone(),
        image: template.image.clone(),
        cpus: template.cpus,
        memory: template.memory,
        disk: template.disk,
        hostname: None,
        tags: Some(template.tags.clone()),
    };

    let vm = vmspawn_driver::create_vm(&create_req).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    state.store.save_vm(&vm).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
    })?;

    Ok((StatusCode::CREATED, Json(vm)))
}
