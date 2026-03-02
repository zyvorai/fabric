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

use crate::validation::escape_csv_field;

// ============================================================================
// Audit Log Handlers
// ============================================================================

pub async fn list_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(filters): Query<AuditLogFilters>,
) -> Result<Json<Vec<AuditLog>>, StatusCode> {
    // Load from state store
    let mut logs = state.store.list_entities::<AuditLog>("audit_logs")
        .unwrap_or_default();

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
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<AuditLog>, StatusCode> {
    // Load from state store
    let log = state.store.get_entity::<AuditLog>("audit_logs", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(log))
}

pub async fn export_audit_logs(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> Result<(StatusCode, String), StatusCode> {
    // Load from state store
    let logs = state.store.list_entities::<AuditLog>("audit_logs")
        .unwrap_or_default();

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
                    escape_csv_field(&log.id),
                    escape_csv_field(&log.timestamp.to_rfc3339()),
                    escape_csv_field(&log.user),
                    escape_csv_field(&log.action),
                    escape_csv_field(&log.resource_type),
                    escape_csv_field(&log.resource_name),
                    escape_csv_field(match log.status {
                        AuditStatus::Success => "success",
                        AuditStatus::Failed => "failed",
                    }),
                    escape_csv_field(&log.ip_address.unwrap_or_default()),
                    escape_csv_field(&log.details.unwrap_or_default()),
                    escape_csv_field(&log.error.unwrap_or_default()),
                ));
            }

            Ok((StatusCode::OK, csv))
        }
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

pub async fn get_audit_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AuditStats>, StatusCode> {
    // Calculate from state store
    let logs = state.store.list_entities::<AuditLog>("audit_logs")
        .unwrap_or_default();

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
    state: &AppState,
    user: &str,
    action: &str,
    resource_type: &str,
    resource_name: &str,
    status: AuditStatus,
    ip_address: Option<&str>,
    details: Option<&str>,
    error: Option<&str>,
) -> Result<(), String> {
    let log = AuditLog {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now(),
        user: user.to_string(),
        action: action.to_string(),
        resource_type: resource_type.to_string(),
        resource_name: resource_name.to_string(),
        status: status.clone(),
        ip_address: ip_address.map(|s| s.to_string()),
        details: details.map(|s| s.to_string()),
        error: error.map(|s| s.to_string()),
    };

    // Save to state store
    if let Err(e) = state.store.save_entity("audit_logs", &log.id, &log) {
        tracing::error!("Failed to save audit log: {}", e);
        return Err(format!("Failed to save audit log: {}", e));
    }

    // Also log to system logger for important events
    match status {
        AuditStatus::Failed => {
            tracing::warn!("AUDIT: {} - {} on {} {} - FAILED: {}",
                user, action, resource_type, resource_name,
                error.unwrap_or("Unknown error"));
        }
        AuditStatus::Success => {
            tracing::info!("AUDIT: {} - {} on {} {} - SUCCESS",
                user, action, resource_type, resource_name);
        }
    }

    Ok(())
}
