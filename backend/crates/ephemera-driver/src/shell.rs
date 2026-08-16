// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `ShellDriver` backed by Ephemera's vsock guest-agent `Exec` op
//! (`POST /v1/vms/{id}/agent`) — requires the VM to have been created with
//! `CreateVmRequest.agent.enabled`; Ephemera itself errors clearly
//! (`"guest agent is not enabled for this VM"`) rather than hanging when
//! it wasn't.

use anyhow::{bail, Result};
use async_trait::async_trait;
use zyvor_fabric_driver_core::{ShellDriver, ShellOutput};
use zyvor_fabric_ephemera_client::AgentResponse;

use crate::EphemeraDriver;

#[async_trait]
impl ShellDriver for EphemeraDriver {
    async fn shell(&self, name: &str, command: &str, timeout_seconds: Option<u64>) -> Result<ShellOutput> {
        let vm = self.resolve(name).await?;
        match self.client.agent_exec(vm.id, command, timeout_seconds).await? {
            AgentResponse::Exec { exit_code, stdout, stderr } => Ok(ShellOutput { stdout, stderr, exit_code }),
            AgentResponse::Error { message } => bail!("guest agent error: {message}"),
            other => bail!("unexpected guest agent response to Exec: {other:?}"),
        }
    }
}
