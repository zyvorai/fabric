use axum::{
    extract::State,
    response::sse::{Event, Sse},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::convert::Infallible;
use chrono::{DateTime, Utc};

use crate::server::AppState;
use security::RequireRead;

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
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    tracing::debug!("events::{}", stringify!(event_stream));
    let mut rx = state.event_tx.subscribe();
    let shutdown = state.shutdown.clone();
    let stream = async_stream::stream! {
        loop {
            tokio::select! {
                _ = shutdown.cancelled() => break,
                result = rx.recv() => {
                    match result {
                        Ok(event) => {
                            let json = serde_json::to_string(&event).unwrap_or_default();
                            let sse_event = Event::default()
                                .event(format!("vm.{}", serde_json::to_value(&event.event_type)
                                    .unwrap_or_default()
                                    .as_str()
                                    .unwrap_or("unknown")))
                                .data(json)
                                .id(event.id.clone());
                            yield Ok(sse_event);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!("SSE client lagged by {} events", n);
                            yield Ok(Event::default().comment(format!("missed {} events", n)));
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    };
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

/// GET /api/events - List recent events
pub async fn list_events(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<Vec<VMEvent>> {
    tracing::debug!("events::{}", stringify!(list_events));
    let mut events: Vec<VMEvent> = state.store
        .list_entities("vm_events")
        .unwrap_or_default();

    // Sort by timestamp descending and limit to 100
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    events.truncate(100);

    Json(events)
}

/// Counter for periodic event pruning
static EVENT_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Helper: Record a VM event (called internally by other handlers)
pub fn record_event(state: &Arc<AppState>, event_type: VMEventType, vm_name: &str, detail: Option<String>) {
    let event = VMEvent {
        id: uuid::Uuid::new_v4().to_string(),
        event_type,
        vm_name: vm_name.to_string(),
        detail,
        timestamp: Utc::now(),
    };

    // Persist to disk
    if let Err(e) = state.store.save_entity("vm_events", &event.id, &event) {
        tracing::error!("Failed to record VM event: {}", e);
    }
    // Broadcast to SSE subscribers (ignore if no receivers)
    let _ = state.event_tx.send(event);

    // Periodic pruning: every 100 events, remove old entries beyond retention limit.
    // Run in a background task to avoid blocking the request path.
    if EVENT_COUNTER.fetch_add(1, Ordering::Relaxed) % 100 == 0 {
        let state_clone = state.clone();
        tokio::spawn(async move {
            prune_old_events(&state_clone, 1000);
        });
    }
}

/// Remove events beyond the retention limit, keeping the most recent ones.
fn prune_old_events(state: &Arc<AppState>, keep: usize) {
    if let Ok(mut events) = state.store.list_entities::<VMEvent>("vm_events") {
        if events.len() > keep {
            events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
            for event in events.drain(keep..) {
                let _ = state.store.delete_entity("vm_events", &event.id);
            }
            tracing::debug!("Pruned old VM events, kept {}", keep);
        }
    }
}
