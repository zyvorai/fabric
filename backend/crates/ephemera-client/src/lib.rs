// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! Thin REST client for [Ephemera](https://github.com/hypersdk/ephemera)'s
//! `/v1/vms...` API — the disposable-VM control plane that is replacing
//! systemd-machined/systemd-vmspawn as zyvor-fabricd's VM lifecycle backend.
//!
//! This crate only wraps the wire protocol (request/response types + HTTP
//! calls); it does not implement `driver-core`'s `VMDriver` trait family —
//! that mapping lives in a separate `ephemera-driver` crate so the raw
//! client can be reused/tested independently of that trait boundary.
//!
//! The DTOs below mirror `ephemera-core::model` and `ephemera-api::router`.
//! Because integration is out-of-process (REST, not a Cargo path/git
//! dependency on Ephemera's own crates), these types must be kept in sync
//! by hand when Ephemera's API changes — that's the deliberate trade for
//! not coupling zyvor-fabric's build to Ephemera's crate versions. Ephemera
//! has grown a bearer-token auth layer (`Role::Admin`/`Role::ReadOnly`)
//! since this client was first written; `EphemeraClient::with_token` covers
//! it, and stays a no-op against a deployment that leaves `auth.tokens`
//! empty (auth off — today's default posture, see the migration plan's
//! "Auth boundary" note).

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
    /// Resolved to a concrete backend server-side; never appears on a
    /// stored `VmRecord`, only ever sent on a `CreateVmRequest`.
    Auto,
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
    /// Shared secret the guest agent requires on every request. Leave unset
    /// on a request with `enabled: true` and Ephemera generates one and
    /// burns it into the VM's disk before boot.
    #[serde(default)]
    pub token: Option<String>,
}
fn default_agent_port() -> u32 {
    17777
}

impl Default for AgentSpec {
    fn default() -> Self {
        Self { enabled: false, port: default_agent_port(), token: None }
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
    /// cgroup v2 path the launched VMM process was migrated into, once
    /// `VmManager` has done so — `None` until the first successful launch
    /// completes cgroup setup, or if cgroup delegation failed for this VM.
    #[serde(default)]
    pub cgroup_path: Option<PathBuf>,
}

/// cgroup v2 resource-control settings to apply to a running VM. Mirrors
/// `ephemera_core::model::ResourcePatch`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct ResourcePatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_quota_percent: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_max_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_weight: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pids_max: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpuset_cpus: Option<Vec<u32>>,
}

/// Mirrors `ephemera_core::model::VmMetrics`.
#[derive(Debug, Clone, Deserialize)]
pub struct VmMetrics {
    pub cpu_usage_percent: f64,
    pub memory_usage_bytes: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
}

/// Mirrors `ephemera_cgroup::PressureRecord`.
#[derive(Debug, Clone, Deserialize)]
pub struct PressureRecord {
    pub avg10: f64,
    pub avg60: f64,
    pub avg300: f64,
    pub total: u64,
}

