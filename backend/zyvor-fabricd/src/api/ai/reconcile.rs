// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Inference deployment reconciler (preview).
//!
//! Places a free NVIDIA GPU, binds it via FluxVM, creates a QEMU VM with
//! VFIO + bridged tap + cloud-init vLLM unit, probes guest health, then
//! upserts Maglev backends. Scale-down / delete drains Maglev, deletes the
//! VM, and releases the GPU.
//!
//! Without a GPU or when FluxVM inventory is empty, the deployment stays
//! `Pending` with a clear message — suitable for GPU-less smoke tests of the
//! REST layer. Set `FLUXVM_AI_DRY_RUN=1` to skip bind/create and only update
//! status bookkeeping.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use vm_model::{BindMount, CloudInitFile, VMStartOptions, VM};
use zyvor_fabric_fluxvm_client::{GpuBindRequest, GpuReleaseRequest};

use crate::server::AppState;

use super::ipam;
use super::maglev::{build_maglev_service_spec, drain_backend};
use super::placement::place_gpus;
use super::types::{
    InferenceDeployment, InferenceEndpoint, InferenceProfile, InferenceReplica, ModelArtifact,
};
use super::{fluxvm_client, STORE_DEPLOYMENTS, STORE_ENDPOINTS, STORE_MODELS, STORE_PROFILES};

