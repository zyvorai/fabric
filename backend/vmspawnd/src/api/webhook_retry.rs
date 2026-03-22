use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{DateTime, Utc};

use crate::server::AppState;

// ============================================================================
// Webhook Retry with Exponential Backoff
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookDelivery {
    pub id: String,
    pub channel_id: String,
    pub url: String,
    pub payload: String,
    pub attempt: u32,
    pub max_attempts: u32,
    pub status: DeliveryStatus,
    pub response_code: Option<u16>,
    pub error: Option<String>,
    pub next_retry: Option<DateTime<Utc>>,
    pub created: DateTime<Utc>,
    pub completed: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeliveryStatus {
    Pending,
    Sending,
    Delivered,
    Retrying,
    Failed,
}

/// Calculate exponential backoff delay: 2^attempt * base_secs (capped at max_secs)
fn backoff_delay(attempt: u32, base_secs: u64, max_secs: u64) -> u64 {
    let delay = base_secs * 2u64.pow(attempt.min(10));
    delay.min(max_secs)
}

/// Send a webhook with retry logic. Called from notification system.
pub async fn send_webhook_with_retry(
    state: &Arc<AppState>,
    channel_id: &str,
    url: &str,
    payload: &str,
    max_attempts: u32,
) {
    let delivery_id = uuid::Uuid::new_v4().to_string();
    let mut delivery = WebhookDelivery {
        id: delivery_id.clone(),
        channel_id: channel_id.to_string(),
        url: url.to_string(),
        payload: payload.to_string(),
        attempt: 0,
        max_attempts,
        status: DeliveryStatus::Pending,
        response_code: None,
        error: None,
        next_retry: None,
        created: Utc::now(),
        completed: None,
    };

    for attempt in 0..max_attempts {
        delivery.attempt = attempt + 1;
        delivery.status = DeliveryStatus::Sending;
        let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);

        match state.http_client
            .post(url)
            .header("Content-Type", "application/json")
            .header("User-Agent", "vmspawnd-webhook/1.0")
            .body(payload.to_string())
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(response) => {
                let status_code = response.status().as_u16();
                delivery.response_code = Some(status_code);

                if response.status().is_success() {
                    delivery.status = DeliveryStatus::Delivered;
                    delivery.completed = Some(Utc::now());
                    let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);
                    tracing::info!("Webhook delivered to {} (attempt {})", url, attempt + 1);
                    return;
                }

                // Non-success response — retry if retryable (5xx)
                if status_code >= 500 {
                    let delay = backoff_delay(attempt, 5, 300);
                    delivery.status = DeliveryStatus::Retrying;
                    delivery.error = Some(format!("HTTP {}", status_code));
                    delivery.next_retry = Some(Utc::now() + chrono::Duration::seconds(delay as i64));
                    let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);

                    tracing::warn!("Webhook {} returned {}, retrying in {}s (attempt {}/{})",
                        url, status_code, delay, attempt + 1, max_attempts);
                    tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
                    continue;
                }

                // 4xx — don't retry client errors
                delivery.status = DeliveryStatus::Failed;
                delivery.error = Some(format!("HTTP {} (not retryable)", status_code));
                delivery.completed = Some(Utc::now());
                let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);
                tracing::warn!("Webhook {} returned {} (not retryable)", url, status_code);
                return;
            }
            Err(e) => {
                let delay = backoff_delay(attempt, 5, 300);
                delivery.status = DeliveryStatus::Retrying;
                delivery.error = Some(e.to_string());
                delivery.next_retry = Some(Utc::now() + chrono::Duration::seconds(delay as i64));
                let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);

                tracing::warn!("Webhook {} failed: {}, retrying in {}s (attempt {}/{})",
                    url, e, delay, attempt + 1, max_attempts);
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            }
        }
    }

    // All attempts exhausted
    delivery.status = DeliveryStatus::Failed;
    delivery.error = Some(format!("All {} attempts failed", max_attempts));
    delivery.completed = Some(Utc::now());
    let _ = state.store.save_entity("webhook_deliveries", &delivery_id, &delivery);
    tracing::error!("Webhook delivery to {} failed after {} attempts", url, max_attempts);
}

/// GET /api/webhooks/deliveries - List recent webhook deliveries
pub async fn list_deliveries(
    security::RequireRead(_claims): security::RequireRead,
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Result<axum::Json<Vec<WebhookDelivery>>, axum::http::StatusCode> {
    let deliveries = state.store.list_entities::<WebhookDelivery>("webhook_deliveries")
        .map_err(|e| { tracing::error!("Storage error: {}", e); axum::http::StatusCode::INTERNAL_SERVER_ERROR })?;
    Ok(axum::Json(deliveries))
}
