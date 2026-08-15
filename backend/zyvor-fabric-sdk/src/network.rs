// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct NetworkPolicySummary {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub enabled: bool,
}

impl super::Client {
    /// List network policies (`GET /api/network-policies`).
    pub async fn list_network_policies(&self) -> Result<Vec<NetworkPolicySummary>> {
        self.get("/api/network-policies").await
    }

    /// Network topology (`GET /api/network/topology`).
    pub async fn network_topology(&self) -> Result<serde_json::Value> {
        self.get("/api/network/topology").await
    }
}
