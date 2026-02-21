use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};

use crate::server::AppState;

// ============================================================================
// Floating IP
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FloatingIp {
    pub id: String,
    pub address: String,
    pub interface: String,
    pub assigned_vm: Option<String>,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFloatingIpRequest {
    pub address: String,
    pub interface: String,
}

#[derive(Debug, Deserialize)]
pub struct AssignFloatingIpRequest {
    pub vm_name: String,
}

/// POST /api/floating-ips - Create a floating IP
pub async fn create_floating_ip(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFloatingIpRequest>,
) -> Result<(StatusCode, Json<FloatingIp>), (StatusCode, Json<serde_json::Value>)> {
    let fip = FloatingIp {
        id: uuid::Uuid::new_v4().to_string(),
        address: req.address,
        interface: req.interface,
        assigned_vm: None,
        created: Utc::now(),
    };

    state.store.save_entity("floating_ips", &fip.id, &fip).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(fip)))
}

/// GET /api/floating-ips - List floating IPs
pub async fn list_floating_ips(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<FloatingIp>> {
    let ips: Vec<FloatingIp> = state.store.list_entities("floating_ips").unwrap_or_default();
    Json(ips)
}

/// POST /api/floating-ips/:id/assign - Assign floating IP to a VM
pub async fn assign_floating_ip(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<AssignFloatingIpRequest>,
) -> Result<Json<FloatingIp>, (StatusCode, Json<serde_json::Value>)> {
    let mut fip = match state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        Ok(Some(f)) => f,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Floating IP not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    // Remove from previous VM if assigned
    if let Some(ref _old_vm) = fip.assigned_vm {
        let _ = std::process::Command::new("ip")
            .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
            .output();
    }

    // Add IP to the interface associated with the new VM
    let output = std::process::Command::new("ip")
        .args(["addr", "add", &format!("{}/32", fip.address), "dev", &fip.interface])
        .output()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Ignore "already exists" errors
        if !stderr.contains("RTNETLINK answers: File exists") {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Failed to add IP: {}", stderr) }))));
        }
    }

    fip.assigned_vm = Some(req.vm_name);
    state.store.save_entity("floating_ips", &id, &fip).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(fip))
}

/// POST /api/floating-ips/:id/unassign - Unassign floating IP from VM
pub async fn unassign_floating_ip(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<FloatingIp>, (StatusCode, Json<serde_json::Value>)> {
    let mut fip = match state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        Ok(Some(f)) => f,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Floating IP not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    let _ = std::process::Command::new("ip")
        .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
        .output();

    fip.assigned_vm = None;
    state.store.save_entity("floating_ips", &id, &fip).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(fip))
}

/// DELETE /api/floating-ips/:id - Delete a floating IP
pub async fn delete_floating_ip(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    if let Ok(Some(fip)) = state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        let _ = std::process::Command::new("ip")
            .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
            .output();
    }

    state.store.delete_entity("floating_ips", &id).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// DHCP Server (via systemd-networkd [DHCPServer] section)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DhcpServerConfig {
    pub id: String,
    pub bridge: String,
    pub pool_offset: u32,
    pub pool_size: u32,
    pub default_lease_time_sec: u32,
    pub max_lease_time_sec: u32,
    pub dns_servers: Vec<String>,
    pub gateway: Option<String>,
    pub domain: Option<String>,
    pub enabled: bool,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDhcpServerRequest {
    pub bridge: String,
    #[serde(default = "default_pool_offset")]
    pub pool_offset: u32,
    #[serde(default = "default_pool_size")]
    pub pool_size: u32,
    #[serde(default = "default_lease_time")]
    pub default_lease_time_sec: u32,
    #[serde(default = "default_max_lease_time")]
    pub max_lease_time_sec: u32,
    #[serde(default)]
    pub dns_servers: Vec<String>,
    pub gateway: Option<String>,
    pub domain: Option<String>,
}

fn default_pool_offset() -> u32 { 100 }
fn default_pool_size() -> u32 { 100 }
fn default_lease_time() -> u32 { 3600 }
fn default_max_lease_time() -> u32 { 7200 }

/// POST /api/dhcp-servers - Enable DHCP server on a bridge via systemd-networkd
pub async fn create_dhcp_server(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDhcpServerRequest>,
) -> Result<(StatusCode, Json<DhcpServerConfig>), (StatusCode, Json<serde_json::Value>)> {
    let config = DhcpServerConfig {
        id: uuid::Uuid::new_v4().to_string(),
        bridge: req.bridge.clone(),
        pool_offset: req.pool_offset,
        pool_size: req.pool_size,
        default_lease_time_sec: req.default_lease_time_sec,
        max_lease_time_sec: req.max_lease_time_sec,
        dns_servers: req.dns_servers.clone(),
        gateway: req.gateway.clone(),
        domain: req.domain.clone(),
        enabled: true,
        created: Utc::now(),
    };

    // Generate systemd-networkd .network file with [DHCPServer] section
    let network_content = generate_dhcp_network_file(&config);
    let config_dir = &state.config.network.networkd_config_dir;
    let prefix = &state.config.network.networkd_file_prefix;
    let file_path = format!("{}/{}{}-dhcp.network", config_dir, prefix, req.bridge);

    std::fs::write(&file_path, &network_content).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Failed to write config: {}", e) })))
    })?;

    // Reload networkd
    let _ = std::process::Command::new("networkctl").arg("reload").output();

    state.store.save_entity("dhcp_servers", &config.id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(config)))
}

