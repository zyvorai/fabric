// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceQuota {
    pub id: String,
    pub name: String,
    pub max_cpus: u32,
    pub max_memory: u64,      // MB
    pub max_disk: u64,        // GB
    pub max_vms: u32,
    pub used_cpus: u32,
    pub used_memory: u64,
    pub used_disk: u64,
    pub used_vms: u32,
    pub tags: Option<Vec<String>>,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateQuotaRequest {
    pub name: String,
    pub max_cpus: u32,
    pub max_memory: u64,
    pub max_disk: u64,
    pub max_vms: u32,
    pub tags: Option<Vec<String>>,
    #[serde(default = "crate::validation::default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateQuotaRequest {
    pub name: Option<String>,
    pub max_cpus: Option<u32>,
    pub max_memory: Option<u64>,
    pub max_disk: Option<u64>,
    pub max_vms: Option<u32>,
    pub tags: Option<Vec<String>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaUsage {
    pub quota_id: String,
    pub quota_name: String,
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub disk_percent: f64,
    pub vms_percent: f64,
    pub is_exceeded: bool,
    pub exceeded_resources: Vec<String>,
}

// ============================================================================
// Validation Functions
// ============================================================================

fn validate_quota(req: &CreateQuotaRequest) -> Result<(), String> {
    // Validate limits are not zero
    if req.max_cpus == 0 {
        return Err("max_cpus must be greater than 0".to_string());
    }
    if req.max_memory == 0 {
        return Err("max_memory must be greater than 0".to_string());
    }
    if req.max_disk == 0 {
        return Err("max_disk must be greater than 0".to_string());
    }
    if req.max_vms == 0 {
        return Err("max_vms must be greater than 0".to_string());
    }

    // Validate name is not empty
    if req.name.trim().is_empty() {
        return Err("Quota name cannot be empty".to_string());
    }

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

impl QuotaUsage {
    fn from_quota(quota: &ResourceQuota) -> Self {
        let cpu_percent = if quota.max_cpus > 0 {
            (quota.used_cpus as f64 / quota.max_cpus as f64) * 100.0
        } else {
            0.0
        };

        let memory_percent = if quota.max_memory > 0 {
            (quota.used_memory as f64 / quota.max_memory as f64) * 100.0
        } else {
            0.0
        };

        let disk_percent = if quota.max_disk > 0 {
            (quota.used_disk as f64 / quota.max_disk as f64) * 100.0
        } else {
            0.0
        };

        let vms_percent = if quota.max_vms > 0 {
            (quota.used_vms as f64 / quota.max_vms as f64) * 100.0
        } else {
            0.0
        };

        let mut exceeded_resources = Vec::new();
        let mut is_exceeded = false;

        if quota.used_cpus > quota.max_cpus {
            exceeded_resources.push("cpu".to_string());
            is_exceeded = true;
        }
        if quota.used_memory > quota.max_memory {
            exceeded_resources.push("memory".to_string());
            is_exceeded = true;
        }
        if quota.used_disk > quota.max_disk {
            exceeded_resources.push("disk".to_string());
            is_exceeded = true;
        }
        if quota.used_vms > quota.max_vms {
            exceeded_resources.push("vms".to_string());
            is_exceeded = true;
        }

        Self {
            quota_id: quota.id.clone(),
            quota_name: quota.name.clone(),
            cpu_percent,
            memory_percent,
            disk_percent,
            vms_percent,
            is_exceeded,
            exceeded_resources,
        }
    }
}

// ============================================================================
// Quota Handlers
// ============================================================================

pub async fn list_quotas(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ResourceQuota>>, (StatusCode, Json<serde_json::Value>)> {
    let quotas = state.store.list_entities::<ResourceQuota>("quotas")
        .map_err(|e| { tracing::error!("Failed to load quotas: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quotas"}))) })?;

    Ok(Json(quotas))
}

pub async fn get_quota(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ResourceQuota>, (StatusCode, Json<serde_json::Value>)> {
    // Load from state store
    let quota = state.store.get_entity::<ResourceQuota>("quotas", &id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quota"}))))?
        .ok_or((StatusCode::NOT_FOUND, Json(json!({"error": "Quota not found"}))))?;

    Ok(Json(quota))
}

pub async fn create_quota(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateQuotaRequest>,
) -> Result<(StatusCode, Json<ResourceQuota>), (StatusCode, Json<serde_json::Value>)> {
    // Validate quota
    if let Err(err) = validate_quota(&req) {
        tracing::warn!("Invalid quota: {}", err);
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": err}))));
    }

    let now = Utc::now();
    let quota = ResourceQuota {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        max_cpus: req.max_cpus,
        max_memory: req.max_memory,
        max_disk: req.max_disk,
        max_vms: req.max_vms,
        used_cpus: 0,
        used_memory: 0,
        used_disk: 0,
        used_vms: 0,
        tags: req.tags,
        enabled: req.enabled,
        created: now,
        updated: now,
    };

    // Save to state store
    if let Err(e) = state.store.save_entity("quotas", &quota.id, &quota) {
        tracing::error!("Failed to save quota: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to save quota"}))));
    }

    Ok((StatusCode::CREATED, Json(quota)))
}

