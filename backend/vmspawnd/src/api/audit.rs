use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditStatus {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub user: String,
    pub action: String,
    pub resource_type: String,
    pub resource_name: String,
    pub status: AuditStatus,
    pub ip_address: Option<String>,
    pub details: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AuditLogFilters {
    pub action: Option<String>,
    pub user: Option<String>,
    pub resource_type: Option<String>,
    pub resource_name: Option<String>,
    pub status: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub search: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    #[serde(flatten)]
    pub filters: AuditLogFilters,
    #[serde(default = "default_format")]
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditStats {
    pub total_logs: u64,
    pub by_action: HashMap<String, u64>,
    pub by_user: HashMap<String, u64>,
    pub by_status: HashMap<String, u64>,
    pub recent_failures: u64,
}

fn default_limit() -> usize {
    100
}

fn default_format() -> String {
    "json".to_string()
}

// ============================================================================
// Mock Data Generators
// ============================================================================

fn generate_mock_logs(count: usize) -> Vec<AuditLog> {
    let actions = vec![
        "vm.create",
        "vm.start",
        "vm.stop",
        "vm.delete",
        "vm.restart",
        "quota.create",
        "quota.update",
        "schedule.create",
        "backup.create",
    ];

    let users = vec!["admin", "operator", "developer"];
    let resource_types = vec!["vm", "quota", "schedule", "backup"];

    let mut logs = Vec::new();

    for i in 0..count {
        let action = actions[i % actions.len()];
        let user = users[i % users.len()];
        let resource_type = resource_types[i % resource_types.len()];
        let status = if i % 10 == 0 {
            AuditStatus::Failed
        } else {
            AuditStatus::Success
        };

        logs.push(AuditLog {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now() - Duration::hours(i as i64),
            user: user.to_string(),
            action: action.to_string(),
            resource_type: resource_type.to_string(),
            resource_name: format!("{}-{}", resource_type, i),
            status: status.clone(),
            ip_address: Some(format!("192.168.1.{}", 100 + (i % 50))),
            details: Some(format!("Action {} performed on {} {}", action, resource_type, i)),
            error: match status {
                AuditStatus::Failed => Some("Insufficient permissions".to_string()),
                AuditStatus::Success => None,
            },
        });
    }

    logs
}

// ============================================================================
// Audit Log Handlers
// ============================================================================

pub async fn list_audit_logs(
    State(_state): State<Arc<AppState>>,
    Query(filters): Query<AuditLogFilters>,
) -> Result<Json<Vec<AuditLog>>, StatusCode> {
    // TODO: Load from state store with filtering
    let mut logs = generate_mock_logs(50);

    // Apply filters
    if let Some(action) = &filters.action {
        logs.retain(|log| log.action.contains(action));
    }

    if let Some(user) = &filters.user {
        logs.retain(|log| log.user.contains(user));
    }

    if let Some(resource_type) = &filters.resource_type {
        logs.retain(|log| log.resource_type.contains(resource_type));
    }

    if let Some(resource_name) = &filters.resource_name {
        logs.retain(|log| log.resource_name.contains(resource_name));
    }

    if let Some(status) = &filters.status {
        logs.retain(|log| {
            match status.as_str() {
                "success" => matches!(log.status, AuditStatus::Success),
                "failed" => matches!(log.status, AuditStatus::Failed),
                _ => true,
            }
        });
    }

    if let Some(search) = &filters.search {
        let search_lower = search.to_lowercase();
        logs.retain(|log| {
            log.action.to_lowercase().contains(&search_lower)
                || log.resource_name.to_lowercase().contains(&search_lower)
                || log.user.to_lowercase().contains(&search_lower)
        });
    }

    // Apply limit
    logs.truncate(filters.limit);

    Ok(Json(logs))
}

pub async fn get_audit_log(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<AuditLog>, StatusCode> {
    // TODO: Load from state store
    let log = AuditLog {
        id,
        timestamp: Utc::now() - Duration::hours(2),
        user: "admin".to_string(),
        action: "vm.create".to_string(),
        resource_type: "vm".to_string(),
        resource_name: "web-server-01".to_string(),
        status: AuditStatus::Success,
        ip_address: Some("192.168.1.100".to_string()),
        details: Some("Created VM with 4 CPUs and 8GB RAM".to_string()),
        error: None,
    };

    Ok(Json(log))
}

pub async fn export_audit_logs(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> Result<(StatusCode, String), StatusCode> {
    // TODO: Load from state store with filtering
    let logs = generate_mock_logs(100);

    match query.format.as_str() {
        "json" => {
            let json = serde_json::to_string_pretty(&logs)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok((StatusCode::OK, json))
        }
        "csv" => {
            let mut csv = String::from("ID,Timestamp,User,Action,Resource Type,Resource Name,Status,IP Address,Details,Error\n");

            for log in logs {
                csv.push_str(&format!(
                    "{},{},{},{},{},{},{},{},{},{}\n",
                    log.id,
                    log.timestamp.to_rfc3339(),
                    log.user,
                    log.action,
                    log.resource_type,
                    log.resource_name,
                    match log.status {
                        AuditStatus::Success => "success",
                        AuditStatus::Failed => "failed",
                    },
                    log.ip_address.unwrap_or_default(),
                    log.details.unwrap_or_default(),
                    log.error.unwrap_or_default(),
                ));
            }

            Ok((StatusCode::OK, csv))
        }
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

pub async fn get_audit_stats(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<AuditStats>, StatusCode> {
    // TODO: Calculate from state store
    let logs = generate_mock_logs(100);

    let total_logs = logs.len() as u64;

    let mut by_action: HashMap<String, u64> = HashMap::new();
    let mut by_user: HashMap<String, u64> = HashMap::new();
    let mut by_status: HashMap<String, u64> = HashMap::new();

    let mut recent_failures = 0;

    for log in logs {
        *by_action.entry(log.action.clone()).or_insert(0) += 1;
        *by_user.entry(log.user.clone()).or_insert(0) += 1;

        let status_str = match &log.status {
            AuditStatus::Success => "success",
            AuditStatus::Failed => "failed",
        };
        *by_status.entry(status_str.to_string()).or_insert(0) += 1;

        // Count failures in last 24 hours
        if matches!(log.status, AuditStatus::Failed)
            && (Utc::now() - log.timestamp) < Duration::hours(24)
        {
            recent_failures += 1;
        }
    }

    let stats = AuditStats {
        total_logs,
        by_action,
        by_user,
        by_status,
        recent_failures,
    };

    Ok(Json(stats))
}

// ============================================================================
// Audit Event Logger
// ============================================================================

/// Helper function to log an audit event
pub async fn log_audit_event(
    _state: &AppState,
    user: &str,
    action: &str,
    resource_type: &str,
    resource_name: &str,
    status: AuditStatus,
    ip_address: Option<&str>,
    details: Option<&str>,
    error: Option<&str>,
) -> Result<(), String> {
    // TODO: Save to state store

    let _log = AuditLog {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now(),
        user: user.to_string(),
        action: action.to_string(),
        resource_type: resource_type.to_string(),
        resource_name: resource_name.to_string(),
        status,
        ip_address: ip_address.map(|s| s.to_string()),
        details: details.map(|s| s.to_string()),
        error: error.map(|s| s.to_string()),
    };

    // TODO: Write to persistent storage
    // TODO: Maybe also log to system logger

    Ok(())
}
