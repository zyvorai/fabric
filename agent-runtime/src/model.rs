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
    /// Skills mounted into the sandbox, as `name` or `name@version`. Deploy
    /// rewrites each to an exact `name@version` pin.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<String>,
    /// Which scoped skills this agent may mount, per the operator's scope policy.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skill_scope: Option<String>,
    /// Persistent directory mounted in the sandbox so state survives sandbox
    /// replacement. Needs a QEMU-backed FluxVM template; see [`HomeVolume`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_volume: Option<HomeVolume>,
    /// Per-host limits on brokered requests: methods, path prefixes, body size.
    /// A host with any rule needs a matching one; hosts without rules are unrestricted.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub egress_rules: Vec<EgressRule>,
    /// Hold a brokered request that carries a secret-shaped string (a key, a
    /// token, a private key) for an operator's decision.
    #[serde(default, skip_serializing_if = "is_false")]
    pub dlp: bool,
    /// Taint the session when it reads content from a host outside `trusted_hosts`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub taint: Option<TaintPolicy>,
    /// Chromium's remote-debugging port inside the guest. Lets an operator list
    /// the agent's open tabs (read-only). See [`crate::browser`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_port: Option<u16>,
    /// Allow operator-declared always-on workstations for this agent. See
    /// [`crate::workstations`].
    #[serde(default, skip_serializing_if = "is_false")]
    pub persistent: bool,
    /// `strict` runs the worker unprivileged in a bubblewrap container.
    #[serde(default, skip_serializing_if = "InnerContainer::is_off")]
    pub inner_container: InnerContainer,
    /// Run in a hardware-encrypted VM when the host can (`auto`), or only then
    /// (`required`). Not a substitute for key custody: see the design spec.
    #[serde(default, skip_serializing_if = "Confidential::is_off")]
    pub confidential: Confidential,
    /// `strict` drops all sandbox traffic except to the egress broker and proxy.
    #[serde(default, skip_serializing_if = "Confinement::is_off")]
    pub confinement: Confinement,
    /// Size of each sandbox. `None` uses the FluxVM template's own size.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resources: Option<Resources>,
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
    /// Bring-your-own model socket (Keep). The cell does not care which brain
    /// answers; only this endpoint config changes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_socket: Option<ModelSocket>,
    /// Prefer Firecracker/FluxVM microVM for the agent cell when the template
    /// supports it. Documented Keep 0.1 target; bubblewrap remains interim.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell_backend: Option<CellBackend>,
}

/// Where the agent talks to an LLM. Swap Grok / local GGUF / vLLM / Muse-class
/// APIs without rebuilding the cell.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelSocket {
    /// OpenAI-compatible base URL, e.g. `https://api.x.ai/v1` or `http://127.0.0.1:8080/v1`.
    pub base_url: String,
    /// Model id the provider expects.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Vault credential name that holds the API key (surrogate at egress).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credential: Option<String>,
}

/// Preferred isolation for the untrusted agent cell.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum CellBackend {
    #[default]
    Template,
    Firecracker,
    Qemu,
}

/// A named FluxVM volume mounted into the agent's sandbox. The volume outlives
/// the sandbox and every session, and can be attached to one sandbox at a time.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HomeVolume {
    /// FluxVM volume name (`[a-z0-9._-]`, up to 63). Defaults to the lowercased
    /// agent name, so a new version of the same agent keeps its data.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default = "default_home_path")]
    pub guest_path: String,
    /// Give every user their own volume (`<name>-<user_id>`). Sessions must then
    /// carry a `user_id`, and the one-at-a-time attach rule applies per user, so
    /// one deployed agent can serve many users.
    #[serde(default, skip_serializing_if = "is_false")]
    pub per_user: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

/// Sandbox size. FluxVM enforces both fields and applies the template's own
/// `max_vcpus`/`max_memory_mib` as a ceiling.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Resources {
    pub vcpus: u8,
    pub memory_mib: u64,
}

pub const MIN_SANDBOX_MEMORY_MIB: u64 = 128;
pub const MAX_USER_ID_CHARS: usize = 32;

