// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct StoragePool {
    pub name: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(rename = "type")]
    pub pool_type: Option<String>,
}

impl super::Client {
    /// List storage pools (`GET /api/storage/pools`).
    pub async fn list_storage_pools(&self) -> Result<Vec<StoragePool>> {
        self.get("/api/storage/pools").await
    }

    /// Get storage pool (`GET /api/storage/pools/{name}`).
    pub async fn get_storage_pool(&self, name: &str) -> Result<StoragePool> {
        self.get(&format!("/api/storage/pools/{name}")).await
    }
}