pub async fn update_quota(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateQuotaRequest>,
) -> Result<Json<ResourceQuota>, (StatusCode, Json<serde_json::Value>)> {
    // Load existing quota from state store
    let mut quota = state.store.get_entity::<ResourceQuota>("quotas", &id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quota"}))))?
        .ok_or((StatusCode::NOT_FOUND, Json(json!({"error": "Quota not found"}))))?;

    // Update fields if provided
    if let Some(name) = req.name {
        if name.trim().is_empty() {
            return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Quota name cannot be empty"}))));
        }
        quota.name = name;
    }
    if let Some(max_cpus) = req.max_cpus {
        if max_cpus == 0 {
            return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "max_cpus must be greater than 0"}))));
        }
        quota.max_cpus = max_cpus;
    }
    if let Some(max_memory) = req.max_memory {
        if max_memory == 0 {
            return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "max_memory must be greater than 0"}))));
        }
        quota.max_memory = max_memory;
    }
    if let Some(max_disk) = req.max_disk {
        if max_disk == 0 {
            return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "max_disk must be greater than 0"}))));
        }
        quota.max_disk = max_disk;
    }
    if let Some(max_vms) = req.max_vms {
        if max_vms == 0 {
            return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "max_vms must be greater than 0"}))));
        }
        quota.max_vms = max_vms;
    }
    if let Some(tags) = req.tags {
        quota.tags = Some(tags);
    }
    if let Some(enabled) = req.enabled {
        quota.enabled = enabled;
    }

    quota.updated = Utc::now();

    // Save to state store
    if let Err(e) = state.store.save_entity("quotas", &quota.id, &quota) {
        tracing::error!("Failed to update quota: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update quota"}))));
    }

    Ok(Json(quota))
}

pub async fn delete_quota(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Check if quota is in use (has any usage)
    if let Ok(Some(quota)) = state.store.get_entity::<ResourceQuota>("quotas", &id) {
        if quota.used_vms > 0 {
            tracing::warn!("Cannot delete quota {} - currently in use by {} VMs", id, quota.used_vms);
            return Err((StatusCode::CONFLICT, Json(json!({"error": format!("Quota is in use by {} VMs", quota.used_vms)}))));
        }
    }

    // Remove from state store
    if let Err(e) = state.store.delete_entity("quotas", &id) {
        tracing::error!("Failed to delete quota: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to delete quota"}))));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_quota(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Load quota from state store
    let mut quota = state.store.get_entity::<ResourceQuota>("quotas", &id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quota"}))))?
        .ok_or((StatusCode::NOT_FOUND, Json(json!({"error": "Quota not found"}))))?;

    // Set enabled = true
    quota.enabled = true;
    quota.updated = Utc::now();

    // Save to state store
    if let Err(e) = state.store.save_entity("quotas", &quota.id, &quota) {
        tracing::error!("Failed to enable quota: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to enable quota"}))));
    }

    Ok(StatusCode::OK)
}