/// A user id becomes part of a volume name, so it is held to the same
/// character set: lowercase letters, digits, `.`, `_`, `-`.
pub fn validate_user_id(user_id: &str) -> Result<(), String> {
    if user_id.is_empty() || user_id.len() > MAX_USER_ID_CHARS || !valid_volume_name(user_id) {
        return Err(format!(
            "user_id must be 1-{MAX_USER_ID_CHARS} characters from [a-z0-9._-], starting with a letter or digit"
        ));
    }
    Ok(())
}

fn default_home_path() -> String {
    "/home/agent".into()
}

/// The FluxVM volume name rule, checked here so a bad manifest fails at deploy
/// rather than on the first session.
fn valid_volume_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && name.len() <= 63
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

impl AgentManifest {
    /// The volume name this manifest resolves to for `agent`, if it has a home volume.
    pub fn home_volume_name(&self, agent: &str) -> Option<String> {
        self.home_volume
            .as_ref()
            .map(|v| v.name.clone().unwrap_or_else(|| agent.to_ascii_lowercase()))
    }

    /// The volume for one session: the base name, plus `-<user_id>` when the
    /// volume is per user.
    pub fn home_volume_for(&self, agent: &str, user_id: Option<&str>) -> Option<String> {
        let base = self.home_volume_name(agent)?;
        match (self.home_volume.as_ref()?.per_user, user_id) {
            (true, Some(user)) => Some(format!("{base}-{user}")),
            _ => Some(base),
        }
    }

    /// Deploy-time checks for `egress_rules` and `taint`.
    pub fn validate_egress_policy(&self) -> Result<(), String> {
        for rule in &self.egress_rules {
            if rule.host.trim().is_empty() {
                return Err("egress_rules host may not be empty".into());
            }
            for method in &rule.methods {
                if method.is_empty() || !method.chars().all(|c| c.is_ascii_alphabetic()) {
                    return Err(format!("egress_rules has invalid method {method:?}"));
                }
            }
            if rule.path_prefixes.iter().any(|p| !p.starts_with('/')) {
                return Err("egress_rules path_prefixes must start with '/'".into());
            }
            if rule.max_body_bytes == Some(0) {
                return Err("egress_rules max_body_bytes must be greater than zero".into());
            }
        }
        if let Some(taint) = &self.taint {
            if taint.trusted_hosts.iter().any(|h| h.trim().is_empty()) {
                return Err("taint.trusted_hosts may not contain an empty host".into());
            }
        }
        Ok(())
    }

    /// Deploy-time checks for `confidential`. Guest memory must not be copied out
    /// by a snapshot, and every sandbox must be launched for its own session.
    pub fn validate_confidential(&self) -> Result<(), String> {
        if self.confidential.is_off() {
            return Ok(());
        }
        if self.warm_pool_size > 0 {
            return Err("confidential cannot be combined with warm_pool_size: warm sandboxes are launched before a session owns them".into());
        }
        if self.idle_hibernate_seconds.is_some() {
            return Err("confidential cannot be combined with idle_hibernate_seconds: a snapshot copies guest memory out of the enclave".into());
        }
        if self.confidential == Confidential::Required && self.home_volume.is_some() {
            return Err("confidential: required cannot be combined with home_volume: a virtiofs share is readable by the host".into());
        }
        Ok(())
    }

    /// Deploy-time checks for `resources` against the operator's ceilings.
    pub fn validate_resources(
        &self,
        max_vcpus: Option<u8>,
        max_memory_mib: Option<u64>,
    ) -> Result<(), String> {
        let Some(r) = &self.resources else {
            return Ok(());
        };
        if r.vcpus == 0 {
            return Err("resources.vcpus must be at least 1".into());
        }
        if r.memory_mib < MIN_SANDBOX_MEMORY_MIB {
            return Err(format!(
                "resources.memory_mib must be at least {MIN_SANDBOX_MEMORY_MIB}"
            ));
        }
        if let Some(max) = max_vcpus.filter(|max| r.vcpus > *max) {
            return Err(format!(
                "resources.vcpus {} exceeds this runtime's limit of {max}",
                r.vcpus
            ));
        }
        if let Some(max) = max_memory_mib.filter(|max| r.memory_mib > *max) {
            return Err(format!(
                "resources.memory_mib {} exceeds this runtime's limit of {max}",
                r.memory_mib
            ));
        }
        Ok(())
    }

