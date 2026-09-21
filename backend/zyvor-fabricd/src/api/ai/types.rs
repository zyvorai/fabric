// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Serde types for Fabric AI Inference MVP (preview).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

fn default_vllm() -> String {
    "vllm".into()
}
fn default_openai() -> String {
    "openai".into()
}
fn default_port() -> u16 {
    8000
}
fn default_one_u32() -> u32 {
    1
}
fn default_gpus_per_replica() -> u32 {
    1
}
fn default_routing_strategy() -> RoutingStrategy {
    RoutingStrategy::LeastQueue
}

/// How Fabric maps AI backend health into Maglev weights (Phase 2+).
/// Intelligence stays in the control plane; eBPF only sees weights.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RoutingStrategy {
    /// Equal weight (MVP default / scrape failure fallback).
    Equal,
    /// Prefer backends with shorter waiting queues.
    #[default]
    LeastQueue,
    /// Prefer backends with lower observed TTFT.
    LowestTtft,
    /// Prefer backends with more free GPU / KV-cache headroom.
    MostFreeVram,
    /// Blend of queue depth and free VRAM.
    WeightedCapacity,
    /// Prefer replicas whose `site` matches the endpoint preferred site (Phase 5).
    SiteLocal,
    /// Prefer lower-cost / edge backends when `cost_tier` is set on replicas.
    CostOptimized,
    /// Prefer backends with lower observed GPU cache pressure (energy proxy).
    EnergyOptimized,
}

fn default_scale_out_queue() -> u32 {
    20
}
fn default_scale_out_secs() -> u64 {
    30
}
fn default_scale_in_queue() -> u32 {
    2
}
fn default_scale_in_secs() -> u64 {
    600
}
fn default_max_replicas() -> u32 {
    4
}
fn default_ttft_ms() -> f64 {
    2000.0
}
fn default_error_rate() -> f64 {
    0.15
}

/// Queue / TTFT-driven replica autoscaling (Phase 3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoscalingPolicy {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub min_replicas: u32,
    #[serde(default = "default_max_replicas")]
    pub max_replicas: u32,
    /// Allow desired replicas to reach 0 when idle (edge / CPU models).
    #[serde(default)]
    pub scale_to_zero: bool,
    #[serde(default = "default_scale_out_queue")]
    pub scale_out_queue: u32,
    #[serde(default = "default_scale_out_secs")]
    pub scale_out_seconds: u64,
    #[serde(default = "default_scale_in_queue")]
    pub scale_in_queue: u32,
    #[serde(default = "default_scale_in_secs")]
    pub scale_in_seconds: u64,
    /// Scale out when mean TTFT exceeds this (ms); 0 disables.
    #[serde(default = "default_ttft_ms")]
    pub scale_out_ttft_ms: f64,
    /// Keep one warm standby replica beyond desired (uses +1 quota).
    #[serde(default)]
    pub warm_standby: bool,
}

impl Default for AutoscalingPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            min_replicas: 1,
            max_replicas: 4,
            scale_to_zero: false,
            scale_out_queue: 20,
            scale_out_seconds: 30,
            scale_in_queue: 2,
            scale_in_seconds: 600,
            scale_out_ttft_ms: 2000.0,
            warm_standby: false,
        }
    }
}

