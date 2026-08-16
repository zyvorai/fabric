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

    async fn copy_to(&self, name: &str, host_path: &str, machine_path: &str, _mode: Option<u32>) -> Result<()> {
        // machinectl copy-to preserves the source file's own mode; there's
        // no CLI flag to override it, so `mode` is unused here (Ephemera's
        // PutFile has no source file to inherit from, hence needing it).
        let (name, host_path, machine_path) = (name.to_string(), host_path.to_string(), machine_path.to_string());
        tokio::task::spawn_blocking(move || zyvor_fabric_vm_driver::machinectl::copy_to(&name, &host_path, &machine_path))
            .await
            .map_err(|e| anyhow::anyhow!("blocking task panicked: {e}"))?
    }

    async fn copy_from(&self, name: &str, machine_path: &str, host_path: &str) -> Result<()> {
        let (name, machine_path, host_path) = (name.to_string(), machine_path.to_string(), host_path.to_string());
        tokio::task::spawn_blocking(move || zyvor_fabric_vm_driver::machinectl::copy_from(&name, &machine_path, &host_path))
            .await
            .map_err(|e| anyhow::anyhow!("blocking task panicked: {e}"))?
    }
}
