// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMEvent {
    pub id: String,
    pub event_type: String,
    pub vm_name: String,
    pub detail: Option<String>,
    pub timestamp: String,
}

impl super::Client {
    /// Recent VM lifecycle events (`GET /api/events`).
    pub async fn list_events(&self) -> Result<Vec<VMEvent>> {
        self.get("/api/events").await
    }
}
