// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! Thin REST client for [Ephemera](https://github.com/hypersdk/ephemera)'s
//! `/v1/vms...` API — the disposable-VM control plane that is replacing
//! systemd-machined/systemd-vmspawn as vmspawnd's VM lifecycle backend.
//!
//! This crate only wraps the wire protocol (request/response types + HTTP
//! calls); it does not implement `driver-core`'s `VMDriver` trait family —
//! that mapping lives in a separate `ephemera-driver` crate so the raw
//! client can be reused/tested independently of that trait boundary.
//!
//! The DTOs below mirror `ephemera-core::model` and `ephemera-api::router`
//! at Ephemera commit `408f4389ba4453448d5e1dc0e7b0001a568b1f19`. Because
//! integration is out-of-process (REST, not a Cargo path/git dependency on
//! Ephemera's own crates), these types must be kept in sync by hand when
//! Ephemera's API changes — that's the deliberate trade for not coupling
//! zyvor-fabric's build to Ephemera's crate versions.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================================================
// Wire types (mirror ephemera-core::model)
// ============================================================================

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BackendKind {
    Qemu,
    CloudHypervisor,
    Firecracker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "mode")]
pub enum NetworkSpec {
    None,
    User {
        #[serde(default)]
        forwards: Vec<PortForward>,
    },
    Tap {
        #[serde(default)]
        tap_name: Option<String>,
        #[serde(default)]
        bridge: Option<String>,
        #[serde(default)]
        mac: Option<String>,
    },
    Macvtap {
        parent: String,
        #[serde(default)]
        macvtap_mode: Option<String>,
        #[serde(default)]
        mac: Option<String>,
    },
}

