// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

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
//!
//! As of Ephemera v0.1.0, `CreateVmRequest`/`VmRecord` here are missing the
//! fields behind its newer per-VM storage backends (`storage`: LVM thin/NBD/
//! Ceph RBD), per-VM network namespaces (`NetworkSpec::Tap.netns`), and the
//! Firecracker-jailer/vsock-proxy bookkeeping (`jail_path`, `vsock_socket`,
//! `lvm_lv`, `nbd_pid`) — see `ephemera-driver`'s crate doc comment for the
//! full gap list. Every VM created through this client still gets Ephemera's
//! default qcow2/raw storage and shared-bridge networking until those fields
//! are added here.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use futures::{Stream, TryStreamExt};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncBufReadExt;
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
        /// Give the VM its own network namespace with a per-namespace
        /// dnsmasq DHCP server, instead of a tap on a shared host bridge
        /// (`bridge` is ignored when this is true) — see Ephemera's
        /// `ephemera_network::netns`. Mirrors `ephemera_core::model::
        /// NetworkSpec::Tap.netns`.
        #[serde(default)]
        netns: bool,
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
        Self {
            enabled: false,
            port: default_agent_port(),
            token: None,
        }
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
    /// Configure the guest's network address statically via cloud-init
    /// instead of DHCP -- only meaningful for `NetworkSpec::Tap { netns:
    /// true, .. }`. Mirrors `ephemera_core::model::CloudInitSpec.
    /// static_network`.
    #[serde(default)]
    pub static_network: bool,
    #[serde(default)]
    pub write_files: Vec<CloudInitFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudInitFile {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub permissions: Option<String>,
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
    #[serde(default)]
    pub shared_folders: Vec<SharedFolder>,
}

/// A host directory shared into the guest via virtiofs, declared at create
/// time — see Ephemera's own `ephemera_core::model::SharedFolder` doc
/// comment for why this replaces `machinectl bind`'s live mount instead of
/// having a live equivalent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedFolder {
    pub host_path: PathBuf,
    pub guest_path: String,
    #[serde(default)]
    pub read_only: bool,
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
    /// Set for `NetworkSpec::Tap { netns: true, .. }` — the VM's private
    /// network namespace name. Mirrors `ephemera_core::model::VmRecord.netns`.
    #[serde(default)]
    pub netns: Option<String>,
    /// The guest's DHCP-leased IP on its own private subnet, resolved by
    /// Ephemera on every read for `netns: true` VMs — `None` for every
    /// other networking mode, or until the guest completes a DHCP
    /// handshake. Mirrors `ephemera_core::model::VmRecord.guest_ip`.
    #[serde(default)]
    pub guest_ip: Option<String>,
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

/// A warm pool: `size` VMs pre-booted from `template`, then paused, ready
/// to be handed out instantly by `claim_pool` instead of cold-created.
/// Mirrors `ephemera_core::model::PoolRecord`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolRecord {
    pub name: String,
    pub size: usize,
    pub template: CreateVmRequest,
    #[serde(default)]
    pub members: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
struct PoolSpecRequest {
    name: String,
    size: usize,
    template: CreateVmRequest,
}

#[derive(Debug, Deserialize)]
struct PoolListResponse {
    items: Vec<PoolRecord>,
}

/// Applied to the VM handed back by a pool claim, replacing whatever the
/// template said for these two fields. Mirrors
/// `ephemera_core::model::ClaimOverrides`.
#[derive(Debug, Clone, Serialize, Default)]
pub struct ClaimOverrides {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub ttl_seconds: Option<u64>,
}

/// One entry in Ephemera's image catalog. Mirrors
/// `ephemera_image::catalog::CatalogEntry` on the wire, plus
/// `signature_valid` which only `GET /v1/images/catalog`'s
/// `CatalogListEntry` wrapper adds (`None` when the client's own requests —
/// add/rename/clone/export — return a bare `CatalogEntry` with no
/// verification result attached).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub name: String,
    pub source: String,
    pub sha256: String,
    pub format: String,
    #[serde(default)]
    pub distro: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
    #[serde(default)]
    pub signature: Option<String>,
    #[serde(default)]
    pub signature_valid: Option<bool>,
    #[serde(default)]
    pub read_only: bool,
}

#[derive(Debug, Deserialize)]
struct CatalogListResponse {
    items: Vec<CatalogEntry>,
}

#[derive(Debug, Serialize)]
struct AddCatalogEntryRequest {
    name: String,
    source: String,
    format: String,
}

#[derive(Debug, Serialize)]
struct RenameCatalogEntryRequest {
    new_name: String,
}

