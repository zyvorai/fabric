use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::sync::Arc;
use vm_model::{CreateVMRequest, VMMetrics};
use cloud_init::{CloudInitConfig, CloudInitGenerator};

use crate::server::AppState;

pub async fn list_vms(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.store.list_vms() {
        Ok(vms) => (StatusCode::OK, Json(vms)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_vm(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state.store.get_vm(&name) {
        Ok(Some(vm)) => (StatusCode::OK, Json(vm)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "VM not found" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn create_vm(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateVMRequest>,
) -> impl IntoResponse {
    match vmspawn_driver::create_vm(&req) {
        Ok(vm) => {
            if let Err(e) = state.store.save_vm(&vm) {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response();
            }
            (StatusCode::CREATED, Json(vm)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn delete_vm(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match state.store.delete_vm(&name) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn start_vm(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match vmspawn_driver::start_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Running;
                let _ = state.store.save_vm(&vm);
            }
            (StatusCode::OK, Json(json!({ "status": "started" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn stop_vm(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match vmspawn_driver::stop_vm(&name) {
        Ok(_) => {
            if let Ok(Some(mut vm)) = state.store.get_vm(&name) {
                vm.state = vm_model::VMState::Stopped;
                let _ = state.store.save_vm(&vm);
            }
            (StatusCode::OK, Json(json!({ "status": "stopped" }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn restart_vm(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match vmspawn_driver::restart_vm(&name) {
        Ok(_) => (StatusCode::OK, Json(json!({ "status": "restarted" }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn get_metrics(
    State(_state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> impl IntoResponse {
    match vmspawn_driver::get_metrics(&name) {
        Ok(metrics) => (StatusCode::OK, Json(metrics)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub async fn configure_cloud_init(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Json(config): Json<CloudInitConfig>,
) -> impl IntoResponse {
    let generator = match CloudInitGenerator::new("/var/lib/vmspawnd/cloud-init") {
        Ok(gen) => gen,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    };

    match generator.generate(&config) {
        Ok(iso_path) => (
            StatusCode::OK,
            Json(json!({
                "status": "created",
                "iso_path": iso_path.to_string_lossy()
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
