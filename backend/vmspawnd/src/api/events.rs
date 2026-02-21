use axum::{
    extract::State,
    response::{
        sse::{Event, Sse},
        IntoResponse,
    },
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::convert::Infallible;
use chrono::{DateTime, Utc};
use tokio_stream::StreamExt;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMEvent {
    pub id: String,
    pub event_type: VMEventType,
    pub vm_name: String,
    pub detail: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VMEventType {
    Created,
    Started,
    Stopped,
    Paused,
    Resumed,
    Deleted,
    Cloned,
    Migrated,
    SnapshotCreated,
    SnapshotReverted,
    CpuHotplug,
    MemoryHotplug,
    DiskAttached,
    DiskDetached,
    Error,
    AutoHealed,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/events/stream - Server-Sent Events stream for real-time VM events
pub async fn event_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream = async_stream::stream! {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        let mut last_check = Utc::now();

        loop {
            interval.tick().await;

            // Check for new events since last check
            let events: Vec<VMEvent> = state.store
                .list_entities("vm_events")
                .unwrap_or_default();

            let new_events: Vec<&VMEvent> = events.iter()
                .filter(|e| e.timestamp > last_check)
                .collect();

            for event in &new_events {
                let json = serde_json::to_string(event).unwrap_or_default();
                let sse_event = Event::default()
                    .event(format!("vm.{}", serde_json::to_value(&event.event_type)
                        .unwrap_or_default()
                        .as_str()
                        .unwrap_or("unknown")))
                    .data(json)
                    .id(event.id.clone());
                yield Ok(sse_event);
            }

            if !new_events.is_empty() {
                last_check = Utc::now();
            }

            // Send heartbeat to keep connection alive
            yield Ok(Event::default().comment("heartbeat"));
        }
    };

    Sse::new(stream)
}

/// GET /api/events - List recent events
pub async fn list_events(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<VMEvent>> {
    let mut events: Vec<VMEvent> = state.store
        .list_entities("vm_events")
        .unwrap_or_default();

    // Sort by timestamp descending and limit to 100
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    events.truncate(100);

    Json(events)
}

/// Helper: Record a VM event (called internally by other handlers)
pub fn record_event(state: &Arc<AppState>, event_type: VMEventType, vm_name: &str, detail: Option<String>) {
    let event = VMEvent {
        id: uuid::Uuid::new_v4().to_string(),
        event_type,
        vm_name: vm_name.to_string(),
        detail,
        timestamp: Utc::now(),
    };

    if let Err(e) = state.store.save_entity("vm_events", &event.id, &event) {
        tracing::error!("Failed to record VM event: {}", e);
    }
}
