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
    /// Owning tenant. When the caller's JWT carries a `tenant` claim, this
    /// must match it (or be unset) at create time — see
    /// `tenant_scope::apply_create_tenant` — and `tenant_scope`'s
    /// middleware then scopes all by-name reads/writes to it, the same way
    /// VM routes are scoped via `tenant_scope::vm_tenant`.
    #[serde(default)]
    pub tenant: Option<String>,
    /// Names of `kubernetes.io/dockerconfigjson` Secrets, already present in
    /// the target namespace, to pull this group's images with. Pod-level in
    /// the Kubernetes API (applies to every container in the group), so it
    /// lives here rather than on `ContainerSpec`. Fabric does not create or
    /// manage these Secrets itself — provisioning them is the operator's job
    /// (e.g. via a separate `kubectl create secret docker-registry`).
    #[serde(default)]
    pub image_pull_secrets: Vec<String>,
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
            memory_mb = memory_mb.saturating_add(parse_memory_mb(&c.resources.memory).unwrap_or(0));
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

/// Audit trail for ContainerGroup lifecycle actions — mirrors `events::VMEvent`/
/// `record_event`, persisted to its own `container_group_events` collection.
/// Deliberately not wired into the SSE stream or notification rules (that's
/// real-time alerting; this is queryable audit history) — a natural follow-up
/// once ContainerGroup needs the same "notify on event" behavior VMs have.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerGroupEvent {
    pub id: String,
    pub event_type: ContainerGroupEventType,
    pub container_group_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant: Option<String>,
    /// `Claims.sub` of whoever triggered this action.
    pub actor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContainerGroupEventType {
    Created,
    Applied,
    Deleted,
    PlacementFailed,
}

fn record_container_group_event(
    state: &Arc<AppState>,
    event_type: ContainerGroupEventType,
    container_group_name: &str,
    tenant: Option<String>,
    actor: String,
    detail: Option<String>,
) {
    let event = ContainerGroupEvent {
        id: uuid::Uuid::new_v4().to_string(),
        event_type,
        container_group_name: container_group_name.to_string(),
        tenant,
        actor,
        detail,
        timestamp: chrono::Utc::now(),
    };
    if let Err(e) = state
        .store
        .save_entity("container_group_events", &event.id, &event)
    {
        tracing::error!("Failed to record ContainerGroup event: {}", e);
    }
}

fn err(status: StatusCode, msg: impl Into<String>) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(json!({"error": msg.into()})))
}

/// Whether `name` is a valid Kubernetes object name (RFC 1123 DNS
/// subdomain) — used for `image_pull_secrets` entries, which reference an
/// existing `Secret` by name rather than one fabric itself validated at
/// creation time the way `validate_vm_name` covers VM/ContainerGroup names.
fn is_valid_k8s_object_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 253 {
        return false;
    }
    let valid_chars = name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.');
    let valid_ends = !name.starts_with('-')
        && !name.ends_with('-')
        && !name.starts_with('.')
        && !name.ends_with('.');
    valid_chars && valid_ends
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
        return Err(err(
            StatusCode::BAD_REQUEST,
            "tags count must not exceed 100",
        ));
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
    if spec.image_pull_secrets.len() > 16 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "image_pull_secrets count must not exceed 16",
        ));
    }
    for secret_name in &spec.image_pull_secrets {
        if !is_valid_k8s_object_name(secret_name) {
            return Err(err(
                StatusCode::BAD_REQUEST,
                format!(
                    "invalid image_pull_secrets entry '{secret_name}': must be a valid \
                     Kubernetes object name (lowercase alphanumeric, '-' or '.', \
                     1-253 characters, not starting or ending with '-' or '.')"
                ),
            ));
        }
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
                err(
                    s,
                    format!("container '{}': invalid volume host path: {}", c.name, m),
                )
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
            env: c
                .env
                .iter()
                .map(|e| (e.name.clone(), e.value.clone()))
                .collect(),
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
        image_pull_secrets: spec.image_pull_secrets.clone(),
    }
}

pub(crate) fn pod_name(group_name: &str, replicas: u32, index: u32) -> String {
    if replicas <= 1 {
        group_name.to_string()
    } else {
        format!("{group_name}-{index}")
    }
}

/// Pod names a previous apply created that the current desired set no
/// longer wants — e.g. `replicas` went down, or dropped to 1 (renaming
/// `group-0` to the bare `group`). Deliberately compares against the full
/// *desired* set, not which creates actually succeeded this round: a
/// transient failure to (re-)create a still-desired pod must not make it
/// look stale and get deleted too.
fn stale_pod_names(previous: &[String], desired: &[String]) -> Vec<String> {
    previous
        .iter()
        .filter(|name| !desired.contains(name))
        .cloned()
        .collect()
}