#[derive(Debug, Serialize)]
struct CloneCatalogEntryRequest {
    target_name: String,
}

#[derive(Debug, Serialize)]
struct ExportCatalogEntryRequest {
    path: PathBuf,
}

#[derive(Debug, Serialize)]
struct SetCatalogReadOnlyRequest {
    read_only: bool,
}

#[derive(Debug, Deserialize)]
struct CleanCatalogResponse {
    removed: Vec<String>,
}

#[derive(Debug, Serialize)]
struct ExecRequest {
    command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
struct PutFileRequest {
    path: String,
    content_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<u32>,
}

#[derive(Debug, Serialize)]
struct GetFileRequest {
    path: String,
}

/// Mirrors `ephemera_guest_protocol::AgentResponse`. `Error` is an
/// agent/protocol-level failure (bad token, malformed request) — a command
/// that ran but exited non-zero is still `Exec` with that `exit_code`, not
/// this variant.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "result", rename_all = "kebab-case")]
pub enum AgentResponse {
    Pong,
    Exec {
        exit_code: i32,
        stdout: String,
        stderr: String,
    },
    FileWritten,
    FileContent {
        content_base64: String,
        mode: u32,
    },
    ShuttingDown,
    Error {
        message: String,
    },
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
        Ok(Self {
            base_url,
            http,
            token: None,
        })
    }

