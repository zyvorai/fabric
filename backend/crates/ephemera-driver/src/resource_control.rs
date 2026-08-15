// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `ResourceControlDriver`, `ResourceStatsDriver`, and `LogDriver` are
//! implemented so `EphemeraDriver` satisfies `driver-core::VmDriver`, but
//! every method here errors — Ephemera has no cgroup delegation or
//! log-streaming endpoint yet. This is Phase 5 territory in the
//! systemd-removal migration plan (`ephemera-cgroup`, `GET
//! /v1/vms/{id}/resources|freeze|thaw|frozen|metrics|pressure|logs`);
//! callers needing these today (`api/system.rs` CPU pinning, `api/logs.rs`,
//! `websocket.rs`) stay on the `MachinectlDriver` path via the `driver`
//! config flag until then.

use anyhow::{bail, Result};
use async_trait::async_trait;
use vm_model::{VMMetrics, VMPressure};
use zyvor_fabric_driver_core::{LogDriver, LogStream, ResourceControlDriver, ResourceStatsDriver};

use crate::EphemeraDriver;

fn unsupported(op: &str) -> anyhow::Error {
    anyhow::anyhow!(
        "'{op}' is not yet supported by the Ephemera driver backend — pending Ephemera's \
         cgroup-delegation extension (systemd-removal migration plan, Phase 5)"
    )
}

#[async_trait]
impl ResourceStatsDriver for EphemeraDriver {
    async fn get_metrics(&self, _name: &str) -> Result<VMMetrics> {
        Err(unsupported("get_metrics"))
    }

    async fn get_pressure(&self, _name: &str) -> Result<VMPressure> {
        Err(unsupported("get_pressure"))
    }
}

#[async_trait]
impl ResourceControlDriver for EphemeraDriver {
    async fn set_cpu_quota(&self, _name: &str, _percent: u32) -> Result<()> {
        Err(unsupported("set_cpu_quota"))
    }

    async fn set_memory_max(&self, _name: &str, _bytes: u64) -> Result<()> {
        Err(unsupported("set_memory_max"))
    }

    async fn set_io_weight(&self, _name: &str, _weight: u32) -> Result<()> {
        Err(unsupported("set_io_weight"))
    }

    async fn freeze(&self, _name: &str) -> Result<()> {
        Err(unsupported("freeze"))
    }

    async fn thaw(&self, _name: &str) -> Result<()> {
        Err(unsupported("thaw"))
    }

    async fn is_frozen(&self, _name: &str) -> Result<bool> {
        Err(unsupported("is_frozen"))
    }

    async fn set_pids_max(&self, _name: &str, _max: u64) -> Result<()> {
        Err(unsupported("set_pids_max"))
    }

    async fn set_cpuset(&self, _name: &str, _cpus: &[u32]) -> Result<()> {
        Err(unsupported("set_cpuset"))
    }
}

#[async_trait]
impl LogDriver for EphemeraDriver {
    async fn stream_logs(&self, _name: &str, _lines: u32) -> Result<LogStream> {
        bail!(unsupported("stream_logs"))
    }
}
