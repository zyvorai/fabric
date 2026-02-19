use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Email,
    Slack,
    Webhook,
    Teams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationChannel {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    pub config: HashMap<String, serde_json::Value>,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub last_test: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    pub config: HashMap<String, serde_json::Value>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateChannelRequest {
    pub name: Option<String>,
    pub config: Option<HashMap<String, serde_json::Value>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub event_types: Vec<String>,
    pub severity_levels: Vec<Severity>,
    pub channels: Vec<String>,
    pub vm_tags: Option<Vec<String>>,
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub triggered_count: u64,
    pub last_triggered: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRuleRequest {
    pub name: String,
    pub description: Option<String>,
    pub event_types: Vec<String>,
    pub severity_levels: Vec<Severity>,
    pub channels: Vec<String>,
    pub vm_tags: Option<Vec<String>>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_types: Option<Vec<String>>,
    pub severity_levels: Option<Vec<Severity>>,
    pub channels: Option<Vec<String>>,
    pub vm_tags: Option<Vec<String>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationStatus {
    Sent,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationHistory {
    pub id: String,
    pub rule_id: String,
    pub rule_name: String,
    pub event_type: String,
    pub severity: Severity,
    pub channel: String,
    pub vm_name: Option<String>,
    pub message: String,
    pub sent_at: DateTime<Utc>,
    pub status: NotificationStatus,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_true() -> bool {
    true
}

fn default_limit() -> usize {
    50
}

// ============================================================================
// Validation Functions
// ============================================================================

fn validate_channel_config(channel_type: &ChannelType, config: &HashMap<String, serde_json::Value>) -> Result<(), String> {
    match channel_type {
        ChannelType::Email => {
            // Validate email configuration
            if !config.contains_key("smtp_host") {
                return Err("Email channel requires 'smtp_host'".to_string());
            }
            if !config.contains_key("smtp_port") {
                return Err("Email channel requires 'smtp_port'".to_string());
            }
            if !config.contains_key("from") {
                return Err("Email channel requires 'from' address".to_string());
            }
            if !config.contains_key("to") {
                return Err("Email channel requires 'to' addresses".to_string());
            }
        }
        ChannelType::Slack => {
            // Validate Slack configuration
            if !config.contains_key("webhook_url") {
                return Err("Slack channel requires 'webhook_url'".to_string());
            }
            // Validate webhook URL format
            if let Some(url) = config.get("webhook_url").and_then(|v| v.as_str()) {
                if !url.starts_with("https://hooks.slack.com/") {
                    return Err("Invalid Slack webhook URL format".to_string());
                }
            }
        }
        ChannelType::Webhook => {
            // Validate webhook configuration
            if !config.contains_key("url") {
                return Err("Webhook channel requires 'url'".to_string());
            }
            // Validate URL format
            if let Some(url) = config.get("url").and_then(|v| v.as_str()) {
                if !url.starts_with("http://") && !url.starts_with("https://") {
                    return Err("Webhook URL must start with http:// or https://".to_string());
                }
            }
        }
        ChannelType::Teams => {
            // Validate Teams configuration
            if !config.contains_key("webhook_url") {
                return Err("Teams channel requires 'webhook_url'".to_string());
            }
            // Validate webhook URL format
            if let Some(url) = config.get("webhook_url").and_then(|v| v.as_str()) {
                if !url.contains("office.com") && !url.contains("microsoft.com") {
                    return Err("Invalid Teams webhook URL format".to_string());
                }
            }
        }
    }

    Ok(())
}

fn validate_notification_rule(rule: &CreateRuleRequest) -> Result<(), String> {
    // Validate event types are not empty
    if rule.event_types.is_empty() {
        return Err("Rule must have at least one event type".to_string());
    }

    // Validate severity levels are not empty
    if rule.severity_levels.is_empty() {
        return Err("Rule must have at least one severity level".to_string());
    }

    // Validate channels are not empty
    if rule.channels.is_empty() {
        return Err("Rule must have at least one channel".to_string());
    }

    Ok(())
}

// ============================================================================
// Channel Handlers
// ============================================================================

pub async fn list_channels(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<NotificationChannel>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let channels = state.store.list_entities::<NotificationChannel>("notifications/channels")
        .unwrap_or_else(|_| vec![
        NotificationChannel {
            id: Uuid::new_v4().to_string(),
            name: "Email Alerts".to_string(),
            channel_type: ChannelType::Email,
            config: {
                let mut map = HashMap::new();
                map.insert("smtp_host".to_string(), serde_json::json!("smtp.example.com"));
                map.insert("smtp_port".to_string(), serde_json::json!(587));
                map.insert("from".to_string(), serde_json::json!("alerts@example.com"));
                map.insert("to".to_string(), serde_json::json!(vec!["admin@example.com"]));
                map
            },
            enabled: true,
            created: Utc::now(),
            last_test: None,
        },
        NotificationChannel {
            id: Uuid::new_v4().to_string(),
            name: "Slack Notifications".to_string(),
            channel_type: ChannelType::Slack,
            config: {
                let mut map = HashMap::new();
                map.insert("webhook_url".to_string(), serde_json::json!("https://hooks.slack.com/services/xxx"));
                map.insert("channel".to_string(), serde_json::json!("#alerts"));
                map
            },
            enabled: true,
            created: Utc::now(),
            last_test: Some(Utc::now()),
        },
    ]);

    Ok(Json(channels))
}

pub async fn create_channel(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateChannelRequest>,
) -> Result<(StatusCode, Json<NotificationChannel>), StatusCode> {
    // Validate config based on channel type
    if let Err(err) = validate_channel_config(&req.channel_type, &req.config) {
        tracing::warn!("Invalid channel config: {}", err);
        return Err(StatusCode::BAD_REQUEST);
    }

    let channel = NotificationChannel {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        channel_type: req.channel_type,
        config: req.config,
        enabled: req.enabled,
        created: Utc::now(),
        last_test: None,
    };

    // Save to state store
    if let Err(e) = state.store.save_entity("notifications/channels", &channel.id, &channel) {
        tracing::error!("Failed to save notification channel: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok((StatusCode::CREATED, Json(channel)))
}

pub async fn update_channel(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateChannelRequest>,
) -> Result<Json<NotificationChannel>, StatusCode> {
    // TODO: Load existing channel from state store
    // TODO: Update fields
    // TODO: Save to state store

    // Mock response
    let channel = NotificationChannel {
        id,
        name: req.name.unwrap_or_else(|| "Updated Channel".to_string()),
        channel_type: ChannelType::Email,
        config: req.config.unwrap_or_default(),
        enabled: req.enabled.unwrap_or(true),
        created: Utc::now(),
        last_test: None,
    };

    Ok(Json(channel))
}

pub async fn delete_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Check if channel is used by any rules
    let rules = state.store.list_entities::<NotificationRule>("notifications/rules")
        .unwrap_or_default();

    for rule in rules {
        if rule.channels.contains(&id) {
            tracing::warn!("Cannot delete channel {} - used by rule {}", id, rule.name);
            return Err(StatusCode::CONFLICT);
        }
    }

    // Remove from state store
    if let Err(e) = state.store.delete_entity("notifications/channels", &id) {
        tracing::error!("Failed to delete channel: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn test_channel(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load channel from state store
    // TODO: Send test notification based on channel type
    // TODO: Update last_test timestamp

    Ok(StatusCode::OK)
}

// ============================================================================
// Rule Handlers
// ============================================================================

pub async fn list_rules(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<NotificationRule>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let rules = state.store.list_entities::<NotificationRule>("notifications/rules")
        .unwrap_or_else(|_| vec![
        NotificationRule {
            id: Uuid::new_v4().to_string(),
            name: "VM Failures".to_string(),
            description: Some("Alert on VM failures".to_string()),
            event_types: vec!["vm.failed".to_string()],
            severity_levels: vec![Severity::Critical],
            channels: vec![],
            vm_tags: None,
            enabled: true,
            created: Utc::now(),
            triggered_count: 5,
            last_triggered: Some(Utc::now()),
        },
        NotificationRule {
            id: Uuid::new_v4().to_string(),
            name: "High Resource Usage".to_string(),
            description: Some("Alert when resource usage is high".to_string()),
            event_types: vec!["resource.high_usage".to_string()],
            severity_levels: vec![Severity::Warning],
            channels: vec![],
            vm_tags: Some(vec!["production".to_string()]),
            enabled: true,
            created: Utc::now(),
            triggered_count: 12,
            last_triggered: Some(Utc::now()),
        },
    ]);

    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateRuleRequest>,
) -> Result<(StatusCode, Json<NotificationRule>), StatusCode> {
    // Validate rule
    if let Err(err) = validate_notification_rule(&req) {
        tracing::warn!("Invalid notification rule: {}", err);
        return Err(StatusCode::BAD_REQUEST);
    }

    // Validate channels exist
    for channel_id in &req.channels {
        if state.store.get_entity::<NotificationChannel>("notifications/channels", channel_id)
            .ok().flatten().is_none() {
            tracing::warn!("Channel not found: {}", channel_id);
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let rule = NotificationRule {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        event_types: req.event_types,
        severity_levels: req.severity_levels,
        channels: req.channels,
        vm_tags: req.vm_tags,
        enabled: req.enabled,
        created: Utc::now(),
        triggered_count: 0,
        last_triggered: None,
    };

    // Save to state store
    if let Err(e) = state.store.save_entity("notifications/rules", &rule.id, &rule) {
        tracing::error!("Failed to save notification rule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok((StatusCode::CREATED, Json(rule)))
}

pub async fn update_rule(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateRuleRequest>,
) -> Result<Json<NotificationRule>, StatusCode> {
    // TODO: Load existing rule from state store
    // TODO: Update fields
    // TODO: Save to state store

    // Mock response
    let rule = NotificationRule {
        id,
        name: req.name.unwrap_or_else(|| "Updated Rule".to_string()),
        description: req.description,
        event_types: req.event_types.unwrap_or_default(),
        severity_levels: req.severity_levels.unwrap_or_default(),
        channels: req.channels.unwrap_or_default(),
        vm_tags: req.vm_tags,
        enabled: req.enabled.unwrap_or(true),
        created: Utc::now(),
        triggered_count: 0,
        last_triggered: None,
    };

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Remove from state store
    if let Err(e) = state.store.delete_entity("notifications/rules", &id) {
        tracing::error!("Failed to delete rule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_rule(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load rule from state store
    // TODO: Set enabled = true
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

pub async fn disable_rule(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load rule from state store
    // TODO: Set enabled = false
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

// ============================================================================
// History Handlers
// ============================================================================

pub async fn get_history(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<Vec<NotificationHistory>>, StatusCode> {
    // TODO: Load from state store with limit
    // For now, return mock data
    let mut history = vec![];

    for i in 0..std::cmp::min(query.limit, 10) {
        history.push(NotificationHistory {
            id: Uuid::new_v4().to_string(),
            rule_id: Uuid::new_v4().to_string(),
            rule_name: format!("Rule {}", i + 1),
            event_type: "vm.failed".to_string(),
            severity: if i % 3 == 0 { Severity::Critical } else { Severity::Warning },
            channel: "email".to_string(),
            vm_name: Some(format!("vm-{}", i + 1)),
            message: format!("VM vm-{} failed to start", i + 1),
            sent_at: Utc::now(),
            status: if i % 5 == 0 { NotificationStatus::Failed } else { NotificationStatus::Sent },
            error: if i % 5 == 0 { Some("SMTP connection timeout".to_string()) } else { None },
        });
    }

    Ok(Json(history))
}
