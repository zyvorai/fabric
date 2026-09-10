// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Narrow client for creating/observing the Kubernetes `Pod` objects that
//! back a fabric `ContainerGroup`. Deliberately thin: this wraps
//! `kube::Api<Pod>` CRUD only, not `kube::runtime`'s controller/watch
//! machinery — that belongs to `zyvor-fabricd-operator`, which reacts to
//! CRDs already applied to some cluster. This crate is the *outbound* side:
//! fabric reaching into a (possibly customer-owned) cluster it holds a
//! kubeconfig for, to place a Pod on the host its own placement decided on.

use std::collections::BTreeMap;

use anyhow::{Context, Result};
use k8s_openapi::api::core::v1::{
    Container, EnvVar, HostPathVolumeSource, Pod, PodSpec, PodStatus, ResourceRequirements,
    Toleration, Volume, VolumeMount as K8sVolumeMount,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::api::{Api, DeleteParams, PatchParams, PostParams};
use kube::config::{KubeConfigOptions, Kubeconfig};
use kube::{Client, Config};

/// The `RuntimeClass` FluxVM's Secure Containers shim registers as
/// (`deploy/containerd/runtimeclass.yaml` in the fluxvm repo).
pub const SECURE_CONTAINERS_RUNTIME_CLASS: &str = "fluxvm";

/// Taint/toleration pair placed on Secure-Containers-capable nodes so
/// kube-scheduler doesn't also place ordinary workloads on capacity
/// fabric's own placement (`predictive_drs`) is bin-packing.
pub const SECURE_CONTAINERS_TAINT_KEY: &str = "fluxvm.io/secure-containers";

#[derive(Debug, Clone)]
pub struct K8sPodClientConfig {
    /// Path to a kubeconfig file for the target cluster/site. `None` uses
    /// the ambient in-cluster or default kubeconfig context.
    pub kubeconfig_path: Option<String>,
    pub namespace: String,
}

impl Default for K8sPodClientConfig {
    fn default() -> Self {
        Self {
            kubeconfig_path: None,
            namespace: "default".to_string(),
        }
    }
}

pub struct PodVolumeMount {
    pub name: String,
    pub mount_path: String,
    pub read_only: bool,
}

/// `host_path` is the v1 volume backing (matches the host-path semantics
/// `VolumeMount.host` already has for VMs). A CSI/virtiofs-backed source is
/// a natural follow-up once ContainerGroup volumes need to move with a
/// rescheduled Pod rather than stay pinned to one host's local path.
pub struct PodVolumeSource {
    pub name: String,
    pub host_path: String,
}

pub struct PodContainerSpec {
    pub name: String,
    pub image: String,
    pub command: Vec<String>,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    /// Millicores. Used as both request and limit (Guaranteed QoS) — the
    /// simplest correct choice for a first version; burstable requests can
    /// follow once ContainerGroup needs it.
    pub cpu_millis: u32,
    pub memory_mb: u64,
    pub volume_mounts: Vec<PodVolumeMount>,
}

pub struct PodRequest {
    pub name: String,
    /// The Kubernetes node to pin this Pod to — the host fabric's own
    /// `predictive_drs`-based placement already chose. Set as
    /// `spec.nodeName` directly, bypassing kube-scheduler for this Pod.
    pub node_name: String,
    pub labels: BTreeMap<String, String>,
    pub containers: Vec<PodContainerSpec>,
    pub volumes: Vec<PodVolumeSource>,
    /// "Always" | "Never" | "OnFailure".
    pub restart_policy: String,
}

pub struct PodStatusView {
    pub phase: Option<String>,
    pub pod_ip: Option<String>,
    pub node_name: Option<String>,
    pub uid: Option<String>,
    pub resource_version: Option<String>,
}

pub struct K8sPodClient {
    api: Api<Pod>,
}

impl K8sPodClient {
    pub async fn connect(config: &K8sPodClientConfig) -> Result<Self> {
        let client = match &config.kubeconfig_path {
            Some(path) => {
                let kubeconfig = Kubeconfig::read_from(path)
                    .with_context(|| format!("reading kubeconfig at {path}"))?;
                let kube_config =
                    Config::from_custom_kubeconfig(kubeconfig, &KubeConfigOptions::default())
                        .await
                        .context("building kube client config from kubeconfig")?;
                Client::try_from(kube_config).context("constructing Kubernetes client")?
            }
            None => Client::try_default()
                .await
                .context("constructing Kubernetes client from ambient context")?,
        };
        let api = Api::namespaced(client, &config.namespace);
        Ok(Self { api })
    }

    /// Create (or replace, via server-side apply) the Pod backing a
    /// ContainerGroup. Idempotent under the same field manager, so re-`apply`
    /// of an unchanged spec is a no-op on the API server.
    pub async fn create_pod(&self, req: &PodRequest) -> Result<Pod> {
        let pod = build_pod(req);
        let pp = PatchParams::apply("zyvor-fabricd").force();
        self.api
            .patch(&req.name, &pp, &kube::api::Patch::Apply(&pod))
            .await
            .with_context(|| format!("applying Pod '{}'", req.name))
    }

    pub async fn delete_pod(&self, name: &str) -> Result<()> {
        match self.api.delete(name, &DeleteParams::default()).await {
            Ok(_) => Ok(()),
            Err(kube::Error::Api(e)) if e.code == 404 => Ok(()),
            Err(e) => Err(e).with_context(|| format!("deleting Pod '{name}'")),
        }
    }

    pub async fn get_pod_status(&self, name: &str) -> Result<Option<PodStatusView>> {
        match self.api.get_opt(name).await {
            Ok(Some(pod)) => Ok(Some(to_status_view(&pod))),
            Ok(None) => Ok(None),
            Err(e) => Err(e).with_context(|| format!("getting Pod '{name}'")),
        }
    }

    /// Unused parameter reserved for a future create-if-missing variant;
    /// kept out of `create_pod` itself so callers always get server-side
    /// apply semantics.
    #[allow(dead_code)]
    fn _post_params() -> PostParams {
        PostParams::default()
    }
}

fn to_status_view(pod: &Pod) -> PodStatusView {
    let status: Option<&PodStatus> = pod.status.as_ref();
    PodStatusView {
        phase: status.and_then(|s| s.phase.clone()),
        pod_ip: status.and_then(|s| s.pod_ip.clone()),
        node_name: pod.spec.as_ref().and_then(|s| s.node_name.clone()),
        uid: pod.metadata.uid.clone(),
        resource_version: pod.metadata.resource_version.clone(),
    }
}

fn build_pod(req: &PodRequest) -> Pod {
    let containers = req
        .containers
        .iter()
        .map(|c| {
            let quantity = |v: String| Quantity(v);
            let mut requests = BTreeMap::new();
            requests.insert("cpu".to_string(), quantity(format!("{}m", c.cpu_millis)));
            requests.insert("memory".to_string(), quantity(format!("{}Mi", c.memory_mb)));

            Container {
                name: c.name.clone(),
                image: Some(c.image.clone()),
                command: if c.command.is_empty() {
                    None
                } else {
                    Some(c.command.clone())
                },
                args: if c.args.is_empty() {
                    None
                } else {
                    Some(c.args.clone())
                },
                env: if c.env.is_empty() {
                    None
                } else {
                    Some(
                        c.env
                            .iter()
                            .map(|(k, v)| EnvVar {
                                name: k.clone(),
                                value: Some(v.clone()),
                                ..Default::default()
                            })
                            .collect(),
                    )
                },
                resources: Some(ResourceRequirements {
                    requests: Some(requests.clone()),
                    limits: Some(requests),
                    ..Default::default()
                }),
                volume_mounts: if c.volume_mounts.is_empty() {
                    None
                } else {
                    Some(
                        c.volume_mounts
                            .iter()
                            .map(|m| K8sVolumeMount {
                                name: m.name.clone(),
                                mount_path: m.mount_path.clone(),
                                read_only: Some(m.read_only),
                                ..Default::default()
                            })
                            .collect(),
                    )
                },
                ..Default::default()
            }
        })
        .collect();

    let volumes = if req.volumes.is_empty() {
        None
    } else {
        Some(
            req.volumes
                .iter()
                .map(|v| Volume {
                    name: v.name.clone(),
                    host_path: Some(HostPathVolumeSource {
                        path: v.host_path.clone(),
                        type_: None,
                    }),
                    ..Default::default()
                })
                .collect(),
        )
    };

    Pod {
        metadata: ObjectMeta {
            name: Some(req.name.clone()),
            labels: Some(req.labels.clone()),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers,
            volumes,
            node_name: Some(req.node_name.clone()),
            runtime_class_name: Some(SECURE_CONTAINERS_RUNTIME_CLASS.to_string()),
            restart_policy: Some(req.restart_policy.clone()),
            tolerations: Some(vec![Toleration {
                key: Some(SECURE_CONTAINERS_TAINT_KEY.to_string()),
                operator: Some("Equal".to_string()),
                value: Some("true".to_string()),
                effect: Some("NoSchedule".to_string()),
                ..Default::default()
            }]),
            ..Default::default()
        }),
        status: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_request() -> PodRequest {
        let mut labels = BTreeMap::new();
        labels.insert(
            "fabric.zyvor.dev/container-group".to_string(),
            "web".to_string(),
        );
        PodRequest {
            name: "web-0".to_string(),
            node_name: "node-a".to_string(),
            labels,
            containers: vec![PodContainerSpec {
                name: "app".to_string(),
                image: "nginx:latest".to_string(),
                command: vec![],
                args: vec![],
                env: vec![("FOO".to_string(), "bar".to_string())],
                cpu_millis: 500,
                memory_mb: 256,
                volume_mounts: vec![PodVolumeMount {
                    name: "app-vol-0".to_string(),
                    mount_path: "/data".to_string(),
                    read_only: true,
                }],
            }],
            volumes: vec![PodVolumeSource {
                name: "app-vol-0".to_string(),
                host_path: "/srv/web".to_string(),
            }],
            restart_policy: "Always".to_string(),
        }
    }

    #[test]
    fn build_pod_pins_node_name_and_runtime_class() {
        let pod = build_pod(&sample_request());
        let spec = pod.spec.expect("pod spec");
        assert_eq!(spec.node_name.as_deref(), Some("node-a"));
        assert_eq!(
            spec.runtime_class_name.as_deref(),
            Some(SECURE_CONTAINERS_RUNTIME_CLASS)
        );
        assert_eq!(spec.restart_policy.as_deref(), Some("Always"));
    }

    #[test]
    fn build_pod_carries_the_secure_containers_toleration() {
        let pod = build_pod(&sample_request());
        let spec = pod.spec.expect("pod spec");
        let tolerations = spec.tolerations.expect("tolerations");
        assert_eq!(tolerations.len(), 1);
        assert_eq!(
            tolerations[0].key.as_deref(),
            Some(SECURE_CONTAINERS_TAINT_KEY)
        );
        assert_eq!(tolerations[0].effect.as_deref(), Some("NoSchedule"));
    }

    #[test]
    fn build_pod_sets_matching_container_resources_and_volume_mount() {
        let pod = build_pod(&sample_request());
        let spec = pod.spec.expect("pod spec");
        assert_eq!(spec.containers.len(), 1);
        let container = &spec.containers[0];
        assert_eq!(container.image.as_deref(), Some("nginx:latest"));

        let resources = container.resources.as_ref().expect("resources");
        let requests = resources.requests.as_ref().expect("requests");
        assert_eq!(requests.get("cpu").unwrap().0, "500m");
        assert_eq!(requests.get("memory").unwrap().0, "256Mi");
        // Guaranteed QoS: limits mirror requests exactly.
        assert_eq!(resources.limits, resources.requests);

        let mounts = container.volume_mounts.as_ref().expect("volume mounts");
        assert_eq!(mounts[0].mount_path, "/data");
        assert_eq!(mounts[0].read_only, Some(true));

        let volumes = spec.volumes.expect("volumes");
        assert_eq!(volumes[0].host_path.as_ref().unwrap().path, "/srv/web");
    }

    #[test]
    fn build_pod_omits_volumes_when_none_are_requested() {
        let mut req = sample_request();
        req.containers[0].volume_mounts.clear();
        req.volumes.clear();
        let pod = build_pod(&req);
        let spec = pod.spec.expect("pod spec");
        assert!(spec.volumes.is_none());
        assert!(spec.containers[0].volume_mounts.is_none());
    }
}
