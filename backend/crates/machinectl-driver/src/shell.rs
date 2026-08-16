// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `ShellDriver` backed by `machinectl shell`, via
//! `zyvor_fabric_vm_driver::machinectl` (blocking CLI call, wrapped in
//! `spawn_blocking`).

use anyhow::Result;
use async_trait::async_trait;
use zyvor_fabric_driver_core::{ShellDriver, ShellOutput};

use crate::MachinectlDriver;

#[async_trait]
impl ShellDriver for MachinectlDriver {
    async fn shell(&self, name: &str, command: &str, _timeout_seconds: Option<u64>) -> Result<ShellOutput> {
        let (name, command) = (name.to_string(), command.to_string());
        let out = tokio::task::spawn_blocking(move || zyvor_fabric_vm_driver::machinectl::shell(&name, &command))
            .await
            .map_err(|e| anyhow::anyhow!("blocking task panicked: {e}"))??;
        Ok(ShellOutput { stdout: out.stdout, stderr: out.stderr, exit_code: out.exit_code })
    }
}
