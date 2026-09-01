// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! `ConsoleDriver` backed by Ephemera's `GET /v1/vms/{id}/console`
//! WebSocket (`EphemeraClient::open_console`), itself backed by the vsock
//! guest agent's `OpenShell` op — see that op's doc comment for why there's
//! no live terminal resize.

use anyhow::Result;
use async_trait::async_trait;
use zyvor_fabric_driver_core::{ConsoleDriver, ConsoleSession};

use crate::EphemeraDriver;

#[async_trait]
impl ConsoleDriver for EphemeraDriver {
    async fn open_console(&self, name: &str, cols: u16, rows: u16) -> Result<ConsoleSession> {
        let vm = self.resolve(name).await?;
        let ws = self.client.open_console(vm.id, cols, rows).await?;
        Ok(Box::pin(ws))
    }
}