/// Mirrors `ephemera_core::model::VmPressure`.
#[derive(Debug, Clone, Deserialize)]
pub struct VmPressure {
    pub cpu_some: Option<PressureRecord>,
    pub memory_some: Option<PressureRecord>,
    pub memory_full: Option<PressureRecord>,
    pub io_some: Option<PressureRecord>,
    pub io_full: Option<PressureRecord>,
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
    /// Bearer token sent on every request once Ephemera's `auth.tokens` is
    /// non-empty. `None` is correct (and required) against a deployment
    /// that leaves auth disabled — there's nothing to send.
    token: Option<String>,
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
        Ok(Self { base_url, http, token: None })
    }

    /// Attach a bearer token, required once the target instance has
    /// `auth.tokens` configured (see `ephemera_core::config::AuthConfig`).
    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    fn url(&self, path: &str) -> Result<reqwest::Url> {
        self.base_url.join(path).with_context(|| format!("failed to build Ephemera URL for {path}"))
    }

    fn authed(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.token {
            Some(t) => builder.bearer_auth(t),
            None => builder,
        }
    }

    /// `GET /healthz` — used at startup and by capability probes. Unlike
    /// every other endpoint, `/healthz` is reachable without a bearer token
    /// even when auth is enabled (see `ephemera_api::auth_middleware`), so
    /// this deliberately does not go through `authed()`.
    pub async fn healthy(&self) -> bool {
        matches!(
            self.http.get(self.url("/healthz").unwrap()).send().await,
            Ok(resp) if resp.status().is_success()
        )
    }

    pub async fn create_vm(&self, req: &CreateVmRequest) -> Result<VmRecord> {
        let resp = self.authed(self.http.post(self.url("/v1/vms")?)).json(req).send().await?;
        Self::parse(resp).await
    }

    pub async fn list_vms(&self) -> Result<Vec<VmRecord>> {
        let resp = self.authed(self.http.get(self.url("/v1/vms")?)).send().await?;
        let body: VmListResponse = Self::parse(resp).await?;
        Ok(body.items)
    }

    /// Find a VM by exact name via the server-side `?name=` filter — needed
    /// because `driver-core`'s `VMDriver` trait is keyed by name
    /// (systemd-machined's model) while `VmRecord` is keyed by `Uuid`.
    pub async fn find_by_name(&self, name: &str) -> Result<Option<VmRecord>> {
        let mut url = self.url("/v1/vms")?;
        url.query_pairs_mut().append_pair("name", name);
        let resp = self.authed(self.http.get(url)).send().await?;
        let body: VmListResponse = Self::parse(resp).await?;
        Ok(body.items.into_iter().next())
    }

    pub async fn get_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.authed(self.http.get(self.url(&format!("/v1/vms/{id}"))?)).send().await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/start` — relaunch a `Stopped` VM from its existing
    /// disk (image cloning/cloud-init reseed are skipped server-side).
    /// Idempotent: a VM already `Running` is returned unchanged.
    pub async fn start_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/start"))?)).send().await?;
        Self::parse(resp).await
    }

    pub async fn stop_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/stop"))?)).send().await?;
        Self::parse(resp).await
    }

    pub async fn pause_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/pause"))?)).send().await?;
        Self::parse(resp).await
    }

    pub async fn resume_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/resume"))?)).send().await?;
        Self::parse(resp).await
    }

    pub async fn delete_vm(&self, id: Uuid) -> Result<()> {
        let resp = self.authed(self.http.delete(self.url(&format!("/v1/vms/{id}"))?)).send().await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            bail!("DELETE /v1/vms/{id} failed: {}", resp.status())
        }
    }

    /// `POST /v1/vms/{id}/agent` — exec a command over the in-guest vsock
    /// agent (requires `CreateVmRequest.agent.enabled`). Returned as raw
    /// JSON for now; `ephemera-guest-protocol::AgentResponse` isn't mirrored
    /// here yet since exec isn't part of the Phase 1/2 read-only/lifecycle
    /// scope this client currently covers.
    pub async fn agent_exec(
        &self,
        id: Uuid,
        command: impl Into<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<serde_json::Value> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/agent"))?))
            .json(&ExecRequest { command: command.into(), timeout_seconds })
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/resources` — apply a partial cgroup resource
    /// patch to a running VM. Only fields set on `patch` are changed.
    pub async fn set_resources(&self, id: Uuid, patch: &ResourcePatch) -> Result<()> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/resources"))?))
            .json(patch)
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    /// `POST /v1/vms/{id}/freeze` — suspend the VM's cgroup via the v2
    /// freezer (`cgroup.freeze`), independent of guest-level pause/resume.
    pub async fn freeze(&self, id: Uuid) -> Result<()> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/freeze"))?)).send().await?;
        Self::expect_no_content(resp).await
    }

    pub async fn thaw(&self, id: Uuid) -> Result<()> {
        let resp = self.authed(self.http.post(self.url(&format!("/v1/vms/{id}/thaw"))?)).send().await?;
        Self::expect_no_content(resp).await
    }

    pub async fn is_frozen(&self, id: Uuid) -> Result<bool> {
        let resp = self.authed(self.http.get(self.url(&format!("/v1/vms/{id}/frozen"))?)).send().await?;
        let body: serde_json::Value = Self::parse(resp).await?;
        Ok(body.get("frozen").and_then(|v| v.as_bool()).unwrap_or(false))
    }

    /// `GET /v1/vms/{id}/stats` — point-in-time cgroup usage.
    pub async fn stats(&self, id: Uuid) -> Result<VmMetrics> {
        let resp = self.authed(self.http.get(self.url(&format!("/v1/vms/{id}/stats"))?)).send().await?;
        Self::parse(resp).await
    }

    /// `GET /v1/vms/{id}/pressure` — PSI (cpu/memory/io) for the VM's cgroup.
    pub async fn pressure(&self, id: Uuid) -> Result<VmPressure> {
        let resp = self.authed(self.http.get(self.url(&format!("/v1/vms/{id}/pressure"))?)).send().await?;
        Self::parse(resp).await
    }

    async fn expect_no_content(resp: reqwest::Response) -> Result<()> {
        let status = resp.status();
        if status.is_success() {
            Ok(())
        } else {
            let body = resp.text().await.unwrap_or_default();
            bail!("Ephemera request failed: {status} — {body}")
        }
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