const GUEST_MODEL_PATH: &str = "/models";
const VLLM_UNIT_PATH: &str = "/etc/systemd/system/vllm.service";
const HEALTH_PATH: &str = "/health";
const STORE_GPU_RESERVATIONS: &str = "ai_gpu_reservations";
const STORE_MANAGED_VMS: &str = "ai_managed_vms";
const STORE_MAGLEV: &str = "ai_maglev_services";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GpuReservation {
    bdf: String,
    deployment: String,
    vm_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ManagedVm {
    vm_name: String,
    deployment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MaglevRecord {
    endpoint: String,
    service: String,
}

fn deployment_locks() -> &'static Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn deployment_lock(name: &str) -> Arc<tokio::sync::Mutex<()>> {
    let mut map = deployment_locks().lock().unwrap_or_else(|e| e.into_inner());
    map.entry(name.to_string())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

/// Serialize create, scale, autoscaler, and the periodic loop for one deployment.
pub async fn locked_reconcile(state: &AppState, name: &str) -> Result<(), String> {
    let lock = deployment_lock(name);
    let _guard = lock.lock().await;
    reconcile_deployment(state, name).await
}

/// Periodic reconciler. The first tick is startup recovery.
pub async fn run_ai_reconcile_controller(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
    loop {
        interval.tick().await;
        let names: Vec<String> = state
            .store
            .list_entities::<InferenceDeployment>(STORE_DEPLOYMENTS)
            .unwrap_or_default()
            .into_iter()
            .map(|d| d.name)
            .collect();
        for name in names {
            if let Err(e) = locked_reconcile(&state, &name).await {
                tracing::warn!(deployment = %name, "AI reconcile tick: {e}");
            }
        }
        sweep_orphans(&state).await;
    }
}

/// Spawn a background reconcile for a deployment (create / scale).
pub fn enqueue_deployment_reconcile(state: Arc<AppState>, name: String) {
    tokio::spawn(async move {
        if let Err(e) = locked_reconcile(&state, &name).await {
            tracing::warn!(deployment = %name, "AI reconcile failed: {e}");
            if let Ok(Some(mut dep)) = state
                .store
                .get_entity::<InferenceDeployment>(STORE_DEPLOYMENTS, &name)
            {
                dep.status.phase = "Failed".into();
                dep.status.message = Some(e);
                dep.updated = Utc::now();
                let _ = state.store.save_entity(STORE_DEPLOYMENTS, &name, &dep);
            }
        }
    });
}

/// Spawn a background Maglev upsert for an endpoint.
pub fn enqueue_endpoint_reconcile(state: Arc<AppState>, name: String) {
    tokio::spawn(async move {
        if let Err(e) = reconcile_endpoint(&state, &name).await {
            tracing::warn!(endpoint = %name, "AI endpoint reconcile failed: {e}");
        }
    });
}

pub async fn reconcile_deployment(state: &AppState, name: &str) -> Result<(), String> {
    let mut dep: InferenceDeployment = state
        .store
        .get_entity(STORE_DEPLOYMENTS, name)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("deployment '{name}' not found"))?;

    let profile: InferenceProfile = state
        .store
        .get_entity(STORE_PROFILES, &dep.profile)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("profile '{}' not found", dep.profile))?;

    let model: ModelArtifact = state
        .store
        .get_entity(STORE_MODELS, &dep.model)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("model '{}' not found", dep.model))?;

    let model_host = model
        .local_path
        .clone()
        .ok_or_else(|| "model has no local_path; re-create ModelArtifact".to_string())?;

    // Scale down first.
    while dep.status.replicas.len() > dep.replicas as usize {
        let Some(victim) = dep.status.replicas.pop() else {
            break;
        };
        if let Err(e) = remove_replica(state, &dep, &victim).await {
            tracing::warn!("scale-down replica {}: {e}", victim.vm_name);
            dep.status.replicas.push(victim);
            break;
        }
    }

    let dry_run = std::env::var("FLUXVM_AI_DRY_RUN")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    // Drop replicas whose VM disappeared, then refill guest IPs before scale-up.
    if !dry_run {
        if let Ok(client) = fluxvm_client(state) {
            if let Ok(vms) = client.list_vms().await {
                let live: HashSet<String> = vms.iter().map(|v| v.name.clone()).collect();
                let mut kept = Vec::new();
                for rep in std::mem::take(&mut dep.status.replicas) {
                    if live.contains(&rep.vm_name) {
                        kept.push(rep);
                    } else {
                        let _ = state.store.delete_entity(STORE_GPU_RESERVATIONS, &rep.bdf);
                        let _ = state.store.delete_entity(STORE_MANAGED_VMS, &rep.vm_name);
                    }
                }
                for rep in &mut kept {
                    if rep.address.is_none() {
                        if let Some(vm) = vms.iter().find(|v| v.name == rep.vm_name) {
                            if let Some(ip) = vm.guest_ip.clone() {
                                rep.address = Some(ip);
                            }
                        }
                    }
                }
                dep.status.replicas = kept;
            }
        }
    }

    // Scale up.
    while dep.status.replicas.len() < dep.replicas as usize {
        let idx = dep.status.replicas.len();
        match create_replica(state, &dep, &profile, &model_host, idx, dry_run).await {
            Ok(rep) => dep.status.replicas.push(rep),
            Err(e) => {
                dep.status.phase = "Pending".into();
                dep.status.message = Some(e.clone());
                dep.updated = Utc::now();
                state
                    .store
                    .save_entity(STORE_DEPLOYMENTS, &dep.name, &dep)
                    .map_err(|se| se.to_string())?;
                return Err(e);
            }
        }
    }

    // Health probe ready replicas (skip in dry-run).
    if !dry_run {
        for rep in &mut dep.status.replicas {
            if rep.ready {
                continue;
            }
            if let Some(addr) = rep.address.clone() {
                if probe_health(&addr, 8000).await {
                    rep.ready = true;
                }
            }
        }
    }

    let ready = dep.status.replicas.iter().filter(|r| r.ready).count();
    dep.status.phase = if ready == dep.replicas as usize && dep.replicas > 0 {
        "Ready".into()
    } else if dry_run {
        "DryRun".into()
    } else {
        "Pending".into()
    };
    dep.status.message = Some(format!(
        "{ready}/{} replicas ready{}",
        dep.replicas,
        if dry_run { " (FLUXVM_AI_DRY_RUN)" } else { "" }
    ));
    dep.updated = Utc::now();
    state
        .store
        .save_entity(STORE_DEPLOYMENTS, &dep.name, &dep)
        .map_err(|e| e.to_string())?;

    // Refresh any endpoints that point at this deployment.
    let endpoints: Vec<InferenceEndpoint> = state
        .store
        .list_entities(STORE_ENDPOINTS)
        .unwrap_or_default();
    for ep in endpoints.into_iter().filter(|e| e.deployment == dep.name) {
        let _ = reconcile_endpoint(state, &ep.name).await;
    }

    Ok(())
}