/// POST /api/container-groups/apply — create/update a ContainerGroup:
/// place it on a Secure-Containers-capable host, then create its Pod(s)
/// there via the Kubernetes API.
pub async fn apply_container_group_spec(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Json(mut spec): Json<ContainerGroupSpec>,
) -> Result<(StatusCode, Json<ContainerGroupApplyResult>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!(
        "container_declarative::{}",
        stringify!(apply_container_group_spec)
    );
    validate_spec(&spec)?;

    spec.tenant = crate::tenant_scope::apply_create_tenant(&claims, spec.tenant.clone())
        .map_err(|(s, m)| err(s, m))?;

    let is_new = matches!(
        state
            .store
            .get_entity::<ContainerGroupSpec>("container_groups", &spec.name),
        Ok(None)
    );

    // Pods from a previous apply that a lower `replicas` (or any other spec
    // change) no longer wants — collected now, before they're overwritten,
    // so they can be deleted once the new desired set exists. Without this,
    // scaling a group down (or deleting it entirely between two applies that
    // race) leaked every dropped Pod forever: nothing ever revisited
    // `ContainerGroupStatus.pod_names` from the *previous* apply.
    let previous_pod_names: Vec<String> = state
        .store
        .get_entity::<ContainerGroupStatus>("container_group_status", &spec.name)
        .ok()
        .flatten()
        .map(|status| status.pod_names)
        .unwrap_or_default();

    let client = state.k8s_pod_client.clone().ok_or_else(|| {
        err(
            StatusCode::SERVICE_UNAVAILABLE,
            "ContainerGroup support is not enabled/configured on this fabric instance \
             (set container_groups.enabled = true and a reachable kubeconfig)",
        )
    })?;

    let placed = container_placement::place_container_group(&state, &spec).map_err(|e| {
        record_container_group_event(
            &state,
            ContainerGroupEventType::PlacementFailed,
            &spec.name,
            spec.tenant.clone(),
            claims.sub.clone(),
            Some(e.clone()),
        );
        err(StatusCode::BAD_REQUEST, e)
    })?;

    let desired_pod_names: Vec<String> = (0..spec.replicas)
        .map(|i| pod_name(&spec.name, spec.replicas, i))
        .collect();

    let mut warnings = Vec::new();
    let mut created_pod_names = Vec::new();

    for name in &desired_pod_names {
        let pod_req = build_pod_request(&spec, name, &placed.hostname);
        match client.create_pod(&pod_req).await {
            Ok(_) => created_pod_names.push(name.clone()),
            Err(e) => warnings.push(format!("failed to create pod '{name}': {e}")),
        }
    }

    // Delete any Pod this apply no longer wants (e.g. `replicas` went down).
    for stale in stale_pod_names(&previous_pod_names, &desired_pod_names) {
        if let Err(e) = client.delete_pod(&stale).await {
            warnings.push(format!("failed to delete stale pod '{stale}': {e}"));
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

    record_container_group_event(
        &state,
        if is_new {
            ContainerGroupEventType::Created
        } else {
            ContainerGroupEventType::Applied
        },
        &spec.name,
        spec.tenant.clone(),
        claims.sub.clone(),
        None,
    );

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
    tracing::debug!(
        "container_declarative::{}",
        stringify!(export_container_group_spec)
    );
    match state
        .store
        .get_entity::<ContainerGroupSpec>("container_groups", &name)
    {
        Ok(Some(spec)) => Ok(Json(spec)),
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "ContainerGroup not found")),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

/// DELETE /api/container-groups/:name — delete a ContainerGroup's Pod(s) and
/// stored spec/status.
pub async fn delete_container_group(
    RequireWrite(claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!(
        "container_declarative::{}",
        stringify!(delete_container_group)
    );

    let tenant = state
        .store
        .get_entity::<ContainerGroupSpec>("container_groups", &name)
        .ok()
        .flatten()
        .and_then(|spec| spec.tenant);

    let status = state
        .store
        .get_entity::<ContainerGroupStatus>("container_group_status", &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(status) = status {
        if let Some(client) = state.k8s_pod_client.clone() {
            for pod in &status.pod_names {
                if let Err(e) = client.delete_pod(pod).await {
                    tracing::warn!(
                        "failed to delete pod '{}' for ContainerGroup '{}': {}",
                        pod,
                        name,
                        e
                    );
                }
            }
        }
    }

    let _ = state.store.delete_entity("container_group_status", &name);
    state
        .store
        .delete_entity("container_groups", &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    record_container_group_event(
        &state,
        ContainerGroupEventType::Deleted,
        &name,
        tenant,
        claims.sub,
        None,
    );

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/container-group-events — list recent ContainerGroup audit events,
/// scoped to the caller's tenant when their JWT carries one (closing the gap
/// `events::list_events` itself has today).
pub async fn list_container_group_events(
    RequireRead(claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<Vec<ContainerGroupEvent>> {
    tracing::debug!(
        "container_declarative::{}",
        stringify!(list_container_group_events)
    );
    let mut events: Vec<ContainerGroupEvent> = state
        .store
        .list_entities("container_group_events")
        .unwrap_or_default();

    if let Some(tenant) = claims.tenant.as_deref() {
        events.retain(|e| e.tenant.as_deref() == Some(tenant));
    }

    events.sort_by_key(|e| std::cmp::Reverse(e.timestamp));
    events.truncate(100);

    Json(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_group_event_omits_absent_tenant_and_detail_from_json() {
        let event = ContainerGroupEvent {
            id: "e1".to_string(),
            event_type: ContainerGroupEventType::Created,
            container_group_name: "web".to_string(),
            tenant: None,
            actor: "user-1".to_string(),
            detail: None,
            timestamp: chrono::Utc::now(),
        };
        let json = serde_json::to_value(&event).unwrap();
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("tenant"));
        assert!(!obj.contains_key("detail"));
        assert_eq!(json["actor"], "user-1");
    }

    #[test]
    fn container_group_spec_tenant_defaults_to_none_when_omitted() {
        let spec: ContainerGroupSpec = serde_json::from_str(
            r#"{"name": "web", "containers": [{"name": "app", "image": "nginx", "resources": {"cpus": 1, "memory": "512M"}}]}"#,
        )
        .unwrap();
        assert!(spec.tenant.is_none());
    }

    #[test]
    fn pod_name_is_the_bare_group_name_for_a_single_replica() {
        assert_eq!(pod_name("web", 1, 0), "web");
    }

    #[test]
    fn pod_name_is_suffixed_by_index_for_multiple_replicas() {
        assert_eq!(pod_name("web", 3, 2), "web-2");
    }

    #[test]
    fn stale_pod_names_finds_pods_dropped_by_a_lower_replica_count() {
        let previous = vec![
            "web-0".to_string(),
            "web-1".to_string(),
            "web-2".to_string(),
        ];
        let desired = vec!["web-0".to_string()];
        assert_eq!(
            stale_pod_names(&previous, &desired),
            vec!["web-1".to_string(), "web-2".to_string()]
        );
    }

    #[test]
    fn stale_pod_names_finds_the_renamed_pod_when_scaling_down_to_a_single_replica() {
        // pod_name() drops the "-0" suffix once replicas == 1, so the old
        // "web-0" is a different name than the new bare "web" and must be
        // cleaned up even though the group logically still has "replica 0".
        let previous = vec!["web-0".to_string()];
        let desired = vec!["web".to_string()];
        assert_eq!(
            stale_pod_names(&previous, &desired),
            vec!["web-0".to_string()]
        );
    }

    #[test]
    fn stale_pod_names_is_empty_when_nothing_was_dropped() {
        let previous = vec!["web-0".to_string(), "web-1".to_string()];
        let desired = vec!["web-0".to_string(), "web-1".to_string()];
        assert!(stale_pod_names(&previous, &desired).is_empty());
    }

    #[test]
    fn container_group_spec_image_pull_secrets_defaults_to_empty_when_omitted() {
        let spec: ContainerGroupSpec = serde_json::from_str(
            r#"{"name": "web", "containers": [{"name": "app", "image": "nginx", "resources": {"cpus": 1, "memory": "512M"}}]}"#,
        )
        .unwrap();
        assert!(spec.image_pull_secrets.is_empty());
    }

    #[test]
    fn is_valid_k8s_object_name_accepts_typical_secret_names() {
        assert!(is_valid_k8s_object_name("registry-creds"));
        assert!(is_valid_k8s_object_name("my.registry.creds"));
        assert!(is_valid_k8s_object_name("a"));
    }

    #[test]
    fn is_valid_k8s_object_name_rejects_uppercase_underscores_and_bad_edges() {
        assert!(!is_valid_k8s_object_name(""));
        assert!(!is_valid_k8s_object_name("Registry-Creds"));
        assert!(!is_valid_k8s_object_name("registry_creds"));
        assert!(!is_valid_k8s_object_name("-registry-creds"));
        assert!(!is_valid_k8s_object_name("registry-creds-"));
        assert!(!is_valid_k8s_object_name(".registry"));
    }

    #[test]
    fn validate_spec_rejects_an_invalid_image_pull_secret_name() {
        let spec: ContainerGroupSpec = serde_json::from_str(
            r#"{"name": "web", "image_pull_secrets": ["Bad_Name"], "containers": [{"name": "app", "image": "nginx", "resources": {"cpus": 1, "memory": "512M"}}]}"#,
        )
        .unwrap();
        let result = validate_spec(&spec);
        assert!(result.is_err());
    }
}