    /// Deploy-time checks for `home_volume`. FluxVM re-validates everything;
    /// these catch mistakes early and reject combinations that cannot work.
    pub fn validate_home_volume(&self, agent: &str) -> Result<(), String> {
        let Some(volume) = &self.home_volume else {
            return Ok(());
        };
        let name = self.home_volume_name(agent).unwrap_or_default();
        if !valid_volume_name(&name) {
            return Err(format!(
                "home_volume name {name:?} is not a valid FluxVM volume name ([a-z0-9._-], up to 63); set home_volume.name"
            ));
        }
        let path = &volume.guest_path;
        if !path.starts_with('/')
            || path.len() > 128
            || !path
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '.' | '-'))
        {
            return Err(format!(
                "home_volume.guest_path {path:?} is not a valid absolute path"
            ));
        }
        // A volume is attached to one sandbox at a time and is bound when the
        // sandbox is created, so these settings cannot work alongside it.
        if volume.per_user {
            // Room for `-<user_id>` under the 63-character volume name limit.
            if name.len() + 1 + MAX_USER_ID_CHARS > 63 {
                return Err(format!(
                    "per-user home_volume name {name:?} is too long: at most {} characters",
                    63 - 1 - MAX_USER_ID_CHARS
                ));
            }
        } else if self.max_concurrent_sessions != Some(1) {
            return Err("home_volume requires max_concurrent_sessions to be 1: the volume can be attached to one sandbox at a time".into());
        }
        if self.warm_pool_size > 0 {
            return Err("home_volume cannot be combined with warm_pool_size: warm sandboxes are created before a session owns the volume".into());
        }
        if self.idle_hibernate_seconds.is_some() {
            return Err("home_volume cannot be combined with idle_hibernate_seconds: volume-backed (QEMU) sandboxes cannot be snapshotted".into());
        }
        Ok(())
    }
}

pub const DEFAULT_EGRESS_APPROVAL_SECONDS: u64 = 90;
pub const MIN_EGRESS_APPROVAL_SECONDS: u64 = 5;
/// Kept under the guest fetch client's own header timeout so the agent sees a
/// clean refusal from the broker rather than a client-side timeout.
pub const MAX_EGRESS_APPROVAL_SECONDS: u64 = 240;

/// A limit on what the agent may send to a host. See [`crate::l7::check_rules`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EgressRule {
    /// Exact host or parent suffix, as in `egress_allow_hosts`.
    pub host: String,
    /// Allowed methods. Empty means any.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub methods: Vec<String>,
    /// Allowed path prefixes. Empty means any.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub path_prefixes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_body_bytes: Option<u64>,
}

/// Which hosts do not taint a session that reads from them.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaintPolicy {
    #[serde(default)]
    pub trusted_hosts: Vec<String>,
}

/// Run the worker as an unprivileged user in a bubblewrap container inside the
/// sandbox. The template needs `bubblewrap` and `util-linux`; launching fails
/// closed if they are missing.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum InnerContainer {
    #[default]
    Off,
    Strict,
}

impl InnerContainer {
    pub fn is_off(&self) -> bool {
        *self == Self::Off
    }
}

/// Whether the sandbox should run as a hardware-encrypted confidential VM.
/// `auto` uses one when the host has the hardware and otherwise runs a normal
/// VM (the outcome is recorded on the session); `required` refuses to run
/// without one.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Confidential {
    #[default]
    Off,
    Auto,
    Required,
}

impl Confidential {
    pub fn is_off(&self) -> bool {
        *self == Self::Off
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Auto => "auto",
            Self::Required => "required",
        }
    }
}

