use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;
use security::{RequireRead, RequireWrite};

// ============================================================================
// Declarative VM Configuration (TOML/YAML-style via JSON API)
// ============================================================================

/// Declarative VM specification — full VM definition in a single request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMSpec {
    pub name: String,
    pub image: String,
    pub resources: ResourceSpec,
    #[serde(default)]
    pub network: Vec<NetworkSpec>,
    #[serde(default)]
    pub volumes: Vec<VolumeMount>,
    #[serde(default)]
    pub credentials: Vec<CredentialSpec>,
    #[serde(default)]
    pub start_options: StartOptionsSpec,
    #[serde(default)]
    pub autoscale: Option<AutoScaleSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Auto-start VM after creation
    #[serde(default)]
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSpec {
    pub cpus: u32,
    /// Memory with unit suffix: "2G", "512M", "4096" (MB)
    pub memory: String,
    /// Disk with unit suffix: "20G", "50G"
    #[serde(default = "default_disk")]
    pub disk: String,
}

fn default_disk() -> String { "20G".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSpec {
    #[serde(rename = "type")]
    pub net_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeMount {
    pub host: String,
    pub guest: String,
    /// Mount type: "9p", "virtiofs"
    #[serde(rename = "type", default = "default_mount_type")]
    pub mount_type: String,
    #[serde(default)]
    pub readonly: bool,
}

fn default_mount_type() -> String { "virtiofs".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSpec {
    pub id: String,
    /// Inline value or file path prefixed with @
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StartOptionsSpec {
    #[serde(default)]
    pub kvm: Option<bool>,
    #[serde(default)]
    pub secure_boot: Option<bool>,
    #[serde(default)]
    pub vsock: Option<bool>,
    #[serde(default)]
    pub gui: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoScaleSpec {
    #[serde(default)]
    pub cpu_threshold: Option<f64>,
    #[serde(default)]
    pub memory_threshold: Option<f64>,
    #[serde(default)]
    pub max_cpus: Option<u32>,
    #[serde(default)]
    pub max_memory_mb: Option<u64>,
    #[serde(default)]
    pub min_cpus: Option<u32>,
    #[serde(default)]
    pub min_memory_mb: Option<u64>,
    #[serde(default = "default_cooldown")]
    pub cooldown_secs: u64,
}

fn default_cooldown() -> u64 { 300 }

#[derive(Debug, Serialize)]
pub struct ApplyResult {
    pub vm_name: String,
    pub created: bool,
    pub started: bool,
    pub volumes_configured: usize,
    pub autoscale_enabled: bool,
    pub warnings: Vec<String>,
}

/// Parse memory string like "2G", "512M", "4096" to MB
fn parse_memory_mb(s: &str) -> u64 {
    let s = s.trim();
    if let Some(gb) = s.strip_suffix('G').or_else(|| s.strip_suffix("GB")).or_else(|| s.strip_suffix("g")) {
        gb.trim().parse::<u64>().unwrap_or(1) * 1024
    } else if let Some(mb) = s.strip_suffix('M').or_else(|| s.strip_suffix("MB")).or_else(|| s.strip_suffix("m")) {
        mb.trim().parse::<u64>().unwrap_or(1024)
    } else {
        s.parse::<u64>().unwrap_or(1024)
    }
}

/// Parse disk string like "20G", "100G" to GB
fn parse_disk_gb(s: &str) -> u64 {
    let s = s.trim();
    if let Some(gb) = s.strip_suffix('G').or_else(|| s.strip_suffix("GB")).or_else(|| s.strip_suffix("g")) {
        gb.trim().parse::<u64>().unwrap_or(20)
    } else if let Some(tb) = s.strip_suffix('T').or_else(|| s.strip_suffix("TB")).or_else(|| s.strip_suffix("t")) {
        tb.trim().parse::<u64>().unwrap_or(1) * 1024
    } else {
        s.parse::<u64>().unwrap_or(20)
    }
}

// ============================================================================
// Handlers
// ============================================================================

/// POST /api/vms/apply - Apply a declarative VM spec (create + configure)
pub async fn apply_vm_spec(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(spec): Json<VMSpec>,
) -> Result<(StatusCode, Json<ApplyResult>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("declarative::{}", stringify!(apply_vm_spec));
    let mut warnings = Vec::new();

    let memory_mb = parse_memory_mb(&spec.resources.memory);
    let disk_gb = parse_disk_gb(&spec.resources.disk);

    // Check if VM already exists
    let vm_exists = matches!(state.store.get_vm(&spec.name), Ok(Some(_)));

    if !vm_exists {
        // Create the VM
        let req = vm_model::CreateVMRequest {
            name: spec.name.clone(),
            image: spec.image.clone(),
            cpus: spec.resources.cpus,
            memory: memory_mb,
            disk: disk_gb,
            hostname: spec.hostname.clone(),
            tags: if spec.tags.is_empty() { None } else { Some(spec.tags.clone()) },
            labels: None,
        };

        let vm = vmspawn_driver::create_vm(&req).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
        })?;

        state.store.save_vm(&vm).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
        })?;
    }

    // Store volume mount config
    if !spec.volumes.is_empty() {
        state.store.save_entity("vm_volumes", &spec.name, &spec.volumes).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
        })?;
    }

    // Store autoscale policy
    let autoscale_enabled = if let Some(ref policy) = spec.autoscale {
        state.store.save_entity("autoscale_policies", &spec.name, policy).map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
        })?;
        true
    } else {
        false
    };

    // Start VM if requested
    let mut started = false;
    if spec.auto_start {
        match vmspawn_driver::start_vm(&spec.name) {
            Ok(_) => {
                started = true;
                if let Ok(Some(mut vm)) = state.store.get_vm(&spec.name) {
                    vm.state = vm_model::VMState::Running;
                    if let Err(e) = state.store.save_vm(&vm) {
                        tracing::error!("Failed to save VM: {}", e);
                    }
                }
            }
            Err(e) => {
                warnings.push(format!("Failed to start VM: {}", e));
            }
        }
    }

    // Record event
    crate::api::events::record_event(
        &state,
        crate::api::events::VMEventType::Created,
        &spec.name,
        Some("Created via declarative spec".to_string()),
    );

    Ok((StatusCode::OK, Json(ApplyResult {
        vm_name: spec.name,
        created: !vm_exists,
        started,
        volumes_configured: spec.volumes.len(),
        autoscale_enabled,
        warnings,
    })))
}