async fn create_replica(
    state: &AppState,
    dep: &InferenceDeployment,
    profile: &InferenceProfile,
    model_host: &str,
    idx: usize,
    dry_run: bool,
) -> Result<InferenceReplica, String> {
    let vm_name = format!("{}-{}", dep.name, idx);
    crate::validation::validate_vm_name(&vm_name).map_err(|(_, m)| m)?;

    let allocated = allocated_bdfs(state);
    let client = match fluxvm_client(state) {
        Ok(c) => c,
        Err((_, body)) => {
            return Err(body
                .0
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("FluxVM client error")
                .to_string());
        }
    };

    let inventory = client.list_host_gpus().await.unwrap_or_default();
    let mut gpu_req = profile.gpu.clone();
    gpu_req.count = 1;

    if dry_run {
        let site = dep
            .preferred_site
            .clone()
            .or_else(|| std::env::var("FLUXVM_AI_SITE").ok());
        return Ok(InferenceReplica {
            vm_name,
            bdf: format!("dry-run-{idx}"),
            ready: true,
            address: Some(format!("10.255.0.{}", idx + 1)),
            metrics: None,
            maglev_weight: None,
            site,
            cost_tier: Some(1),
            draining: false,
        });
    }

    if inventory.is_empty() {
        return Err(
            "no host GPUs available from FluxVM (set FLUXVM_AI_DRY_RUN=1 to exercise REST without GPUs)"
                .into(),
        );
    }

    let picked = place_gpus(&inventory, &gpu_req, &allocated)?;
    let gpu = picked[0];
    let bdf = gpu.bdf.clone();

    let reservation = GpuReservation {
        bdf: bdf.clone(),
        deployment: dep.name.clone(),
        vm_name: vm_name.clone(),
    };
    state
        .store
        .save_entity(STORE_GPU_RESERVATIONS, &bdf, &reservation)
        .map_err(|e| e.to_string())?;

    if let Err(e) = client
        .bind_host_gpu(&GpuBindRequest {
            bdf: bdf.clone(),
            vram_gib: gpu.vram_gib,
        })
        .await
    {
        let _ = state.store.delete_entity(STORE_GPU_RESERVATIONS, &bdf);
        return Err(format!("GPU bind {bdf}: {e}"));
    }

    let image = std::env::var("FLUXVM_AI_IMAGE").unwrap_or_else(|_| {
        format!(
            "{}/ai-vllm-cuda.qcow2",
            state.config.storage.image_path.trim_end_matches('/')
        )
    });

    let mut labels = std::collections::HashMap::new();
    labels.insert("role".into(), "ai-inference".into());
    labels.insert("deployment".into(), dep.name.clone());
    if let Some(ref t) = dep.tenant {
        labels.insert("tenant".into(), t.clone());
    }

    let vllm_unit = vllm_systemd_unit(GUEST_MODEL_PATH);
    let vm = VM {
        name: vm_name.clone(),
        state: vm_model::VMState::Stopped,
        cpus: profile.cpu,
        memory: (profile.memory_gib as u64).saturating_mul(1024),
        disk: 40,
        image: image.clone(),
        ip: None,
        pid: None,
        mac_address: None,
        hostname: Some(vm_name.clone()),
        tags: Some(vec!["ai".into(), "inference".into()]),
        labels: Some(labels),
        vnc_port: None,
        created: Utc::now(),
        updated: None,
        last_error: None,
        port_forwards: vec![],
        network_tap: true, // bridged tap — not direct
        network_static_ip: false,
        direct_uplink: None,
        direct_mode: None,
        direct_guest_ips: vec![],
        ssh_authorized_keys: vec![],
        cloud_init_packages: vec![],
        cloud_init_runcmd: vec![
            "systemctl daemon-reload".into(),
            "systemctl enable --now vllm.service".into(),
        ],
        cloud_init_write_files: vec![CloudInitFile {
            path: VLLM_UNIT_PATH.into(),
            content: vllm_unit,
            permissions: Some("0644".into()),
        }],
        storage: None,
        enable_qga: false,
        hyperv: false,
    };

    state.store.save_vm(&vm).map_err(|e| e.to_string())?;

    let opts = VMStartOptions {
        network_tap: true,
        bind_mounts: vec![BindMount {
            source: model_host.to_string(),
            destination: Some(GUEST_MODEL_PATH.into()),
            read_only: true,
        }],
        vfio_devices: vec![bdf.clone()],
        cloud_init_write_files: vm.cloud_init_write_files.clone(),
        cloud_init_runcmd: vm.cloud_init_runcmd.clone(),
        ssh_authorized_keys: vec!["ssh-ed25519 AAAA fabric-ai-placeholder".into()],
        ..Default::default()
    };

    if let Err(e) = state.driver.start_with_options(&vm, &opts).await {
        let _ = client
            .release_host_gpu(&GpuReleaseRequest {
                bdf: bdf.clone(),
                restore_driver: false,
            })
            .await;
        let _ = state.store.delete_entity(STORE_GPU_RESERVATIONS, &bdf);
        let _ = state.store.delete_vm(&vm_name);
        return Err(format!("start VM {vm_name}: {e}"));
    }

    let _ = state.store.save_entity(
        STORE_MANAGED_VMS,
        &vm_name,
        &ManagedVm {
            vm_name: vm_name.clone(),
            deployment: dep.name.clone(),
        },
    );

    // Best-effort guest IP from FluxVM record.
    let address = match client.find_by_name(&vm_name).await {
        Ok(Some(rec)) => rec.guest_ip,
        _ => None,
    };

    Ok(InferenceReplica {
        vm_name,
        bdf,
        ready: false,
        address,
        metrics: None,
        maglev_weight: None,
        site: dep
            .preferred_site
            .clone()
            .or_else(|| std::env::var("FLUXVM_AI_SITE").ok()),
        cost_tier: Some(1),
        draining: false,
    })
}