/// What FluxVM reports about a sandbox's confidential launch.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConfidentialStatus {
    pub active: bool,
    #[serde(default)]
    pub tech: Option<String>,
    #[serde(default)]
    pub reason: String,
}

/// Whether the sandbox network is confined to the broker and proxy.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Confinement {
    #[default]
    Off,
    Strict,
}

impl Confinement {
    pub fn is_off(&self) -> bool {
        *self == Self::Off
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum EgressMode {
    #[default]
    Deny,
    Ask,
    /// Like `ask`, but a reviewer model screens the request first and may
    /// deny it (or, if the operator allows, let it through once).
    Sentinel,
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
    /// The user this session runs for. Required when the agent's home volume is
    /// per user. The caller (an operator-authenticated API client) asserts it.
    #[serde(default)]
    pub user_id: Option<String>,
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
    #[serde(default)]
    pub user_id: Option<String>,
    /// Untrusted hosts this session has read from. Non-empty means tainted; see
    /// [`TaintPolicy`]. Cleared only by an operator.
    #[serde(default)]
    pub tainted_by: Vec<String>,
    /// How the sandbox was launched, when the agent asked for `confidential`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidential: Option<ConfidentialStatus>,
}

/// A promise that a user's agent VM stays up: the runtime keeps a session
/// running for it, restarting with backoff. See [`crate::workstations`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkstationRecord {
    pub id: Uuid,
    pub agent: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub active_session_id: Option<Uuid>,
    /// Sessions started for this workstation so far.
    #[serde(default)]
    pub restarts: u32,
    #[serde(default)]
    pub consecutive_failures: u32,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub next_attempt_at: Option<DateTime<Utc>>,
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
    pub user_id: Option<String>,
    pub tainted_by: Vec<String>,
    pub confidential: Option<ConfidentialStatus>,
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
            user_id: v.user_id,
            tainted_by: v.tainted_by,
            confidential: v.confidential,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateScheduleRequest {
    pub agent: String,
    pub cron: String,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub bounds: LoopBounds,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateLoopRequest {
    pub agent: String,
    #[serde(default)]
    pub input: Value,
    pub bounds: LoopBounds,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
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
    /// True when the egress broker is holding a request for this decision. No
    /// agent is waiting for steering, so deciding it must not steer the session.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub broker_held: bool,
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

#[cfg(test)]
mod home_volume_tests {
    use super::*;

    fn manifest(home: Option<HomeVolume>) -> AgentManifest {
        AgentManifest {
            egress_rules: vec![],
            dlp: false,
            taint: None,
            confinement: Default::default(),
            resources: None,
            confidential: Default::default(),
            inner_container: Default::default(),
            persistent: false,
            browser_port: None,
            template: "qemu-node".into(),
            credentials: vec![],
            egress_allow_hosts: vec![],
            allow_private_networks: false,
            runtime_port: 8080,
            ttl_seconds: None,
            max_concurrent_sessions: Some(1),
            idle_hibernate_seconds: None,
            warm_pool_size: 0,
            runtime: Default::default(),
            egress_mode: Default::default(),
            home_volume: home,
            skills: vec![],
            skill_scope: None,
            egress_approval_timeout_seconds: None,
            model_socket: None,
            cell_backend: None,
        }
    }

    fn home(name: Option<&str>, path: &str) -> Option<HomeVolume> {
        Some(HomeVolume {
            name: name.map(str::to_string),
            guest_path: path.into(),
            per_user: false,
        })
    }

    #[test]
    fn no_home_volume_is_always_valid_and_serializes_unchanged() {
        assert!(manifest(None).validate_home_volume("Any-Name").is_ok());
        // Version ids hash the serialized manifest; an absent home volume must add nothing.
        let value = serde_json::to_value(manifest(None)).unwrap();
        assert!(value.get("home_volume").is_none());
    }

    #[test]
    fn volume_name_defaults_to_the_lowercased_agent_name() {
        let m = manifest(home(None, "/home/agent"));
        assert_eq!(
            m.home_volume_name("Research-Bot").as_deref(),
            Some("research-bot")
        );
        assert!(m.validate_home_volume("Research-Bot").is_ok());
        let named = manifest(home(Some("shared-home"), "/home/agent"));
        assert_eq!(named.home_volume_name("x").as_deref(), Some("shared-home"));
        assert_eq!(manifest(None).home_volume_name("x"), None);
    }

    #[test]
    fn an_agent_name_that_is_not_a_valid_volume_name_needs_an_explicit_one() {
        // Agent names may contain uppercase-insensitive characters but also
        // leading '_' or '.', which FluxVM volume names do not allow.
        let m = manifest(home(None, "/home/agent"));
        assert!(m.validate_home_volume("_hidden").is_err());
        let fixed = manifest(home(Some("hidden"), "/home/agent"));
        assert!(fixed.validate_home_volume("_hidden").is_ok());
    }

    #[test]
    fn rejects_bad_paths_and_incompatible_settings() {
        assert!(manifest(home(None, "home/agent"))
            .validate_home_volume("a")
            .is_err());
        assert!(manifest(home(None, "/home/a b"))
            .validate_home_volume("a")
            .is_err());
        assert!(manifest(home(None, "/home/a;x"))
            .validate_home_volume("a")
            .is_err());

        let mut m = manifest(home(None, "/home/agent"));
        m.max_concurrent_sessions = None;
        assert!(m
            .validate_home_volume("a")
            .unwrap_err()
            .contains("max_concurrent_sessions"));
        let mut m = manifest(home(None, "/home/agent"));
        m.max_concurrent_sessions = Some(2);
        assert!(m.validate_home_volume("a").is_err());
        let mut m = manifest(home(None, "/home/agent"));
        m.warm_pool_size = 1;
        assert!(m
            .validate_home_volume("a")
            .unwrap_err()
            .contains("warm_pool_size"));
        let mut m = manifest(home(None, "/home/agent"));
        m.idle_hibernate_seconds = Some(60);
        assert!(m
            .validate_home_volume("a")
            .unwrap_err()
            .contains("hibernate"));
    }

    fn per_user() -> Option<HomeVolume> {
        Some(HomeVolume {
            name: Some("home".into()),
            guest_path: "/home/agent".into(),
            per_user: true,
        })
    }

    #[test]
    fn per_user_volume_is_named_per_user_and_drops_the_single_session_rule() {
        let mut m = manifest(per_user());
        m.max_concurrent_sessions = None;
        assert!(m.validate_home_volume("a").is_ok());
        assert_eq!(
            m.home_volume_for("a", Some("alice")).as_deref(),
            Some("home-alice")
        );
        assert_eq!(
            m.home_volume_for("a", Some("bob")).as_deref(),
            Some("home-bob")
        );
        // A shared volume ignores the user.
        let shared = manifest(home(Some("home"), "/home/agent"));
        assert_eq!(
            shared.home_volume_for("a", Some("alice")).as_deref(),
            Some("home")
        );
        // A per-user volume still cannot use warm pools or hibernation.
        m.warm_pool_size = 1;
        assert!(m.validate_home_volume("a").is_err());
    }

    #[test]
    fn per_user_volume_name_must_leave_room_for_the_user() {
        let long = "x".repeat(40);
        let m = manifest(Some(HomeVolume {
            name: Some(long),
            guest_path: "/home/agent".into(),
            per_user: true,
        }));
        assert!(m
            .validate_home_volume("a")
            .unwrap_err()
            .contains("too long"));
    }

    #[test]
    fn per_user_flag_is_omitted_when_off_and_kept_when_on() {
        let off = serde_json::to_value(manifest(home(None, "/home/agent"))).unwrap();
        assert!(off["home_volume"].get("per_user").is_none());
        let on = serde_json::to_value(manifest(per_user())).unwrap();
        assert_eq!(on["home_volume"]["per_user"], true);
    }

    #[test]
    fn user_ids_follow_the_volume_name_rules() {
        assert!(validate_user_id("alice-01").is_ok());
        assert!(validate_user_id("a.b_c").is_ok());
        for bad in ["", "Alice", "a b", "../x", "a/b", "-x", &"x".repeat(33)] {
            assert!(validate_user_id(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn resources_are_checked_against_operator_ceilings() {
        let mut m = manifest(None);
        assert!(m.validate_resources(Some(1), Some(1)).is_ok());
        m.resources = Some(Resources {
            vcpus: 2,
            memory_mib: 7900,
        });
        assert!(m.validate_resources(None, None).is_ok());
        assert!(m.validate_resources(Some(2), Some(8192)).is_ok());
        assert!(m.validate_resources(Some(1), None).is_err());
        assert!(m.validate_resources(None, Some(4096)).is_err());
        m.resources = Some(Resources {
            vcpus: 0,
            memory_mib: 7900,
        });
        assert!(m.validate_resources(None, None).is_err());
        m.resources = Some(Resources {
            vcpus: 1,
            memory_mib: 64,
        });
        assert!(m.validate_resources(None, None).is_err());
    }

    #[test]
    fn manifest_without_resources_serializes_unchanged() {
        let value = serde_json::to_value(manifest(None)).unwrap();
        assert!(value.get("resources").is_none());
        let sized = AgentManifest {
            resources: Some(Resources {
                vcpus: 2,
                memory_mib: 7900,
            }),
            ..manifest(None)
        };
        assert_eq!(
            serde_json::to_value(sized).unwrap()["resources"]["vcpus"],
            2
        );
    }

    #[test]
    fn confinement_is_omitted_when_off_and_kebab_case_when_strict() {
        let off = serde_json::to_value(manifest(None)).unwrap();
        assert!(off.get("confinement").is_none());
        let strict = AgentManifest {
            confinement: Confinement::Strict,
            ..manifest(None)
        };
        assert_eq!(
            serde_json::to_value(strict).unwrap()["confinement"],
            "strict"
        );
        let parsed: Confinement = serde_json::from_str("\"strict\"").unwrap();
        assert_eq!(parsed, Confinement::Strict);
    }

    #[test]
    fn confidential_is_omitted_when_off_and_lowercase_otherwise() {
        assert!(serde_json::to_value(manifest(None))
            .unwrap()
            .get("confidential")
            .is_none());
        for (mode, text) in [
            (Confidential::Auto, "auto"),
            (Confidential::Required, "required"),
        ] {
            let m = AgentManifest {
                confidential: mode,
                ..manifest(None)
            };
            assert_eq!(serde_json::to_value(m).unwrap()["confidential"], text);
        }
    }

    #[test]
    fn confidential_rejects_what_would_leak_guest_memory_or_disk() {
        let mut m = AgentManifest {
            confidential: Confidential::Auto,
            ..manifest(None)
        };
        assert!(m.validate_confidential().is_ok());
        m.warm_pool_size = 1;
        assert!(m
            .validate_confidential()
            .unwrap_err()
            .contains("warm_pool_size"));
        m.warm_pool_size = 0;
        m.idle_hibernate_seconds = Some(60);
        assert!(m.validate_confidential().unwrap_err().contains("snapshot"));
        m.idle_hibernate_seconds = None;
        // A host-readable share is tolerated under auto (it may fall back anyway)
        // but not under required.
        m.home_volume = home(None, "/home/agent");
        assert!(m.validate_confidential().is_ok());
        m.confidential = Confidential::Required;
        assert!(m.validate_confidential().unwrap_err().contains("virtiofs"));
        // Off checks nothing.
        m.confidential = Confidential::Off;
        m.warm_pool_size = 5;
        assert!(m.validate_confidential().is_ok());
    }

    #[test]
    fn inner_container_is_omitted_when_off() {
        assert!(serde_json::to_value(manifest(None))
            .unwrap()
            .get("inner_container")
            .is_none());
        let m = AgentManifest {
            inner_container: InnerContainer::Strict,
            ..manifest(None)
        };
        assert_eq!(
            serde_json::to_value(m).unwrap()["inner_container"],
            "strict"
        );
    }
}
