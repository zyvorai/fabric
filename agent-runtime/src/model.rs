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
    /// What happens to a request for a host outside `egress_allow_hosts`:
    /// `deny` (default) refuses it; `ask` holds it while an operator decides.
    #[serde(default, skip_serializing_if = "EgressMode::is_deny")]
    pub egress_mode: EgressMode,
    /// How long an `ask` request waits for a decision before it is refused.
    /// `None` uses [`DEFAULT_EGRESS_APPROVAL_SECONDS`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub egress_approval_timeout_seconds: Option<u64>,
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
    /// Guest program for this immutable version. `node` runs the JavaScript
    /// worker. `claude`, `codex`, and `gemini` run that CLI from the FluxVM
    /// template via the harness adapter. The choice cannot change without a
    /// new version.
    #[serde(default)]
    pub runtime: AgentRuntimeKind,
}

pub const DEFAULT_EGRESS_APPROVAL_SECONDS: u64 = 90;
pub const MIN_EGRESS_APPROVAL_SECONDS: u64 = 5;
/// Kept under the guest fetch client's own header timeout so the agent sees a
/// clean refusal from the broker rather than a client-side timeout.
pub const MAX_EGRESS_APPROVAL_SECONDS: u64 = 240;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum EgressMode {
    #[default]
    Deny,
    Ask,
}

impl EgressMode {
    pub fn is_deny(&self) -> bool {
        *self == Self::Deny
    }
}

/// What the sandbox executes. Harness runtimes share one adapter and differ
/// only by which template CLI it spawns.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum AgentRuntimeKind {
    #[default]
    Node,
    Claude,
    Codex,
    Gemini,
}

impl AgentRuntimeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Node => "node",
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
        }
    }

    pub fn is_harness(self) -> bool {
        !matches!(self, Self::Node)
    }
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
    /// When set, this session was started on behalf of another session. The
    /// child still uses its own egress allowlist and credential grants.
    #[serde(default)]
    pub parent_session_id: Option<Uuid>,
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
    #[serde(default)]
    pub parent_session_id: Option<Uuid>,
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
    pub parent_session_id: Option<Uuid>,
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
            parent_session_id: v.parent_session_id,
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

/// Stop conditions for a cron schedule, a signed webhook, or a loop.
/// A loop must set at least one. Schedules and webhooks may leave them unset.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LoopBounds {
    #[serde(default)]
    pub max_runs: Option<u32>,
    #[serde(default)]
    pub max_duration_secs: Option<u64>,
    #[serde(default)]
    pub max_cost: Option<f64>,
    /// Stop after this many consecutive runs that make no progress.
    #[serde(default)]
    pub max_no_progress: Option<u32>,
}

impl LoopBounds {
    pub fn is_bounded(&self) -> bool {
        self.max_runs.is_some()
            || self.max_duration_secs.is_some()
            || self.max_cost.is_some()
            || self.max_no_progress.is_some()
    }