async fn remove_replica(
    state: &AppState,
    dep: &InferenceDeployment,
    rep: &InferenceReplica,
) -> Result<(), String> {
    // Drain Maglev backends that reference this replica.
    let endpoints: Vec<InferenceEndpoint> = state
        .store
        .list_entities::<InferenceEndpoint>(STORE_ENDPOINTS)
        .unwrap_or_default()
        .into_iter()
        .filter(|e| e.deployment == dep.name)
        .collect();

    if let Ok(client) = fluxvm_client(state) {
        for ep in &endpoints {
            if let Ok(mut spec) = client.get_network_service(&ep.name).await {
                if let Some(addr) = &rep.address {
                    drain_backend(&mut spec, addr);
                    let _ = client.upsert_network_service(&spec).await;
                }
            }
        }

        if let Err(e) = state.driver.delete(&rep.vm_name).await {
            tracing::warn!("delete VM {}: {e}", rep.vm_name);
        }
        let _ = state.store.delete_vm(&rep.vm_name);

        if !rep.bdf.is_empty() && !rep.bdf.starts_with("dry-run-") {
            let _ = client
                .release_host_gpu(&GpuReleaseRequest {
                    bdf: rep.bdf.clone(),
                    restore_driver: false,
                })
                .await;
            let _ = state.store.delete_entity(STORE_GPU_RESERVATIONS, &rep.bdf);
        }
        let _ = state.store.delete_entity(STORE_MANAGED_VMS, &rep.vm_name);
    } else {
        let _ = state.driver.delete(&rep.vm_name).await;
        let _ = state.store.delete_vm(&rep.vm_name);
    }
    Ok(())
}

pub async fn teardown_deployment(
    state: &AppState,
    dep: &InferenceDeployment,
) -> Result<(), String> {
    for rep in &dep.status.replicas {
        remove_replica(state, dep, rep).await?;
    }
    Ok(())
}

pub async fn reconcile_endpoint(state: &AppState, name: &str) -> Result<(), String> {
    let mut ep: InferenceEndpoint = state
        .store
        .get_entity(STORE_ENDPOINTS, name)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("endpoint '{name}' not found"))?;

    let dep: InferenceDeployment = state
        .store
        .get_entity(STORE_DEPLOYMENTS, &ep.deployment)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("deployment '{}' not found", ep.deployment))?;

    let profile: Option<InferenceProfile> = state
        .store
        .get_entity(STORE_PROFILES, &dep.profile)
        .ok()
        .flatten();
    let max_egress = profile.as_ref().and_then(|p| p.max_egress_mbps);

    let vip = if let Some(existing) = ep.vip.clone() {
        ipam::adopt(state, &ep.name, &existing)?
    } else {
        ipam::reserve(state, &ep.name)?
    };

    let spec = build_maglev_service_spec(&ep.name, &vip, ep.port, &dep.status.replicas, max_egress);

    let client = match fluxvm_client(state) {
        Ok(c) => c,
        Err(_) => {
            // GPU-less / FluxVM-down: persist desired VIP and leave service_id unset.
            ep.vip = Some(vip);
            ep.updated = Utc::now();
            let _ = state.store.save_entity(STORE_ENDPOINTS, &ep.name, &ep);
            return Ok(());
        }
    };

    match client.upsert_network_service(&spec).await {
        Ok(status) => {
            ep.service_id = Some(status.service_id);
            ep.vip = Some(vip);
            ep.updated = Utc::now();
            let _ = state.store.save_entity(
                STORE_MAGLEV,
                &ep.name,
                &MaglevRecord {
                    endpoint: ep.name.clone(),
                    service: ep.name.clone(),
                },
            );
            state
                .store
                .save_entity(STORE_ENDPOINTS, &ep.name, &ep)
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            tracing::warn!("Maglev upsert {}: {e}", ep.name);
            ep.vip = Some(vip);
            ep.updated = Utc::now();
            let _ = state.store.save_entity(STORE_ENDPOINTS, &ep.name, &ep);
            Err(e.to_string())
        }
    }
}