/// GET /api/vms/:name/spec - Export VM as declarative spec
pub async fn export_vm_spec(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(name): axum::extract::Path<String>,
) -> Result<Json<VMSpec>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("declarative::{}", stringify!(export_vm_spec));
    let vm = match state.store.get_vm(&name) {
        Ok(Some(vm)) => vm,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "VM not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    let volumes: Vec<VolumeMount> = state.store
        .get_entity("vm_volumes", &name)
        .ok()
        .flatten()
        .unwrap_or_default();

    let autoscale: Option<AutoScaleSpec> = state.store
        .get_entity("autoscale_policies", &name)
        .ok()
        .flatten();

    let memory_str = if vm.memory >= 1024 && vm.memory % 1024 == 0 {
        format!("{}G", vm.memory / 1024)
    } else {
        format!("{}M", vm.memory)
    };

    let spec = VMSpec {
        name: vm.name,
        image: vm.image,
        resources: ResourceSpec {
            cpus: vm.cpus,
            memory: memory_str,
            disk: format!("{}G", vm.disk),
        },
        network: Vec::new(),
        volumes,
        credentials: Vec::new(),
        start_options: StartOptionsSpec::default(),
        autoscale,
        hostname: vm.hostname,
        tags: vm.tags.unwrap_or_default(),
        auto_start: false,
    };

    Ok(Json(spec))
}