    /// Attach a bearer token, required once the target instance has
    /// `auth.tokens` configured (see `ephemera_core::config::AuthConfig`).
    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    fn url(&self, path: &str) -> Result<reqwest::Url> {
        self.base_url
            .join(path)
            .with_context(|| format!("failed to build Ephemera URL for {path}"))
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
        let resp = self
            .authed(self.http.post(self.url("/v1/vms")?))
            .json(req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    pub async fn list_vms(&self) -> Result<Vec<VmRecord>> {
        let resp = self
            .authed(self.http.get(self.url("/v1/vms")?))
            .send()
            .await?;
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
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/vms/{id}"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/start` — relaunch a `Stopped` VM from its existing
    /// disk (image cloning/cloud-init reseed are skipped server-side).
    /// Idempotent: a VM already `Running` is returned unchanged.
    pub async fn start_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/start"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    pub async fn stop_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/stop"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/start-from-snapshot` — like `start_vm`, but
    /// restores CPU/memory/device state from an existing internal
    /// (`snapshot-save`) tag on the VM's own disk via QEMU's `-loadvm`,
    /// instead of an ordinary cold boot. A one-shot override for this
    /// launch only.
    pub async fn start_vm_from_snapshot(&self, id: Uuid, tag: &str) -> Result<VmRecord> {
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/start-from-snapshot"))?),
            )
            .json(&serde_json::json!({"tag": tag}))
            .send()
            .await?;
        Self::parse(resp).await
    }

    pub async fn pause_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/pause"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    pub async fn resume_vm(&self, id: Uuid) -> Result<VmRecord> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/resume"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    pub async fn delete_vm(&self, id: Uuid) -> Result<()> {
        let resp = self
            .authed(self.http.delete(self.url(&format!("/v1/vms/{id}"))?))
            .send()
            .await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            bail!("DELETE /v1/vms/{id} failed: {}", resp.status())
        }
    }

    /// `POST /v1/vms/{id}/agent` — exec a command over the in-guest vsock
    /// agent (requires `CreateVmRequest.agent.enabled`; Ephemera itself
    /// returns a clear error for a VM that doesn't have it, rather than a
    /// silent hang).
    pub async fn agent_exec(
        &self,
        id: Uuid,
        command: impl Into<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<AgentResponse> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/agent"))?))
            .json(&ExecRequest {
                command: command.into(),
                timeout_seconds,
            })
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/agent/put-file`
    pub async fn agent_put_file(
        &self,
        id: Uuid,
        path: &str,
        content_base64: &str,
        mode: Option<u32>,
    ) -> Result<AgentResponse> {
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/agent/put-file"))?),
            )
            .json(&PutFileRequest {
                path: path.to_string(),
                content_base64: content_base64.to_string(),
                mode,
            })
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/vms/{id}/agent/get-file`
    pub async fn agent_get_file(&self, id: Uuid, path: &str) -> Result<AgentResponse> {
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/agent/get-file"))?),
            )
            .json(&GetFileRequest {
                path: path.to_string(),
            })
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `GET /v1/vms/{id}/console?cols=..&rows=..` — dials Ephemera's
    /// interactive-console WebSocket and returns a raw byte stream: reads
    /// yield whatever the guest's shell wrote, writes go straight to its
    /// stdin, with no framing on this side either (WS binary frames only,
    /// unwrapped transparently by [`ConsoleWs`]).
    pub async fn open_console(&self, id: Uuid, cols: u16, rows: u16) -> Result<ConsoleWs> {
        let mut ws_url = self.url(&format!("/v1/vms/{id}/console"))?;
        ws_url
            .set_scheme(if self.base_url.scheme() == "https" {
                "wss"
            } else {
                "ws"
            })
            .map_err(|_| {
                anyhow::anyhow!("failed to convert Ephemera base URL to a ws(s):// scheme")
            })?;
        ws_url
            .query_pairs_mut()
            .append_pair("cols", &cols.to_string())
            .append_pair("rows", &rows.to_string());

        let mut request = tokio_tungstenite::tungstenite::http::Request::builder()
            .uri(ws_url.as_str())
            .header("Host", ws_url.host_str().unwrap_or_default())
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Sec-WebSocket-Version", "13")
            .header(
                "Sec-WebSocket-Key",
                tokio_tungstenite::tungstenite::handshake::client::generate_key(),
            );
        if let Some(token) = &self.token {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        let request = request
            .body(())
            .context("building console WebSocket request")?;

        let (stream, _response) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| {
                // tungstenite's `Error::Http` Display only prints the status
                // line ("HTTP error: 400 Bad Request") -- the actual reason
                // (e.g. Ephemera's own `{"error": "connect(vsock ...): ..."}`
                // body) is right there in the response but silently dropped
                // unless pulled out explicitly. Without this, every console
                // failure looked identical to the browser regardless of cause.
                if let tokio_tungstenite::tungstenite::Error::Http(resp) = &e {
                    if let Some(body) = resp.body() {
                        let detail = String::from_utf8_lossy(body);
                        let detail = serde_json::from_str::<serde_json::Value>(&detail)
                            .ok()
                            .and_then(|v| {
                                v.get("error").and_then(|e| e.as_str()).map(str::to_owned)
                            })
                            .unwrap_or_else(|| detail.into_owned());
                        return anyhow::anyhow!(
                            "connecting to console WebSocket for VM {id}: {} {}: {detail}",
                            resp.status().as_u16(),
                            resp.status().canonical_reason().unwrap_or(""),
                        );
                    }
                }
                anyhow::Error::new(e)
                    .context(format!("connecting to console WebSocket for VM {id}"))
            })?;
        Ok(ConsoleWs {
            stream,
            read_buf: Vec::new(),
        })
    }

    /// `POST /v1/vms/{id}/resources` — apply a partial cgroup resource
    /// patch to a running VM. Only fields set on `patch` are changed.
    pub async fn set_resources(&self, id: Uuid, patch: &ResourcePatch) -> Result<()> {
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/resources"))?),
            )
            .json(patch)
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    /// `GET /v1/vms/{id}/cpuset`
    pub async fn get_cpuset(&self, id: Uuid) -> Result<Vec<u32>> {
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/vms/{id}/cpuset"))?))
            .send()
            .await?;
        #[derive(Deserialize)]
        struct CpusetResponse {
            cpus: Vec<u32>,
        }
        let body: CpusetResponse = Self::parse(resp).await?;
        Ok(body.cpus)
    }

    /// `POST /v1/vms/{id}/freeze` — suspend the VM's cgroup via the v2
    /// freezer (`cgroup.freeze`), independent of guest-level pause/resume.
    pub async fn freeze(&self, id: Uuid) -> Result<()> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/freeze"))?))
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    pub async fn thaw(&self, id: Uuid) -> Result<()> {
        let resp = self
            .authed(self.http.post(self.url(&format!("/v1/vms/{id}/thaw"))?))
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    pub async fn is_frozen(&self, id: Uuid) -> Result<bool> {
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/vms/{id}/frozen"))?))
            .send()
            .await?;
        let body: serde_json::Value = Self::parse(resp).await?;
        Ok(body
            .get("frozen")
            .and_then(|v| v.as_bool())
            .unwrap_or(false))
    }

    /// `GET /v1/vms/{id}/stats` — point-in-time cgroup usage.
    pub async fn stats(&self, id: Uuid) -> Result<VmMetrics> {
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/vms/{id}/stats"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `GET /v1/vms/{id}/pressure` — PSI (cpu/memory/io) for the VM's cgroup.
    pub async fn pressure(&self, id: Uuid) -> Result<VmPressure> {
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/vms/{id}/pressure"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `GET /v1/vms/{id}/logs?lines=N&follow=true` — tail the VM's captured
    /// console output, one line per stream item. `follow` streams
    /// indefinitely (until the caller drops the returned stream), so this
    /// overrides the client's default 30s request timeout in that case.
    pub async fn stream_logs(
        &self,
        id: Uuid,
        lines: u32,
        follow: bool,
    ) -> Result<impl Stream<Item = Result<String>>> {
        let mut url = self.url(&format!("/v1/vms/{id}/logs"))?;
        url.query_pairs_mut()
            .append_pair("lines", &lines.to_string())
            .append_pair("follow", &follow.to_string());

        let mut builder = self.authed(self.http.get(url));
        if follow {
            builder = builder.timeout(std::time::Duration::from_secs(30 * 24 * 3600));
        }
        let resp = builder.send().await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("Ephemera request failed: {status} — {body}");
        }

        let byte_stream = resp
            .bytes_stream()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e));
        let reader = tokio_util::io::StreamReader::new(byte_stream);
        let mut lines_reader = reader.lines();

        Ok(async_stream::stream! {
            loop {
                match lines_reader.next_line().await {
                    Ok(Some(line)) => yield Ok(line),
                    Ok(None) => break,
                    Err(e) => {
                        yield Err(anyhow::anyhow!(e));
                        break;
                    }
                }
            }
        })
    }

    /// `GET /v1/images/catalog`
    pub async fn list_catalog(&self) -> Result<Vec<CatalogEntry>> {
        let resp = self
            .authed(self.http.get(self.url("/v1/images/catalog")?))
            .send()
            .await?;
        let body: CatalogListResponse = Self::parse(resp).await?;
        Ok(body.items)
    }

    /// `POST /v1/images/catalog`
    pub async fn add_catalog_entry(
        &self,
        name: &str,
        source: &str,
        format: &str,
    ) -> Result<CatalogEntry> {
        let req = AddCatalogEntryRequest {
            name: name.to_string(),
            source: source.to_string(),
            format: format.to_string(),
        };
        let resp = self
            .authed(self.http.post(self.url("/v1/images/catalog")?))
            .json(&req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `DELETE /v1/images/catalog/{name}`
    pub async fn remove_catalog_entry(&self, name: &str) -> Result<()> {
        let resp = self
            .authed(
                self.http
                    .delete(self.url(&format!("/v1/images/catalog/{name}"))?),
            )
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    /// `POST /v1/images/catalog/{name}/rename`
    pub async fn rename_catalog_entry(&self, name: &str, new_name: &str) -> Result<CatalogEntry> {
        let req = RenameCatalogEntryRequest {
            new_name: new_name.to_string(),
        };
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/images/catalog/{name}/rename"))?),
            )
            .json(&req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/images/catalog/{name}/clone`
    pub async fn clone_catalog_entry(&self, name: &str, target_name: &str) -> Result<CatalogEntry> {
        let req = CloneCatalogEntryRequest {
            target_name: target_name.to_string(),
        };
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/images/catalog/{name}/clone"))?),
            )
            .json(&req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/images/catalog/{name}/export`
    pub async fn export_catalog_entry(&self, name: &str, path: &std::path::Path) -> Result<()> {
        let req = ExportCatalogEntryRequest {
            path: path.to_path_buf(),
        };
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/images/catalog/{name}/export"))?),
            )
            .json(&req)
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    /// `POST /v1/images/catalog/{name}/read-only`
    pub async fn set_catalog_read_only(&self, name: &str, read_only: bool) -> Result<CatalogEntry> {
        let req = SetCatalogReadOnlyRequest { read_only };
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/images/catalog/{name}/read-only"))?),
            )
            .json(&req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `POST /v1/images/catalog/clean` — returns the filenames removed.
    pub async fn clean_catalog(&self) -> Result<Vec<String>> {
        let resp = self
            .authed(self.http.post(self.url("/v1/images/catalog/clean")?))
            .send()
            .await?;
        let body: CleanCatalogResponse = Self::parse(resp).await?;
        Ok(body.removed)
    }

    /// `POST /v1/pools` — pre-boots `size` VMs from `template`, then pauses
    /// each once ready. Members sit paused (booted, not cold) until
    /// claimed.
    pub async fn create_pool(
        &self,
        name: &str,
        size: usize,
        template: CreateVmRequest,
    ) -> Result<PoolRecord> {
        let req = PoolSpecRequest {
            name: name.to_string(),
            size,
            template,
        };
        let resp = self
            .authed(self.http.post(self.url("/v1/pools")?))
            .json(&req)
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `GET /v1/pools`
    pub async fn list_pools(&self) -> Result<Vec<PoolRecord>> {
        let resp = self
            .authed(self.http.get(self.url("/v1/pools")?))
            .send()
            .await?;
        let body: PoolListResponse = Self::parse(resp).await?;
        Ok(body.items)
    }

    /// `GET /v1/pools/{name}`
    pub async fn get_pool(&self, name: &str) -> Result<PoolRecord> {
        let resp = self
            .authed(self.http.get(self.url(&format!("/v1/pools/{name}"))?))
            .send()
            .await?;
        Self::parse(resp).await
    }

    /// `DELETE /v1/pools/{name}` — also tears down every member VM.
    pub async fn delete_pool(&self, name: &str) -> Result<()> {
        let resp = self
            .authed(self.http.delete(self.url(&format!("/v1/pools/{name}"))?))
            .send()
            .await?;
        Self::expect_no_content(resp).await
    }

    /// `POST /v1/pools/{name}/claim` — resumes one ready (already-booted,
    /// paused) member, applies `overrides`, and triggers a backfill to
    /// replace it. Fails if the pool has no ready member right now rather
    /// than falling back to a slow cold create.
    pub async fn claim_pool(&self, name: &str, overrides: ClaimOverrides) -> Result<VmRecord> {
        let resp = self
            .authed(
                self.http
                    .post(self.url(&format!("/v1/pools/{name}/claim"))?),
            )
            .json(&overrides)
            .send()
            .await?;
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
        let bytes = resp
            .bytes()
            .await
            .context("failed to read Ephemera response body")?;
        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes);
            bail!("Ephemera request failed: {status} — {body}");
        }
        serde_json::from_slice(&bytes)
            .with_context(|| format!("failed to parse Ephemera response ({status})"))
    }
}

/// A live console WebSocket, adapted to plain `AsyncRead`/`AsyncWrite` —
/// callers (e.g. `zyvor-fabricd`'s own browser-facing console WebSocket)
/// just read/write raw bytes; the WS binary-frame boundary underneath is
/// invisible on this side, matching Ephemera's own console protocol (see
/// `ephemera_api::relay_console`'s doc comment on the other end of this
/// connection).
pub struct ConsoleWs {
    stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    read_buf: Vec<u8>,
}

impl tokio::io::AsyncRead for ConsoleWs {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        use futures::StreamExt;
        loop {
            if !self.read_buf.is_empty() {
                let n = std::cmp::min(self.read_buf.len(), buf.remaining());
                buf.put_slice(&self.read_buf[..n]);
                self.read_buf.drain(..n);
                return std::task::Poll::Ready(Ok(()));
            }
            match std::task::ready!(self.stream.poll_next_unpin(cx)) {
                Some(Ok(tokio_tungstenite::tungstenite::Message::Binary(data))) => {
                    self.read_buf = data.into();
                }
                Some(Ok(tokio_tungstenite::tungstenite::Message::Text(t))) => {
                    self.read_buf = t.as_bytes().to_vec();
                }
                Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => {
                    return std::task::Poll::Ready(Ok(()));
                }
                Some(Ok(_)) => continue, // ping/pong/frame — not payload data
                Some(Err(e)) => return std::task::Poll::Ready(Err(std::io::Error::other(e))),
            }
        }
    }
}

impl tokio::io::AsyncWrite for ConsoleWs {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        use futures::SinkExt;
        if let Err(e) = std::task::ready!(self.stream.poll_ready_unpin(cx)) {
            return std::task::Poll::Ready(Err(std::io::Error::other(e)));
        }
        if let Err(e) =
            self.stream
                .start_send_unpin(tokio_tungstenite::tungstenite::Message::Binary(
                    buf.to_vec().into(),
                ))
        {
            return std::task::Poll::Ready(Err(std::io::Error::other(e)));
        }
        // `start_send` only queues the frame in the WS sink; nothing puts
        // it on the wire until a flush. Callers that just call
        // `write_all` — the normal, expected-to-be-sufficient pattern for
        // any other AsyncWrite (a socket, a file) — would otherwise have
        // their bytes sit queued forever with no error and no visible
        // symptom until the connection eventually tears down. Best-effort
        // opportunistic flush here (ignoring `Pending`/errors, which the
        // caller's own next real write/flush/drop will surface) matches
        // the semantics callers actually expect.
        let _ = self.stream.poll_flush_unpin(cx);
        std::task::Poll::Ready(Ok(buf.len()))
    }
    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        use futures::SinkExt;
        self.stream
            .poll_flush_unpin(cx)
            .map_err(std::io::Error::other)
    }
    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        use futures::SinkExt;
        self.stream
            .poll_close_unpin(cx)
            .map_err(std::io::Error::other)
    }
}
