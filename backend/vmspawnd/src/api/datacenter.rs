use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use datacenter::{
    Cluster, CreateClusterRequest, CreateDatacenterRequest, Datacenter, DatacenterStatus,
    DatacenterSummary, HostHeartbeat, HostInfo, HostStatus, RegisterHostRequest,
    UpdateClusterRequest, UpdateDatacenterRequest, UpdateHostRequest,
};

// ============================================================================
// Datacenter handlers
// ============================================================================

pub async fn list_datacenters(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<Datacenter> = state.store.list_entities("datacenters").unwrap_or_default();
    Json(items)
}

pub async fn create_datacenter(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDatacenterRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let dc = Datacenter {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        clusters: Vec::new(),
        created_at: now,
        updated_at: now,
        status: DatacenterStatus::Active,
    };
    match state.store.save_entity("datacenters", &dc.id, &dc) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&dc).unwrap())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_datacenter(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<Datacenter>("datacenters", &id) {
        Ok(Some(dc)) => Json(serde_json::to_value(&dc).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn update_datacenter(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateDatacenterRequest>,
) -> impl IntoResponse {
    let dc = match state.store.get_entity::<Datacenter>("datacenters", &id) {
        Ok(Some(dc)) => dc,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };
    let mut dc = dc;
    if let Some(name) = req.name {
        dc.name = name;
    }
    if let Some(description) = req.description {
        dc.description = description;
    }
    if let Some(status) = req.status {
        dc.status = status;
    }
    dc.updated_at = Utc::now();
    let _ = state.store.save_entity("datacenters", &dc.id, &dc);
    Json(serde_json::to_value(&dc).unwrap()).into_response()
}

pub async fn delete_datacenter(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("datacenters", &id);
    StatusCode::NO_CONTENT
}

pub async fn get_datacenter_summary(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let dc = match state.store.get_entity::<Datacenter>("datacenters", &id) {
        Ok(Some(dc)) => dc,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let hosts: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();
    let dc_hosts: Vec<&HostInfo> = hosts.iter().filter(|h| h.datacenter_id == id).collect();
    let summary = DatacenterSummary {
        id: dc.id,
        name: dc.name,
        cluster_count: dc.clusters.len(),
        host_count: dc_hosts.len(),
        vm_count: dc_hosts.iter().map(|h| h.vm_count).sum(),
        total_cpus: dc_hosts.iter().map(|h| h.cpus).sum(),
        total_memory_mb: dc_hosts.iter().map(|h| h.memory_mb).sum(),
    };
    Json(serde_json::to_value(&summary).unwrap()).into_response()
}

// ============================================================================
// Cluster handlers
// ============================================================================

pub async fn list_clusters(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<Cluster> = state.store.list_entities("clusters").unwrap_or_default();
    Json(items)
}

pub async fn create_cluster(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateClusterRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let cluster = Cluster {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        description: req.description,
        datacenter_id: req.datacenter_id,
        hosts: Vec::new(),
        ha_enabled: req.ha_enabled,
        drs_enabled: req.drs_enabled,
        drs_mode: req.drs_mode,
        evc_mode: req.evc_mode,
        created_at: now,
        updated_at: now,
        status: datacenter::ClusterStatus::Active,
    };
    match state.store.save_entity("clusters", &cluster.id, &cluster) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&cluster).unwrap())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_cluster(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<Cluster>("clusters", &id) {
        Ok(Some(c)) => Json(serde_json::to_value(&c).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_cluster(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateClusterRequest>,
) -> impl IntoResponse {
    let mut cluster = match state.store.get_entity::<Cluster>("clusters", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(name) = req.name { cluster.name = name; }
    if let Some(desc) = req.description { cluster.description = desc; }
    if let Some(ha) = req.ha_enabled { cluster.ha_enabled = ha; }
    if let Some(drs) = req.drs_enabled { cluster.drs_enabled = drs; }
    if let Some(mode) = req.drs_mode { cluster.drs_mode = mode; }
    if let Some(evc) = req.evc_mode { cluster.evc_mode = evc; }
    if let Some(status) = req.status { cluster.status = status; }
    cluster.updated_at = Utc::now();
    let _ = state.store.save_entity("clusters", &cluster.id, &cluster);
    Json(serde_json::to_value(&cluster).unwrap()).into_response()
}

pub async fn delete_cluster(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("clusters", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Host handlers
// ============================================================================

pub async fn list_hosts(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();
    Json(items)
}

pub async fn register_host(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterHostRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let host = HostInfo {
        id: Uuid::new_v4().to_string(),
        hostname: req.hostname,
        address: req.address,
        cluster_id: req.cluster_id.clone(),
        datacenter_id: String::new(),
        cpus: req.cpus,
        memory_mb: req.memory_mb,
        status: HostStatus::Connected,
        last_heartbeat: now,
        vm_count: 0,
        cpu_usage_pct: 0.0,
        memory_usage_pct: 0.0,
        agent_version: req.agent_version,
        created_at: now,
        updated_at: now,
    };
    match state.store.save_entity("hosts", &host.id, &host) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&host).unwrap())).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn get_host(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.store.get_entity::<HostInfo>("hosts", &id) {
        Ok(Some(h)) => Json(serde_json::to_value(&h).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn update_host(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateHostRequest>,
) -> impl IntoResponse {
    let mut host = match state.store.get_entity::<HostInfo>("hosts", &id) {
        Ok(Some(h)) => h,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(hostname) = req.hostname { host.hostname = hostname; }
    if let Some(address) = req.address { host.address = address; }
    if let Some(cpus) = req.cpus { host.cpus = cpus; }
    if let Some(memory_mb) = req.memory_mb { host.memory_mb = memory_mb; }
    if let Some(agent_version) = req.agent_version { host.agent_version = agent_version; }
    if let Some(status) = req.status { host.status = status; }
    host.updated_at = Utc::now();
    let _ = state.store.save_entity("hosts", &host.id, &host);
    Json(serde_json::to_value(&host).unwrap()).into_response()
}

pub async fn remove_host(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("hosts", &id);
    StatusCode::NO_CONTENT
}

pub async fn host_heartbeat(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(hb): Json<HostHeartbeat>,
) -> impl IntoResponse {
    let mut host = match state.store.get_entity::<HostInfo>("hosts", &id) {
        Ok(Some(h)) => h,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    host.cpu_usage_pct = hb.cpu_usage_pct;
    host.memory_usage_pct = hb.memory_usage_pct;
    host.vm_count = hb.vm_count;
    host.last_heartbeat = Utc::now();
    host.updated_at = host.last_heartbeat;
    let _ = state.store.save_entity("hosts", &host.id, &host);
    StatusCode::OK.into_response()
}

pub async fn host_enter_maintenance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut host = match state.store.get_entity::<HostInfo>("hosts", &id) {
        Ok(Some(h)) => h,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    host.status = HostStatus::Maintenance;
    host.updated_at = Utc::now();
    let _ = state.store.save_entity("hosts", &host.id, &host);
    StatusCode::OK.into_response()
}

pub async fn host_exit_maintenance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut host = match state.store.get_entity::<HostInfo>("hosts", &id) {
        Ok(Some(h)) => h,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    host.status = HostStatus::Connected;
    host.updated_at = Utc::now();
    let _ = state.store.save_entity("hosts", &host.id, &host);
    StatusCode::OK.into_response()
}

// ============================================================================
// Host discovery & cluster health
// ============================================================================

#[derive(serde::Deserialize)]
pub struct DiscoverHostRequest {
    pub address: String,
    pub port: Option<u16>,
    pub cluster_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct DiscoverHostResult {
    pub reachable: bool,
    pub hostname: Option<String>,
    pub cpus: Option<u32>,
    pub memory_mb: Option<u64>,
    pub already_registered: bool,
}

/// POST /api/hosts/discover - Probe a host to check reachability and gather info
pub async fn discover_host(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DiscoverHostRequest>,
) -> impl IntoResponse {
    let port = req.port.unwrap_or(8080);
    let url = format!("http://{}:{}/health", req.address, port);

    // Check if already registered
    let hosts: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();
    let already_registered = hosts.iter().any(|h| h.address == req.address);

    // Probe the host
    let reachable = match state.http_client.get(&url).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    };

    let (hostname, cpus, memory_mb) = if reachable {
        // Try to get system info from the remote host
        let info_url = format!("http://{}:{}/api/system/cpu/topology", req.address, port);
        let cpu_info = state.http_client.get(&info_url).send().await.ok()
            .and_then(|r| if r.status().is_success() { Some(r) } else { None });

        let cpus = if let Some(resp) = cpu_info {
            resp.json::<serde_json::Value>().await.ok()
                .and_then(|v| v["total_cpus"].as_u64().map(|c| c as u32))
        } else {
            None
        };

        let mem_url = format!("http://{}:{}/api/system/memory", req.address, port);
        let mem_info = state.http_client.get(&mem_url).send().await.ok()
            .and_then(|r| if r.status().is_success() { Some(r) } else { None });

        let memory_mb = if let Some(resp) = mem_info {
            resp.json::<serde_json::Value>().await.ok()
                .and_then(|v| v["total_kb"].as_u64().map(|k| k / 1024))
        } else {
            None
        };

        (Some(req.address.clone()), cpus, memory_mb)
    } else {
        (None, None, None)
    };

    Json(DiscoverHostResult {
        reachable,
        hostname,
        cpus,
        memory_mb,
        already_registered,
    })
}

#[derive(serde::Serialize)]
pub struct ClusterHealth {
    pub cluster_id: String,
    pub total_hosts: u32,
    pub connected_hosts: u32,
    pub disconnected_hosts: u32,
    pub maintenance_hosts: u32,
    pub total_vms: u32,
    pub avg_cpu_usage: f64,
    pub avg_memory_usage: f64,
    pub health_status: String,
}

/// GET /api/clusters/:id/health - Get cluster health summary
pub async fn get_cluster_health(
    State(state): State<Arc<AppState>>,
    Path(cluster_id): Path<String>,
) -> impl IntoResponse {
    // Verify cluster exists
    match state.store.get_entity::<Cluster>("clusters", &cluster_id) {
        Ok(Some(_)) => {}
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let hosts: Vec<HostInfo> = state.store.list_entities("hosts").unwrap_or_default();
    let cluster_hosts: Vec<&HostInfo> = hosts.iter()
        .filter(|h| h.cluster_id == cluster_id)
        .collect();

    let total = cluster_hosts.len() as u32;
    let connected = cluster_hosts.iter().filter(|h| matches!(h.status, HostStatus::Connected)).count() as u32;
    let disconnected = cluster_hosts.iter().filter(|h| matches!(h.status, HostStatus::Disconnected | HostStatus::NotResponding)).count() as u32;
    let maintenance = cluster_hosts.iter().filter(|h| matches!(h.status, HostStatus::Maintenance)).count() as u32;
    let total_vms: u32 = cluster_hosts.iter().map(|h| h.vm_count).sum();

    let (avg_cpu, avg_mem) = if !cluster_hosts.is_empty() {
        let cpu: f64 = cluster_hosts.iter().map(|h| h.cpu_usage_pct).sum::<f64>() / cluster_hosts.len() as f64;
        let mem: f64 = cluster_hosts.iter().map(|h| h.memory_usage_pct).sum::<f64>() / cluster_hosts.len() as f64;
        (cpu, mem)
    } else {
        (0.0, 0.0)
    };

    let health_status = if disconnected > 0 {
        "degraded"
    } else if total == 0 {
        "empty"
    } else {
        "healthy"
    };

    (StatusCode::OK, Json(ClusterHealth {
        cluster_id,
        total_hosts: total,
        connected_hosts: connected,
        disconnected_hosts: disconnected,
        maintenance_hosts: maintenance,
        total_vms,
        avg_cpu_usage: avg_cpu,
        avg_memory_usage: avg_mem,
        health_status: health_status.to_string(),
    })).into_response()
}
