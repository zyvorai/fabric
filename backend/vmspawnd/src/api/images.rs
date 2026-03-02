use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageBuildRequest {
    pub name: String,
    pub distribution: String,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default = "crate::validation::default_true")]
    pub autologin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageBuildStatus {
    pub id: String,
    pub name: String,
    pub distribution: String,
    pub state: BuildState,
    pub output_path: Option<String>,
    pub error: Option<String>,
    pub started: DateTime<Utc>,
    pub completed: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuildState {
    Pending,
    Building,
    Completed,
    Failed,
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /api/images/build - Build a new VM image using mkosi
pub async fn build_image(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImageBuildRequest>,
) -> Result<(StatusCode, Json<ImageBuildStatus>), (StatusCode, Json<serde_json::Value>)> {
    let build_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    let status = ImageBuildStatus {
        id: build_id.clone(),
        name: req.name.clone(),
        distribution: req.distribution.clone(),
        state: BuildState::Pending,
        output_path: None,
        error: None,
        started: now,
        completed: None,
    };

    state.store.save_entity("image_builds", &build_id, &status).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    // Spawn background build task
    let state_clone = state.clone();
    let build_id_clone = build_id.clone();
    let req_clone = req.clone();

    tokio::spawn(async move {
        // Update state to building
        if let Ok(Some(mut s)) = state_clone.store.get_entity::<ImageBuildStatus>("image_builds", &build_id_clone) {
            s.state = BuildState::Building;
            if let Err(e) = state_clone.store.save_entity("image_builds", &build_id_clone, &s) {
                tracing::error!("Failed to save: {}", e);
            }
        }

        let config = vmspawn_driver::MkosiConfig {
            name: req_clone.name.clone(),
            distribution: req_clone.distribution,
            packages: req_clone.packages,
            autologin: req_clone.autologin,
        };

        let result = tokio::task::spawn_blocking(move || {
            vmspawn_driver::build_image_mkosi(&config)
        }).await;

        if let Ok(Some(mut s)) = state_clone.store.get_entity::<ImageBuildStatus>("image_builds", &build_id_clone) {
            match result {
                Ok(Ok(path)) => {
                    s.state = BuildState::Completed;
                    s.output_path = Some(path);
                    tracing::info!("Image build '{}' completed", req_clone.name);
                }
                Ok(Err(e)) => {
                    s.state = BuildState::Failed;
                    s.error = Some(e.to_string());
                    tracing::error!("Image build '{}' failed: {}", req_clone.name, e);
                }
                Err(e) => {
                    s.state = BuildState::Failed;
                    s.error = Some(format!("Build task panicked: {}", e));
                }
            }
            s.completed = Some(Utc::now());
            if let Err(e) = state_clone.store.save_entity("image_builds", &build_id_clone, &s) {
                tracing::error!("Failed to save image build: {}", e);
            }
        }
    });

    Ok((StatusCode::ACCEPTED, Json(status)))
}

/// GET /api/images/builds - List all image builds
pub async fn list_builds(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ImageBuildStatus>>, (StatusCode, Json<serde_json::Value>)> {
    let builds = state.store.list_entities::<ImageBuildStatus>("image_builds").map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(builds))
}

/// GET /api/images/list - List available VM images
pub async fn list_images() -> Json<Vec<ImageInfo>> {
    let mut images = Vec::new();

    // Scan /var/lib/machines and /var/lib/vmspawnd/images
    for dir in &["/var/lib/machines", "/var/lib/vmspawnd/images"] {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if matches!(ext, "raw" | "qcow2" | "img") {
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        images.push(ImageInfo {
                            name: name.trim_end_matches(&format!(".{}", ext)).to_string(),
                            path: path.display().to_string(),
                            format: ext.to_string(),
                            size_bytes: size,
                        });
                    }
                }
            }
        }
    }

    Json(images)
}

#[derive(Debug, Serialize)]
pub struct ImageInfo {
    pub name: String,
    pub path: String,
    pub format: String,
    pub size_bytes: u64,
}
