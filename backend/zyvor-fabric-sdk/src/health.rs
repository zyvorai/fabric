// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::Result;

impl super::Client {
    /// Liveness check (`GET /health`).
    pub async fn health(&self) -> Result<String> {
        self.get_text("/health").await
    }
}