impl Default for NetworkSpec {
    fn default() -> Self {
        Self::User { forwards: vec![] }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForward {
    pub host_port: u16,
    pub guest_port: u16,
    #[serde(default = "default_tcp")]
    pub protocol: String,
}
fn default_tcp() -> String {
    "tcp".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSpec {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_agent_port")]
    pub port: u32,
}
fn default_agent_port() -> u32 {
    17777
}

impl Default for AgentSpec {
    fn default() -> Self {
        Self { enabled: false, port: default_agent_port() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudInitSpec {
    #[serde(default)]
    pub hostname: Option<String>,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub ssh_authorized_keys: Vec<String>,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub runcmd: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVmRequest {
    pub name: String,
    pub backend: BackendKind,
    pub image: PathBuf,
    #[serde(default = "default_vcpus")]
    pub vcpus: u8,
    #[serde(default = "default_memory")]
    pub memory_mib: u64,
    #[serde(default)]
    pub disk_size_gib: Option<u64>,
    #[serde(default)]
    pub kernel: Option<PathBuf>,
    #[serde(default)]
    pub initrd: Option<PathBuf>,
    #[serde(default)]
    pub firmware: Option<PathBuf>,
    #[serde(default)]
    pub kernel_args: Option<String>,
    #[serde(default)]
    pub network: NetworkSpec,
    #[serde(default)]
    pub cloud_init: Option<CloudInitSpec>,
    #[serde(default)]
    pub ttl_seconds: Option<u64>,
    #[serde(default)]
    pub extra_args: Vec<String>,
    #[serde(default)]
    pub agent: Option<AgentSpec>,
}
fn default_vcpus() -> u8 {
    2
}
fn default_memory() -> u64 {
    2048
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VmStatus {
    Creating,
    Running,
    Paused,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VmRecord {
    pub id: Uuid,
    pub name: String,
    pub backend: BackendKind,
    pub status: VmStatus,
    pub pid: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub workspace: PathBuf,
    pub disk: PathBuf,
    pub seed_disk: Option<PathBuf>,
    pub tap_name: Option<String>,
    pub control_socket: Option<PathBuf>,
    pub log_path: PathBuf,
    pub error: Option<String>,
    pub request: CreateVmRequest,
    #[serde(default)]
    pub guest_cid: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct VmListResponse {
    items: Vec<VmRecord>,
}

#[derive(Debug, Serialize)]
struct ExecRequest {
    command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout_seconds: Option<u64>,
}

// ============================================================================
// Client
// ============================================================================

/// A REST client for one `ephemera serve` instance.
#[derive(Clone)]
pub struct EphemeraClient {
    base_url: reqwest::Url,
    http: reqwest::Client,
}

impl EphemeraClient {
    /// `base_url` is Ephemera's listen address, e.g. `http://127.0.0.1:7788`.
    pub fn new(base_url: impl AsRef<str>) -> Result<Self> {
        let base_url = reqwest::Url::parse(base_url.as_ref())
            .with_context(|| format!("invalid Ephemera base URL: {}", base_url.as_ref()))?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("failed to build Ephemera HTTP client")?;
        Ok(Self { base_url, http })
    }

    fn url(&self, path: &str) -> Result<reqwest::Url> {
        self.base_url.join(path).with_context(|| format!("failed to build Ephemera URL for {path}"))
    }

    /// `GET /healthz` — used at startup and by capability probes.
    pub async fn healthy(&self) -> bool {
        matches!(
            self.http.get(self.url("/healthz").unwrap()).send().await,
            Ok(resp) if resp.status().is_success()
        )
    }

    pub async fn create_vm(&self, req: &CreateVmRequest) -> Result<VmRecord> {
        let resp = self.http.post(self.url("/v1/vms")?).json(req).send().await?;
        Self::parse(resp).await
    }

    pub async fn list_vms(&self) -> Result<Vec<VmRecord>> {
        let resp = self.http.get(self.url("/v1/vms")?).send().await?;
        let body: VmListResponse = Self::parse(resp).await?;
        Ok(body.items)
    }

    /// Find a VM by name. Ephemera has no server-side name filter yet, so
    /// this scans `list_vms()` client-side — fine for the harness/smoke-test
    /// scale this crate is used at today; revisit with a `?name=` query
    /// parameter (server-side) before VM counts grow large.
    pub async fn find_by_name(&self, name: &str) -> Result<Option<VmRecord>> {
        Ok(self.list_vms().await?.into_iter().find(|vm| vm.name == name))
    }

    pub async fn get_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.http.get(self.url(&format!("/v1/vms/{id}"))?).send().await?;
        Self::parse(resp).await
    }

    pub async fn stop_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.http.post(self.url(&format!("/v1/vms/{id}/stop"))?).send().await?;
        Self::parse(resp).await
    }

    pub async fn pause_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.http.post(self.url(&format!("/v1/vms/{id}/pause"))?).send().await?;
        Self::parse(resp).await
    }

    pub async fn resume_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.http.post(self.url(&format!("/v1/vms/{id}/resume"))?).send().await?;
        Self::parse(resp).await
    }

    pub async fn delete_vm(&self, id: Uuid) -> Result<()> {
        let resp = self.http.delete(self.url(&format!("/v1/vms/{id}"))?).send().await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            bail!("DELETE /v1/vms/{id} failed: {}", resp.status())
        }
    }

    /// `POST /v1/vms/{id}/agent` — exec a command over the in-guest vsock
    /// agent (requires `CreateVmRequest.agent.enabled`). Returned as raw
    /// JSON for now; `ephemera-guest-protocol::AgentResponse` isn't mirrored
    /// here yet since exec isn't part of the Phase 1 lifecycle smoke test.
    pub async fn agent_exec(
        &self,
        id: Uuid,
        command: impl Into<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<serde_json::Value> {
        let resp = self
            .http
            .post(self.url(&format!("/v1/vms/{id}/agent"))?)
            .json(&ExecRequest { command: command.into(), timeout_seconds })
            .send()
            .await?;
        Self::parse(resp).await
    }

    async fn parse<T: serde::de::DeserializeOwned>(resp: reqwest::Response) -> Result<T> {
        let status = resp.status();
        let bytes = resp.bytes().await.context("failed to read Ephemera response body")?;
        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes);
            bail!("Ephemera request failed: {status} — {body}");
        }
        serde_json::from_slice(&bytes)
            .with_context(|| format!("failed to parse Ephemera response ({status})"))
    }
}
