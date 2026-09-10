// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentManifest {
    /// FluxVM sandbox template name. The template must include Node.js 20+ and
    /// tap+netns networking so Fabric can reach the worker and the worker can
    /// reach the host egress broker through its default gateway.
    pub template: String,
    #[serde(default)]
    pub credentials: Vec<String>,
    #[serde(default)]
    pub egress_allow_hosts: Vec<String>,
    /// Permit brokered requests to loopback/private/link-local destinations. Off by default
    /// to prevent cloud metadata and internal-network SSRF from untrusted agents.
    #[serde(default)]
    pub allow_private_networks: bool,
    #[serde(default = "default_runtime_port")]
    pub runtime_port: u16,
    #[serde(default)]
    pub ttl_seconds: Option<u64>,
    /// Maximum number of non-terminal sessions for this agent deployment.
    /// `None` keeps the runtime-wide default behavior.
    #[serde(default)]
    pub max_concurrent_sessions: Option<usize>,
    /// When set, the runtime may hibernate a session that has been waiting for
    /// steering input without activity for this many seconds.
    #[serde(default)]
    pub idle_hibernate_seconds: Option<u64>,
    /// Number of clean, paused FluxVM sandboxes to keep prewarmed for this
    /// immutable agent version. Sandboxes are single-use and never recycled.
    #[serde(default)]
    pub warm_pool_size: usize,
}

fn default_runtime_port() -> u16 {
    8080
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployAgentRequest {
    pub name: String,
    pub bundle_base64: String,
    pub manifest: AgentManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
    pub name: String,
    pub version: String,
    pub digest_sha256: String,
    pub manifest: AgentManifest,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SessionStartPolicy {
    /// Use a prewarmed sandbox when one is ready, otherwise cold-create.
    #[default]
    PreferWarm,
    /// Fail admission instead of cold-starting when no warm sandbox is ready.
    RequireWarm,
    /// Bypass the warm pool. Useful for isolation/debug comparisons.
    ColdOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub agent: String,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub ttl_seconds: Option<u64>,
    /// Optional caller-generated idempotency key. Reusing the same key for the
    /// same agent returns the original session instead of creating a second VM.
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub start_policy: SessionStartPolicy,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SessionStatus {
    Creating,
    Running,
    Hibernating,
    Hibernated,
    Completed,
    Failed,
    Cancelled,
    Expired,
}

impl SessionStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled | Self::Expired
        )
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum SessionStartMode {
    #[default]
    Cold,
    Warm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: Uuid,
    pub agent: String,
    pub agent_version: String,
    pub sandbox_id: Uuid,
    pub status: SessionStatus,
    pub input: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_event_seq: u64,
    pub guest_event_cursor: u64,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub start_policy: SessionStartPolicy,
    /// Whether the sandbox came from the prewarmed pool or a cold FluxVM create.
    #[serde(default)]
    pub start_mode: SessionStartMode,
    /// Wall-clock time from API admission to guest worker readiness/run dispatch.
    #[serde(default)]
    pub startup_ms: Option<u64>,
    /// Runtime-owned TTL deadline. This keeps TTL semantics correct for warm
    /// sandboxes whose FluxVM VM existed before the session was admitted.
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
    /// True after Fabric has confirmed the single-use FluxVM sandbox is gone.
    #[serde(default)]
    pub sandbox_released: bool,
    /// Capability token accepted only by the host-side egress broker for this
    /// exact session. It is never returned by the public API.
    pub capability_token: String,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionView {
    pub id: Uuid,
    pub agent: String,
    pub agent_version: String,
    pub sandbox_id: Uuid,
    pub status: SessionStatus,
    pub input: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_event_seq: u64,
    pub request_id: Option<String>,
    pub start_policy: SessionStartPolicy,
    pub start_mode: SessionStartMode,
    pub startup_ms: Option<u64>,
    pub expires_at: Option<DateTime<Utc>>,
    pub sandbox_released: bool,
    pub error: Option<String>,
}

impl From<SessionRecord> for SessionView {
    fn from(v: SessionRecord) -> Self {
        Self {
            id: v.id,
            agent: v.agent,
            agent_version: v.agent_version,
            sandbox_id: v.sandbox_id,
            status: v.status,
            input: v.input,
            created_at: v.created_at,
            updated_at: v.updated_at,
            last_event_seq: v.last_event_seq,
            request_id: v.request_id,
            start_policy: v.start_policy,
            start_mode: v.start_mode,
            startup_ms: v.startup_ms,
            expires_at: v.expires_at,
            sandbox_released: v.sandbox_released,
            error: v.error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEvent {
    pub session_id: Uuid,
    pub seq: u64,
    pub kind: String,
    pub data: Value,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestEvent {
    pub seq: u64,
    pub kind: String,
    #[serde(default)]
    pub data: Value,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestEventsResponse {
    #[serde(default)]
    pub items: Vec<GuestEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestStatusResponse {
    pub status: String,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteerRequest {
    pub message: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventsQuery {
    #[serde(default)]
    pub after: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WarmSandboxState {
    Ready,
    Reconciling,
    Claiming,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarmSandboxRecord {
    pub sandbox_id: Uuid,
    pub agent: String,
    pub agent_version: String,
    pub runtime_port: u16,
    pub worker_digest_sha256: String,
    pub state: WarmSandboxState,
    #[serde(default)]
    pub claimed_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WarmPoolView {
    pub agent: String,
    pub agent_version: String,
    pub desired: usize,
    pub ready: usize,
    pub reconciling: usize,
    pub claiming: usize,
    pub sandboxes: Vec<WarmSandboxRecord>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct WarmPoolReconcileResult {
    pub created: usize,
    pub removed: usize,
    pub repaired: usize,
    pub ready: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EgressRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body_base64: Option<String>,
    #[serde(default)]
    pub credential: Option<String>,
}

fn default_method() -> String {
    "GET".to_string()
}