/// GET /api/dhcp-servers - List DHCP server configs
pub async fn list_dhcp_servers(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<DhcpServerConfig>> {
    let configs: Vec<DhcpServerConfig> = state.store.list_entities("dhcp_servers").unwrap_or_default();
    Json(configs)
}

/// DELETE /api/dhcp-servers/:id - Remove DHCP server
pub async fn delete_dhcp_server(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    if let Ok(Some(config)) = state.store.get_entity::<DhcpServerConfig>("dhcp_servers", &id) {
        let config_dir = &state.config.network.networkd_config_dir;
        let prefix = &state.config.network.networkd_file_prefix;
        let file_path = format!("{}/{}{}-dhcp.network", config_dir, prefix, config.bridge);
        let _ = std::fs::remove_file(&file_path);
        let _ = std::process::Command::new("networkctl").arg("reload").output();
    }

    state.store.delete_entity("dhcp_servers", &id).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

fn generate_dhcp_network_file(config: &DhcpServerConfig) -> String {
    let mut content = format!(
        "[Match]\nName={}\n\n[Network]\nDHCPServer=yes\n",
        config.bridge
    );

    if let Some(ref gw) = config.gateway {
        content.push_str(&format!("Address={}/24\n", gw));
    }

    if let Some(ref domain) = config.domain {
        content.push_str(&format!("Domains={}\n", domain));
    }

    for dns in &config.dns_servers {
        content.push_str(&format!("DNS={}\n", dns));
    }

    content.push_str(&format!(
        "\n[DHCPServer]\nPoolOffset={}\nPoolSize={}\nDefaultLeaseTimeSec={}\nMaxLeaseTimeSec={}\n",
        config.pool_offset, config.pool_size,
        config.default_lease_time_sec, config.max_lease_time_sec,
    ));

    if !config.dns_servers.is_empty() {
        content.push_str(&format!("DNS={}\n", config.dns_servers.join(" ")));
    }

    if let Some(ref domain) = config.domain {
        content.push_str(&format!("SendOption=15:string:{}\n", domain));
    }

    content
}

// ============================================================================
// DNS (via systemd-resolved integration)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsConfig {
    pub id: String,
    pub domain: String,
    pub upstream_servers: Vec<String>,
    pub search_domains: Vec<String>,
    pub records: Vec<DnsRecord>,
    pub enabled: bool,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsRecord {
    pub name: String,
    pub record_type: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDnsConfigRequest {
    pub domain: String,
    #[serde(default)]
    pub upstream_servers: Vec<String>,
    #[serde(default)]
    pub search_domains: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddDnsRecordRequest {
    pub name: String,
    pub record_type: String,
    pub value: String,
}

/// POST /api/dns - Create DNS configuration
pub async fn create_dns_config(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDnsConfigRequest>,
) -> Result<(StatusCode, Json<DnsConfig>), (StatusCode, Json<serde_json::Value>)> {
    let config = DnsConfig {
        id: uuid::Uuid::new_v4().to_string(),
        domain: req.domain,
        upstream_servers: req.upstream_servers,
        search_domains: req.search_domains,
        records: Vec::new(),
        enabled: true,
        created: Utc::now(),
    };

    // Configure systemd-resolved search domains
    if !config.search_domains.is_empty() {
        let _ = std::process::Command::new("resolvectl")
            .arg("domain")
            .arg("--")
            .args(&config.search_domains)
            .output();
    }

    if !config.upstream_servers.is_empty() {
        let _ = std::process::Command::new("resolvectl")
            .arg("dns")
            .arg("--")
            .args(&config.upstream_servers)
            .output();
    }

    state.store.save_entity("dns_configs", &config.id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(config)))
}

/// GET /api/dns - List DNS configurations
pub async fn list_dns_configs(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<DnsConfig>> {
    let configs: Vec<DnsConfig> = state.store.list_entities("dns_configs").unwrap_or_default();
    Json(configs)
}

/// POST /api/dns/:id/records - Add a DNS record
pub async fn add_dns_record(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<AddDnsRecordRequest>,
) -> Result<Json<DnsConfig>, (StatusCode, Json<serde_json::Value>)> {
    let mut config = match state.store.get_entity::<DnsConfig>("dns_configs", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "DNS config not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    config.records.push(DnsRecord {
        name: req.name,
        record_type: req.record_type,
        value: req.value,
    });

    // Write /etc/hosts-style entries for A records
    update_hosts_file(&config);

    state.store.save_entity("dns_configs", &id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(config))
}

/// DELETE /api/dns/:id - Delete DNS configuration
pub async fn delete_dns_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    state.store.delete_entity("dns_configs", &id).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

fn update_hosts_file(config: &DnsConfig) {
    let hosts_path = "/etc/vmspawnd-hosts";

    let mut content = String::from("# Managed by vmspawnd - do not edit\n");
    for record in &config.records {
        if record.record_type == "A" {
            let fqdn = if record.name.ends_with('.') {
                record.name.trim_end_matches('.').to_string()
            } else {
                format!("{}.{}", record.name, config.domain)
            };
            content.push_str(&format!("{} {}\n", record.value, fqdn));
        }
    }

    let _ = std::fs::write(hosts_path, content);
}