    pub fn stop_reason(
        &self,
        runs: u32,
        elapsed_secs: u64,
        cost: f64,
        no_progress: u32,
    ) -> Option<&'static str> {
        if self.max_runs.is_some_and(|max| runs >= max) {
            return Some("max_runs");
        }
        if self
            .max_duration_secs
            .is_some_and(|max| elapsed_secs >= max)
        {
            return Some("max_duration");
        }
        if self.max_cost.is_some_and(|max| cost >= max) {
            return Some("max_cost");
        }
        if self.max_no_progress.is_some_and(|max| no_progress >= max) {
            return Some("no_progress");
        }
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleRecord {
    pub id: Uuid,
    pub agent: String,
    /// Five-field UTC cron: minute hour day month weekday.
    pub cron: String,
    pub input: Value,
    #[serde(default)]
    pub bounds: LoopBounds,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: DateTime<Utc>,
    pub next_run_at: DateTime<Utc>,
    #[serde(default)]
    pub runs: u32,
    #[serde(default)]
    pub consecutive_no_progress: u32,
    #[serde(default)]
    pub accumulated_cost: f64,
    #[serde(default)]
    pub active_session_id: Option<Uuid>,
    #[serde(default)]
    pub accounted_session_id: Option<Uuid>,
    #[serde(default)]
    pub last_result: Option<Value>,
    #[serde(default)]
    pub stopped_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateScheduleRequest {
    pub agent: String,
    pub cron: String,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub bounds: LoopBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookRecord {
    pub id: Uuid,
    pub agent: String,
    /// HMAC-SHA256 secret. Serialized so it survives restart, but list
    /// responses use [`WebhookView`], which omits it.
    pub secret: String,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub bounds: LoopBounds,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub runs: u32,
    #[serde(default)]
    pub stopped_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebhookView {
    pub id: Uuid,
    pub agent: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub runs: u32,
    pub bounds: LoopBounds,
    pub stopped_reason: Option<String>,
}

impl From<&WebhookRecord> for WebhookView {
    fn from(v: &WebhookRecord) -> Self {
        Self {
            id: v.id,
            agent: v.agent.clone(),
            enabled: v.enabled,
            created_at: v.created_at,
            runs: v.runs,
            bounds: v.bounds.clone(),
            stopped_reason: v.stopped_reason.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWebhookRequest {
    pub agent: String,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub bounds: LoopBounds,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateWebhookResponse {
    #[serde(flatten)]
    pub webhook: WebhookView,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopRecord {
    pub id: Uuid,
    pub agent: String,
    pub input: Value,
    pub bounds: LoopBounds,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub started_at: DateTime<Utc>,
    #[serde(default)]
    pub runs: u32,
    #[serde(default)]
    pub consecutive_no_progress: u32,
    #[serde(default)]
    pub accumulated_cost: f64,
    #[serde(default)]
    pub active_session_id: Option<Uuid>,
    #[serde(default)]
    pub accounted_session_id: Option<Uuid>,
    #[serde(default)]
    pub last_result: Option<Value>,
    #[serde(default)]
    pub stopped_reason: Option<String>,
    #[serde(default)]
    pub next_attempt_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateLoopRequest {
    pub agent: String,
    #[serde(default)]
    pub input: Value,
    pub bounds: LoopBounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Denied,
    /// Nobody decided in time (or the session ended first); can no longer be decided.
    Expired,
}

/// How long an approved egress approval keeps applying.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum GrantScope {
    /// Only the requests that were waiting when the decision was made.
    #[default]
    Once,
    /// Every later request to the same host in this session.
    Session,
}

/// What a human is being asked to approve. `Custom` is the coding-harness
/// `ZYVOR_APPROVAL` flow and the default for records written before kinds existed.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalKind {
    #[default]
    Custom,
    Egress,
    Purchase,
    Send,
}

impl ApprovalKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Custom => "custom",
            Self::Egress => "egress",
            Self::Purchase => "purchase",
            Self::Send => "send",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    #[serde(default)]
    pub kind: ApprovalKind,
    /// Short machine-readable target, e.g. a destination host or recipient.
    #[serde(default)]
    pub subject: Option<String>,
    /// Structured description of the action that will run if approved.
    #[serde(default)]
    pub planned_action: Option<Value>,
    pub prompt: String,
    pub status: ApprovalStatus,
    #[serde(default)]
    pub comment: Option<String>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub decided_at: Option<DateTime<Utc>>,
    /// Guest event sequence that opened this request, when it came from the sandbox.
    #[serde(default)]
    pub source_seq: Option<u64>,
    /// Set when an egress approval is approved.
    #[serde(default)]
    pub grant_scope: Option<GrantScope>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateApprovalRequest {
    pub session_id: Uuid,
    pub prompt: String,
    #[serde(default)]
    pub kind: ApprovalKind,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub planned_action: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DecideApprovalRequest {
    pub decision: ApprovalStatus,
    /// For egress approvals: `once` (default) or `session`. Ignored otherwise.
    #[serde(default)]
    pub scope: Option<GrantScope>,
    #[serde(default)]
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DelegateRequest {
    pub agent: String,
    #[serde(default)]
    pub input: Value,
}