/// Rollout mode for model / runtime upgrades (Phase 3).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RolloutStrategy {
    #[default]
    Rolling,
    Canary,
    BlueGreen,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RolloutSpec {
    #[serde(default)]
    pub strategy: RolloutStrategy,
    /// Canary traffic percent (1–50) when strategy is Canary.
    #[serde(default)]
    pub canary_percent: u8,
    /// Target model artifact for the rollout (optional; defaults to current).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_model: Option<String>,
    /// Abort / rollback when mean HTTP error rate exceeds this (0.0–1.0).
    #[serde(default = "default_error_rate")]
    pub rollback_error_rate: f64,
    /// Abort when mean TTFT exceeds this (ms); 0 disables.
    #[serde(default = "default_ttft_ms")]
    pub rollback_ttft_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RolloutRequest {
    #[serde(default)]
    pub strategy: RolloutStrategy,
    #[serde(default)]
    pub canary_percent: u8,
    #[serde(default)]
    pub target_model: Option<String>,
    #[serde(default = "default_error_rate")]
    pub rollback_error_rate: f64,
    #[serde(default = "default_ttft_ms")]
    pub rollback_ttft_ms: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DrainRequest {
    /// Replica VM name to drain; omit to drain all backends.
    #[serde(default)]
    pub replica: Option<String>,
    /// Drain grace period in seconds (Maglev drain_until).
    #[serde(default = "default_drain_grace")]
    pub grace_seconds: u64,
}

fn default_drain_grace() -> u64 {
    30
}

/// Per-endpoint API key (Phase 4). Secret is stored hashed; plaintext returned once.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceApiKey {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    /// Optional model scope; empty = any model on this endpoint.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    /// HMAC-SHA256 hex of the secret. Persisted in the entity store.
    /// API responses use `InferenceApiKeyView`, which omits this field —
    /// `skip_serializing` here would erase the hash on the next save.
    pub secret_hash: String,
    /// Prefix for display (first 8 chars of secret).
    pub prefix: String,
    #[serde(default)]
    pub request_quota: Option<u64>,
    #[serde(default)]
    pub requests_used: u64,
    pub created: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_used: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub endpoint: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub tenant: Option<String>,
    #[serde(default)]
    pub request_quota: Option<u64>,
}

/// API view of an inference key. `secret_hash` is never serialized.
#[derive(Debug, Clone, Serialize)]
pub struct InferenceApiKeyView {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    pub prefix: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_quota: Option<u64>,
    pub requests_used: u64,
    pub created: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used: Option<DateTime<Utc>>,
}

impl From<&InferenceApiKey> for InferenceApiKeyView {
    fn from(key: &InferenceApiKey) -> Self {
        Self {
            id: key.id.clone(),
            name: key.name.clone(),
            endpoint: key.endpoint.clone(),
            model: key.model.clone(),
            tenant: key.tenant.clone(),
            prefix: key.prefix.clone(),
            request_quota: key.request_quota,
            requests_used: key.requests_used,
            created: key.created,
            last_used: key.last_used,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateApiKeyResponse {
    pub key: InferenceApiKeyView,
    /// Plaintext secret — shown once.
    pub secret: String,
}

/// Scraped (or synthetic) per-replica inference metrics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReplicaMetrics {
    #[serde(default)]
    pub queue_depth: u32,
    #[serde(default)]
    pub active_requests: u32,
    /// Time to first token in milliseconds (0 = unknown).
    #[serde(default)]
    pub ttft_ms: f64,
    /// Tokens per second (0 = unknown).
    #[serde(default)]
    pub tokens_per_sec: f64,
    /// GPU / KV-cache utilization 0.0–1.0.
    #[serde(default)]
    pub gpu_cache_usage: f64,
    #[serde(default)]
    pub http_error_rate: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scraped_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Registered model weight blob (Hugging Face URI or local cache).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelArtifact {
    pub name: String,
    /// Source URI, e.g. `hf://org/model` or a local absolute path.
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checksum: Option<String>,
    /// Weight format hint (`safetensors`, `gguf`, …).
    pub format: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    /// Host path after materialization (download or `FLUXVM_AI_MODEL_DIR` stub).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    /// SPDX / SPDX-like license id (Phase 4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    /// Required data-residency region / site tag (Phase 4/5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub residency: Option<String>,
    /// When true, create fails if checksum cannot be verified (Phase 4).
    #[serde(default)]
    pub require_checksum: bool,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateModelArtifactRequest {
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub revision: Option<String>,
    #[serde(default)]
    pub checksum: Option<String>,
    pub format: String,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub tenant: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub residency: Option<String>,
    #[serde(default)]
    pub require_checksum: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuRequirements {
    /// GPU vendor filter (`nvidia` for MVP).
    pub vendor: String,
    #[serde(default = "default_one_u32")]
    pub count: u32,
    #[serde(default)]
    pub minimum_vram_gib: u32,
}

/// Hardware + runtime shape for an inference replica (preview).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceProfile {
    pub name: String,
    #[serde(default = "default_vllm")]
    pub runtime: String,
    pub gpu: GpuRequirements,
    pub cpu: u32,
    pub memory_gib: u32,
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_egress_mbps: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInferenceProfileRequest {
    pub name: String,
    #[serde(default = "default_vllm")]
    pub runtime: String,
    pub gpu: GpuRequirements,
    pub cpu: u32,
    pub memory_gib: u32,
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    #[serde(default)]
    pub max_egress_mbps: Option<u32>,
    #[serde(default)]
    pub tenant: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceReplica {
    /// Stable id. Empty on records written before ordinals existed.
    #[serde(default)]
    pub replica_id: String,
    /// Allocation ordinal. Not the vector index. Missing on old records.
    #[serde(default)]
    pub ordinal: u32,
    pub vm_name: String,
    pub bdf: String,
    pub ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metrics: Option<ReplicaMetrics>,
    /// Last Maglev weight applied by the AI routing controller (1..=32).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub maglev_weight: Option<u16>,
    /// Site / region tag for multi-site routing (Phase 5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub site: Option<String>,
    /// Relative cost tier (lower = cheaper / preferred for cost_optimized).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_tier: Option<u8>,
    /// True while Maglev drain is in progress.
    #[serde(default)]
    pub draining: bool,
    /// Consecutive failed health probes. Three replaces the replica.
    #[serde(default)]
    pub unhealthy_streak: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InferenceDeploymentStatus {
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub replicas: Vec<InferenceReplica>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Desired inference workload: model + profile × replicas (preview).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceDeployment {
    pub name: String,
    pub model: String,
    pub profile: String,
    #[serde(default = "default_one_u32")]
    pub replicas: u32,
    /// Copied from the profile at create/scale for quota accounting.
    #[serde(default = "default_gpus_per_replica")]
    pub gpus_per_replica: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    #[serde(default)]
    pub autoscaling: AutoscalingPolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rollout: Option<RolloutSpec>,
    /// Monotonic revision for immutable audit (Phase 4).
    #[serde(default)]
    pub revision: u64,
    /// Preferred site for placement / site_local routing (Phase 5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_site: Option<String>,
    /// Data-residency constraint — never place outside this tag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub residency: Option<String>,
    #[serde(default)]
    pub status: InferenceDeploymentStatus,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInferenceDeploymentRequest {
    pub name: String,
    pub model: String,
    pub profile: String,
    #[serde(default = "default_one_u32")]
    pub replicas: u32,
    #[serde(default)]
    pub tenant: Option<String>,
    #[serde(default)]
    pub autoscaling: Option<AutoscalingPolicy>,
    #[serde(default)]
    pub preferred_site: Option<String>,
    #[serde(default)]
    pub residency: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PatchAutoscalingRequest {
    pub autoscaling: AutoscalingPolicy,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScaleInferenceDeploymentRequest {
    pub replicas: u32,
}

/// Maglev-backed OpenAI-compatible frontend for a deployment (preview).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceEndpoint {
    pub name: String,
    pub deployment: String,
    #[serde(default = "default_openai")]
    pub protocol: String,
    #[serde(default = "default_port")]
    pub port: u16,
    /// Maglev service id assigned after upsert (FluxVM Service Fabric).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vip: Option<String>,
    #[serde(default = "default_routing_strategy")]
    pub routing_strategy: RoutingStrategy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    /// Preferred site for `site_local` routing (Phase 5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_site: Option<String>,
    /// Approved failover sites (never leave residency).
    #[serde(default)]
    pub allowed_sites: Vec<String>,
    /// Data-residency tag — backends outside this tag get weight 0 / excluded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub residency: Option<String>,
    /// `Deleting` while Maglev removal is in progress. Empty means active.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub phase: String,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateInferenceEndpointRequest {
    pub name: String,
    pub deployment: String,
    #[serde(default = "default_openai")]
    pub protocol: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub vip: Option<String>,
    #[serde(default = "default_routing_strategy")]
    pub routing_strategy: RoutingStrategy,
    #[serde(default)]
    pub tenant: Option<String>,
    #[serde(default)]
    pub preferred_site: Option<String>,
    #[serde(default)]
    pub allowed_sites: Vec<String>,
    #[serde(default)]
    pub residency: Option<String>,
}

/// Fabric view of a host GPU with optional allocation overlay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricGpuView {
    #[serde(flatten)]
    pub gpu: zyvor_fabric_fluxvm_client::HostGpu,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allocated_to: Option<GpuAllocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuAllocation {
    pub deployment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    pub vm_name: String,
}

#[derive(Debug, Deserialize)]
pub struct TenantQuery {
    #[serde(default)]
    pub tenant: Option<String>,
}
