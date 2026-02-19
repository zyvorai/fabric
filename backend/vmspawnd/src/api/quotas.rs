use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::server::AppState;

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
    #[serde(default = "default_true")]
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

fn default_true() -> bool {
    true
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
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<ResourceQuota>>, StatusCode> {
    // TODO: Load from state store
    // For now, return mock data
    let quotas = vec![
        ResourceQuota {
            id: Uuid::new_v4().to_string(),
            name: "Development Team".to_string(),
            max_cpus: 32,
            max_memory: 65536,
            max_disk: 500,
            max_vms: 10,
            used_cpus: 16,
            used_memory: 32768,
            used_disk: 200,
            used_vms: 5,
            tags: Some(vec!["dev".to_string()]),
            enabled: true,
            created: Utc::now(),
            updated: Utc::now(),
        },
        ResourceQuota {
            id: Uuid::new_v4().to_string(),
            name: "Production".to_string(),
            max_cpus: 128,
            max_memory: 262144,
            max_disk: 2000,
            max_vms: 50,
            used_cpus: 96,
            used_memory: 196608,
            used_disk: 1500,
            used_vms: 35,
            tags: Some(vec!["production".to_string()]),
            enabled: true,
            created: Utc::now(),
            updated: Utc::now(),
        },
    ];

    Ok(Json(quotas))
}

pub async fn get_quota(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ResourceQuota>, StatusCode> {
    // TODO: Load from state store
    // For now, return mock data
    let quota = ResourceQuota {
        id,
        name: "Development Team".to_string(),
        max_cpus: 32,
        max_memory: 65536,
        max_disk: 500,
        max_vms: 10,
        used_cpus: 16,
        used_memory: 32768,
        used_disk: 200,
        used_vms: 5,
        tags: Some(vec!["dev".to_string()]),
        enabled: true,
        created: Utc::now(),
        updated: Utc::now(),
    };

    Ok(Json(quota))
}

pub async fn create_quota(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateQuotaRequest>,
) -> Result<(StatusCode, Json<ResourceQuota>), StatusCode> {
    // TODO: Save to state store

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

    Ok((StatusCode::CREATED, Json(quota)))
}

pub async fn update_quota(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateQuotaRequest>,
) -> Result<Json<ResourceQuota>, StatusCode> {
    // TODO: Load existing quota from state store
    // TODO: Update fields
    // TODO: Save to state store

    // Mock response
    let quota = ResourceQuota {
        id,
        name: req.name.unwrap_or_else(|| "Updated Quota".to_string()),
        max_cpus: req.max_cpus.unwrap_or(32),
        max_memory: req.max_memory.unwrap_or(65536),
        max_disk: req.max_disk.unwrap_or(500),
        max_vms: req.max_vms.unwrap_or(10),
        used_cpus: 16,
        used_memory: 32768,
        used_disk: 200,
        used_vms: 5,
        tags: req.tags,
        enabled: req.enabled.unwrap_or(true),
        created: Utc::now(),
        updated: Utc::now(),
    };

    Ok(Json(quota))
}

pub async fn delete_quota(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Remove from state store
    // TODO: Check if quota is in use

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_quota(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load quota from state store
    // TODO: Set enabled = true
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

pub async fn disable_quota(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load quota from state store
    // TODO: Set enabled = false
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

// ============================================================================
// Usage Handlers
// ============================================================================

pub async fn get_quota_usage(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<QuotaUsage>, StatusCode> {
    // TODO: Load quota from state store
    // TODO: Calculate real usage from VMs

    // Mock quota for demonstration
    let quota = ResourceQuota {
        id,
        name: "Development Team".to_string(),
        max_cpus: 32,
        max_memory: 65536,
        max_disk: 500,
        max_vms: 10,
        used_cpus: 24, // 75%
        used_memory: 49152, // 75%
        used_disk: 400, // 80%
        used_vms: 8, // 80%
        tags: Some(vec!["dev".to_string()]),
        enabled: true,
        created: Utc::now(),
        updated: Utc::now(),
    };

    let usage = QuotaUsage::from_quota(&quota);
    Ok(Json(usage))
}

pub async fn get_all_quota_usage(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<QuotaUsage>>, StatusCode> {
    // TODO: Load all quotas from state store
    // TODO: Calculate usage for each

    // Mock quotas
    let quotas = vec![
        ResourceQuota {
            id: Uuid::new_v4().to_string(),
            name: "Development Team".to_string(),
            max_cpus: 32,
            max_memory: 65536,
            max_disk: 500,
            max_vms: 10,
            used_cpus: 24,
            used_memory: 49152,
            used_disk: 400,
            used_vms: 8,
            tags: Some(vec!["dev".to_string()]),
            enabled: true,
            created: Utc::now(),
            updated: Utc::now(),
        },
        ResourceQuota {
            id: Uuid::new_v4().to_string(),
            name: "Production".to_string(),
            max_cpus: 128,
            max_memory: 262144,
            max_disk: 2000,
            max_vms: 50,
            used_cpus: 110, // 86% - high usage
            used_memory: 229376, // 87.5% - high usage
            used_disk: 1800, // 90% - critical
            used_vms: 45, // 90% - critical
            tags: Some(vec!["production".to_string()]),
            enabled: true,
            created: Utc::now(),
            updated: Utc::now(),
        },
    ];

    let usage: Vec<QuotaUsage> = quotas.iter()
        .map(QuotaUsage::from_quota)
        .collect();

    Ok(Json(usage))
}

// ============================================================================
// Enforcement Logic
// ============================================================================

/// Check if creating a new VM would exceed quota
pub async fn check_quota_enforcement(
    _state: &AppState,
    _cpus: u32,
    _memory: u64,
    _disk: u64,
    _tags: &[String],
) -> Result<(), String> {
    // TODO: Implement actual quota enforcement
    // 1. Find all quotas that apply to the given tags
    // 2. Check if adding the requested resources would exceed any quota
    // 3. Return error if any quota would be exceeded

    Ok(())
}
