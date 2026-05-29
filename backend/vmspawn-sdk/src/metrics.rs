// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::Result;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
pub struct VMMetrics {
    #[serde(flatten)]
    pub raw: Value,
}

impl super::Client {
    /// VM resource metrics (`GET /api/vms/{name}/metrics`).
    pub async fn vm_metrics(&self, name: &str) -> Result<VMMetrics> {
        self.get(&format!("/api/vms/{name}/metrics")).await
    }
}
