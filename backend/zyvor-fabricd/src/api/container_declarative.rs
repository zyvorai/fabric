// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Declarative `ContainerGroup` workload — OCI containers scheduled by
//! fabric's own placement (`container_placement`) onto a Kubernetes cluster,
//! executed via FluxVM's Secure Containers `RuntimeClass fluxvm`. Sibling to
//! `declarative::VMSpec`, reusing its `ResourceSpec`/`VolumeMount` shapes
//! where they already match a container's needs.
//!
//! v1 scope, deliberately: one target cluster (no multi-site resolution —
//! matches the VM path's own single-`fluxvm_url` maturity today), fixed
//! replica count (no horizontal autoscaling loop), no `AffinityRule`
//! cross-referencing (see `container_placement`), ephemeral/hostPath volumes
//! only (no CSI/virtiofs-backed volume that could move with a rescheduled
//! Pod).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use super::container_placement;
use super::declarative::{parse_memory_mb, ResourceSpec, VolumeMount};
use crate::server::AppState;
use security::{RequireRead, RequireWrite};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVarSpec {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerSpec {
    pub name: String,
    /// OCI image reference — the one real divergence from `VMSpec.image`
    /// (a qcow2/raw base image name).
    pub image: String,
    #[serde(default)]
    pub command: Vec<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<EnvVarSpec>,
    pub resources: ResourceSpec,
    #[serde(default)]
    pub volume_mounts: Vec<VolumeMount>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlacementSpec {
    /// Pin directly to a host (matched by id or hostname), bypassing
    /// `predictive_drs` scoring.
    #[serde(default)]
    pub node_hint: Option<String>,
    /// If true, an autohealer may delete and recreate this group's Pods on
    /// a new host after its current host goes `NotResponding`. Default
    /// false — Secure Containers is still developer-preview upstream, and
    /// there's no volume-affinity-aware placement yet, so auto-reschedule
    /// is opt-in rather than a default behavior.
    #[serde(default)]
    pub auto_reschedule: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerGroupSpec {
    pub name: String,
    pub containers: Vec<ContainerSpec>,
    #[serde(default = "default_replicas")]
    pub replicas: u32,
    #[serde(default)]
    pub placement: PlacementSpec,
    #[serde(default = "default_restart_policy")]
    pub restart_policy: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_replicas() -> u32 {
    1
}

fn default_restart_policy() -> String {
    "Always".to_string()
}

impl ContainerGroupSpec {
    /// Total cpus/memory-MB across every container, times replica count.
    /// Callers must validate each container's `resources.memory` string
    /// before relying on this — a parse failure here degrades to 0 rather
    /// than panicking, since by placement time `apply_container_group_spec`
    /// has already rejected an invalid spec.
    pub fn total_resources(&self) -> (u32, u64) {
        let mut cpus: u32 = 0;
        let mut memory_mb: u64 = 0;
        for c in &self.containers {
            cpus = cpus.saturating_add(c.resources.cpus);
            memory_mb =
                memory_mb.saturating_add(parse_memory_mb(&c.resources.memory).unwrap_or(0));
        }
        let replicas = self.replicas.max(1);
        (
            cpus.saturating_mul(replicas),
            memory_mb.saturating_mul(replicas as u64),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ContainerGroupStatus {
    pub(crate) host_id: String,
    pub(crate) host_name: String,
    pub(crate) pod_names: Vec<String>,
    pub(crate) updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ContainerGroupApplyResult {
    pub name: String,
    pub host_id: String,
    pub host_name: String,
    pub replicas_created: usize,
    pub warnings: Vec<String>,
}

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(json!({"error": msg.into()})))
}

fn validate_spec(spec: &ContainerGroupSpec) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    crate::validation::validate_vm_name(&spec.name).map_err(|(s, m)| err(s, m))?;

    if spec.containers.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "containers must not be empty"));
    }
    if spec.containers.len() > 16 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "containers count must not exceed 16",
        ));
    }
    if spec.replicas < 1 || spec.replicas > 64 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "replicas must be between 1 and 64",
        ));
    }
    if spec.tags.len() > 100 {
        return Err(err(StatusCode::BAD_REQUEST, "tags count must not exceed 100"));
    }
    if !matches!(
        spec.restart_policy.as_str(),
        "Always" | "Never" | "OnFailure"
    ) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "restart_policy must be one of Always, Never, OnFailure",
        ));
    }

    for c in &spec.containers {
        if c.name.is_empty() || c.image.is_empty() {
            return Err(err(
                StatusCode::BAD_REQUEST,
                "each container needs a non-empty name and image",
            ));
        }
        if c.resources.cpus < 1 || c.resources.cpus > 1024 {
            return Err(err(
                StatusCode::BAD_REQUEST,
                format!("container '{}': cpus must be between 1 and 1024", c.name),
            ));
        }
        parse_memory_mb(&c.resources.memory).map_err(|e| {
            err(
                StatusCode::BAD_REQUEST,
                format!("container '{}': {}", c.name, e),
            )
        })?;
        for vol in &c.volume_mounts {
            crate::validation::validate_host_path(&vol.host).map_err(|(s, m)| {
                err(s, format!("container '{}': invalid volume host path: {}", c.name, m))
            })?;
            crate::validation::validate_machine_path(&vol.guest).map_err(|(s, m)| {
                err(
                    s,
                    format!("container '{}': invalid volume guest path: {}", c.name, m),
                )
            })?;
        }
    }
    Ok(())
}