pub async fn teardown_endpoint(state: &AppState, ep: &InferenceEndpoint) -> Result<(), String> {
    if let Ok(client) = fluxvm_client(state) {
        let _ = client.delete_network_service(&ep.name).await;
    }
    let _ = state.store.delete_entity(STORE_MAGLEV, &ep.name);
    ipam::release(state, &ep.name);
    Ok(())
}

fn allocated_bdfs(state: &AppState) -> HashSet<String> {
    let deps: Vec<InferenceDeployment> = state
        .store
        .list_entities(STORE_DEPLOYMENTS)
        .unwrap_or_default();
    let mut set: HashSet<String> = deps
        .into_iter()
        .flat_map(|d| d.status.replicas.into_iter())
        .filter(|r| !r.bdf.is_empty() && !r.bdf.starts_with("dry-run-"))
        .map(|r| r.bdf.to_ascii_lowercase())
        .collect();
    let reserved: Vec<GpuReservation> = state
        .store
        .list_entities(STORE_GPU_RESERVATIONS)
        .unwrap_or_default();
    for rec in reserved {
        if !rec.bdf.is_empty() && !rec.bdf.starts_with("dry-run-") {
            set.insert(rec.bdf.to_ascii_lowercase());
        }
    }
    set
}

async fn sweep_orphans(state: &AppState) {
    let dep_names: HashSet<String> = state
        .store
        .list_entities::<InferenceDeployment>(STORE_DEPLOYMENTS)
        .unwrap_or_default()
        .into_iter()
        .map(|d| d.name)
        .collect();
    let endpoint_names: HashSet<String> = state
        .store
        .list_entities::<InferenceEndpoint>(STORE_ENDPOINTS)
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.name)
        .collect();

    let reservations: Vec<GpuReservation> = state
        .store
        .list_entities(STORE_GPU_RESERVATIONS)
        .unwrap_or_default();
    for rec in reservations {
        if dep_names.contains(&rec.deployment) {
            continue;
        }
        let Ok(client) = fluxvm_client(state) else {
            continue;
        };
        let _ = client
            .release_host_gpu(&GpuReleaseRequest {
                bdf: rec.bdf.clone(),
                restore_driver: false,
            })
            .await;
        if let Ok(Some(vm)) = client.find_by_name(&rec.vm_name).await {
            let _ = client.delete_vm(vm.id).await;
        }
        let _ = state.store.delete_entity(STORE_GPU_RESERVATIONS, &rec.bdf);
    }

    let managed: Vec<ManagedVm> = state
        .store
        .list_entities(STORE_MANAGED_VMS)
        .unwrap_or_default();
    for rec in managed {
        if dep_names.contains(&rec.deployment) {
            continue;
        }
        if let Ok(client) = fluxvm_client(state) {
            if let Ok(Some(vm)) = client.find_by_name(&rec.vm_name).await {
                let _ = client.delete_vm(vm.id).await;
            }
        }
        let _ = state.store.delete_entity(STORE_MANAGED_VMS, &rec.vm_name);
    }

    let services: Vec<MaglevRecord> = state.store.list_entities(STORE_MAGLEV).unwrap_or_default();
    for rec in services {
        if endpoint_names.contains(&rec.endpoint) {
            continue;
        }
        if let Ok(client) = fluxvm_client(state) {
            let _ = client.delete_network_service(&rec.service).await;
        }
        let _ = state.store.delete_entity(STORE_MAGLEV, &rec.endpoint);
        ipam::release(state, &rec.endpoint);
    }
}

fn vllm_systemd_unit(model_path: &str) -> String {
    format!(
        r#"[Unit]
Description=vLLM OpenAI-compatible server (Fabric AI preview)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/vllm serve {model_path} --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
"#
    )
}

async fn probe_health(addr: &str, port: u16) -> bool {
    let url = format!("http://{addr}:{port}{HEALTH_PATH}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build();
    let Ok(client) = client else {
        return false;
    };
    matches!(client.get(&url).send().await, Ok(r) if r.status().is_success())
}