pub async fn disable_quota(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Load quota from state store
    let mut quota = state.store.get_entity::<ResourceQuota>("quotas", &id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quota"}))))?
        .ok_or((StatusCode::NOT_FOUND, Json(json!({"error": "Quota not found"}))))?;

    // Set enabled = false
    quota.enabled = false;
    quota.updated = Utc::now();

    // Save to state store
    if let Err(e) = state.store.save_entity("quotas", &quota.id, &quota) {
        tracing::error!("Failed to disable quota: {}", e);
        return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to disable quota"}))));
    }

    Ok(StatusCode::OK)
}

// ============================================================================
// Usage Handlers
// ============================================================================

pub async fn get_quota_usage(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<QuotaUsage>, (StatusCode, Json<serde_json::Value>)> {
    // Load quota from state store
    let mut quota = state.store.get_entity::<ResourceQuota>("quotas", &id)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load quota"}))))?
        .ok_or((StatusCode::NOT_FOUND, Json(json!({"error": "Quota not found"}))))?;

    // Load VMs once and calculate usage
    let vms = state.store.list_vms()
        .map_err(|e| { tracing::error!("Failed to load VMs: {}", e); (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load VMs"}))) })?;
    calculate_quota_usage(&vms, &mut quota);

    let usage = QuotaUsage::from_quota(&quota);
    Ok(Json(usage))
}

pub async fn get_all_quota_usage(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<QuotaUsage>>, (StatusCode, Json<serde_json::Value>)> {
    // Check cache first
    {
        let cache = state.quota_cache.read().await;
        if !cache.is_stale() && !cache.usage.is_empty() {
            let usage: Vec<QuotaUsage> = cache.usage.values().cloned().collect();
            return Ok(Json(usage));
        }
    }

    // Cache miss or stale - recalculate
    let mut quotas = state.store.list_entities::<ResourceQuota>("quotas")
        .unwrap_or_default();

    // Load VMs once for all quota calculations
    let vms = state.store.list_vms().unwrap_or_default();
    for quota in &mut quotas {
        calculate_quota_usage(&vms, quota);
    }

    let usage: Vec<QuotaUsage> = quotas.iter()
        .map(QuotaUsage::from_quota)
        .collect();

    // Update cache
    {
        let mut cache = state.quota_cache.write().await;
        cache.usage.clear();
        for u in &usage {
            cache.usage.insert(u.quota_id.clone(), u.clone());
        }
        cache.last_updated = std::time::Instant::now();
    }

    Ok(Json(usage))
}

// ============================================================================
// Usage Calculation Helper
// ============================================================================

/// Calculate real quota usage from a pre-loaded list of VMs
fn calculate_quota_usage(vms: &[vm_model::VM], quota: &mut ResourceQuota) {
    // Reset usage counters
    quota.used_cpus = 0;
    quota.used_memory = 0;
    quota.used_disk = 0;
    quota.used_vms = 0;

    // Calculate usage from VMs matching this quota
    for vm in vms {
        // Check if VM matches this quota's tags
        let matches = if let Some(quota_tags) = &quota.tags {
            // Quota has tags - check if VM has matching tags
            if let Some(vm_tags) = &vm.tags {
                vm_tags.iter().any(|tag| quota_tags.contains(tag))
            } else {
                false // VM has no tags, doesn't match tag-based quota
            }
        } else {
            // Quota has no tags - applies to all VMs
            true
        };

        if matches {
            quota.used_cpus += vm.cpus;
            quota.used_memory += vm.memory;
            quota.used_disk += vm.disk;
            quota.used_vms += 1;
        }
    }

    tracing::debug!(
        "Calculated quota '{}' usage: {} CPUs, {} MB memory, {} GB disk, {} VMs",
        quota.name,
        quota.used_cpus,
        quota.used_memory,
        quota.used_disk,
        quota.used_vms
    );
}

// ============================================================================
// Enforcement Logic
// ============================================================================

/// Check if creating a new VM would exceed quota
pub async fn check_quota_enforcement(
    state: &AppState,
    cpus: u32,
    memory: u64,
    disk: u64,
    tags: &[String],
) -> Result<(), String> {
    // Load all enabled quotas
    let quotas = state.store.list_entities::<ResourceQuota>("quotas")
        .unwrap_or_default();

    let enabled_quotas: Vec<ResourceQuota> = quotas
        .into_iter()
        .filter(|q| q.enabled)
        .collect();

    // Find quotas that apply to the given tags
    let mut applicable_quotas = Vec::new();

    for quota in enabled_quotas {
        if let Some(quota_tags) = &quota.tags {
            // Check if any of the VM's tags match the quota's tags
            if tags.iter().any(|tag| quota_tags.contains(tag)) {
                applicable_quotas.push(quota);
            }
        } else {
            // Quota with no tags applies to all VMs
            applicable_quotas.push(quota);
        }
    }

    // Check each applicable quota
    for quota in applicable_quotas {
        let mut violations = Vec::new();

        // Check CPU quota
        if quota.used_cpus + cpus > quota.max_cpus {
            violations.push(format!(
                "CPU quota exceeded: would use {} CPUs but limit is {} (current: {})",
                quota.used_cpus + cpus,
                quota.max_cpus,
                quota.used_cpus
            ));
        }

        // Check memory quota
        if quota.used_memory + memory > quota.max_memory {
            violations.push(format!(
                "Memory quota exceeded: would use {} MB but limit is {} MB (current: {} MB)",
                quota.used_memory + memory,
                quota.max_memory,
                quota.used_memory
            ));
        }

        // Check disk quota
        if quota.used_disk + disk > quota.max_disk {
            violations.push(format!(
                "Disk quota exceeded: would use {} GB but limit is {} GB (current: {} GB)",
                quota.used_disk + disk,
                quota.max_disk,
                quota.used_disk
            ));
        }

        // Check VM count quota
        if quota.used_vms + 1 > quota.max_vms {
            violations.push(format!(
                "VM count quota exceeded: would have {} VMs but limit is {} (current: {})",
                quota.used_vms + 1,
                quota.max_vms,
                quota.used_vms
            ));
        }

        // If any violations, return error
        if !violations.is_empty() {
            let error_msg = format!(
                "Quota '{}' would be exceeded:\n  - {}",
                quota.name,
                violations.join("\n  - ")
            );
            tracing::warn!("{}", error_msg);
            return Err(error_msg);
        }
    }

    Ok(())
}