pub(crate) fn build_pod_request(
    spec: &ContainerGroupSpec,
    name: &str,
    node_name: &str,
) -> k8s_pod_client::PodRequest {
    let mut containers = Vec::new();
    let mut volumes = Vec::new();

    for c in &spec.containers {
        // Already validated in `validate_spec`.
        let memory_mb = parse_memory_mb(&c.resources.memory).unwrap_or(0);

        let mut volume_mounts = Vec::new();
        for (idx, vm) in c.volume_mounts.iter().enumerate() {
            let vol_name = format!("{}-vol-{}", c.name, idx);
            volumes.push(k8s_pod_client::PodVolumeSource {
                name: vol_name.clone(),
                host_path: vm.host.clone(),
            });
            volume_mounts.push(k8s_pod_client::PodVolumeMount {
                name: vol_name,
                mount_path: vm.guest.clone(),
                read_only: vm.readonly,
            });
        }

        containers.push(k8s_pod_client::PodContainerSpec {
            name: c.name.clone(),
            image: c.image.clone(),
            command: c.command.clone(),
            args: c.args.clone(),
            env: c.env.iter().map(|e| (e.name.clone(), e.value.clone())).collect(),
            cpu_millis: c.resources.cpus.saturating_mul(1000),
            memory_mb,
            volume_mounts,
        });
    }

    let mut labels = std::collections::BTreeMap::new();
    labels.insert(
        "fabric.zyvor.dev/container-group".to_string(),
        spec.name.clone(),
    );

    k8s_pod_client::PodRequest {
        name: name.to_string(),
        node_name: node_name.to_string(),
        labels,
        containers,
        volumes,
        restart_policy: spec.restart_policy.clone(),
    }
}

pub(crate) fn pod_name(group_name: &str, replicas: u32, index: u32) -> String {
    if replicas <= 1 {
        group_name.to_string()
    } else {
        format!("{group_name}-{index}")
    }
}

/// POST /api/container-groups/apply — create/update a ContainerGroup:
/// place it on a Secure-Containers-capable host, then create its Pod(s)
/// there via the Kubernetes API.
pub async fn apply_container_group_spec(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(spec): Json<ContainerGroupSpec>,
) -> Result<(StatusCode, Json<ContainerGroupApplyResult>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("container_declarative::{}", stringify!(apply_container_group_spec));
    validate_spec(&spec)?;

    let client = state.k8s_pod_client.clone().ok_or_else(|| {
        err(
            StatusCode::SERVICE_UNAVAILABLE,
            "ContainerGroup support is not enabled/configured on this fabric instance \
             (set container_groups.enabled = true and a reachable kubeconfig)",
        )
    })?;

    let placed = container_placement::place_container_group(&state, &spec)
        .map_err(|e| err(StatusCode::BAD_REQUEST, e))?;

    let mut warnings = Vec::new();
    let mut created_pod_names = Vec::new();

    for i in 0..spec.replicas {
        let name = pod_name(&spec.name, spec.replicas, i);
        let pod_req = build_pod_request(&spec, &name, &placed.hostname);
        match client.create_pod(&pod_req).await {
            Ok(_) => created_pod_names.push(name),
            Err(e) => warnings.push(format!("failed to create pod '{name}': {e}")),
        }
    }

    state
        .store
        .save_entity("container_groups", &spec.name, &spec)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let status = ContainerGroupStatus {
        host_id: placed.id.clone(),
        host_name: placed.hostname.clone(),
        pod_names: created_pod_names.clone(),
        updated_at: chrono::Utc::now(),
    };
    state
        .store
        .save_entity("container_group_status", &spec.name, &status)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::OK,
        Json(ContainerGroupApplyResult {
            name: spec.name,
            host_id: placed.id,
            host_name: placed.hostname,
            replicas_created: created_pod_names.len(),
            warnings,
        }),
    ))
}

/// GET /api/container-groups/:name/spec — export a ContainerGroup's stored spec.
pub async fn export_container_group_spec(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ContainerGroupSpec>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("container_declarative::{}", stringify!(export_container_group_spec));
    match state.store.get_entity::<ContainerGroupSpec>("container_groups", &name) {
        Ok(Some(spec)) => Ok(Json(spec)),
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "ContainerGroup not found")),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// DELETE /api/container-groups/:name — delete a ContainerGroup's Pod(s) and
/// stored spec/status.
pub async fn delete_container_group(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("container_declarative::{}", stringify!(delete_container_group));

    let status = state
        .store
        .get_entity::<ContainerGroupStatus>("container_group_status", &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(status) = status {
        if let Some(client) = state.k8s_pod_client.clone() {
            for pod in &status.pod_names {
                if let Err(e) = client.delete_pod(pod).await {
                    tracing::warn!("failed to delete pod '{}' for ContainerGroup '{}': {}", pod, name, e);
                }
            }
        }
    }

    let _ = state.store.delete_entity("container_group_status", &name);
    state
        .store
        .delete_entity("container_groups", &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
