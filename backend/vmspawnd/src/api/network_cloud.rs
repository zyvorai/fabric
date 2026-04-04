use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use tokio::process::Command;

use crate::server::AppState;
use security::{RequireRead, RequireWrite, RequireAdmin};

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

/// POST /api/floating-ips - Create a floating IP (Admin only)
pub async fn create_floating_ip(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFloatingIpRequest>,
) -> Result<(StatusCode, Json<FloatingIp>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(create_floating_ip));
    // Validate IP address format
    crate::validation::validate_ip_address(&req.address).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })))
    })?;
    // Validate interface name
    crate::validation::validate_hostname(&req.interface).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid interface name: {}", msg) })))
    })?;
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
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<Vec<FloatingIp>> {
    tracing::debug!("network_cloud::{}", stringify!(list_floating_ips));
    let ips: Vec<FloatingIp> = state.store.list_entities("floating_ips").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    Json(ips)
}

/// POST /api/floating-ips/:id/assign - Assign floating IP to a VM (Admin only)
pub async fn assign_floating_ip(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<AssignFloatingIpRequest>,
) -> Result<Json<FloatingIp>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(assign_floating_ip));
    let mut fip = match state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        Ok(Some(f)) => f,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Floating IP not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    // Remove from previous VM if assigned
    if let Some(ref _old_vm) = fip.assigned_vm {
        if let Err(e) = Command::new("ip")
            .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
    }

    // Add IP to the interface associated with the new VM
    let output = Command::new("ip")
        .args(["addr", "add", &format!("{}/32", fip.address), "dev", &fip.interface])
        .output()
        .await
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

/// POST /api/floating-ips/:id/unassign - Unassign floating IP from VM (Admin only)
pub async fn unassign_floating_ip(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<FloatingIp>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(unassign_floating_ip));
    let mut fip = match state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        Ok(Some(f)) => f,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Floating IP not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    if let Err(e) = Command::new("ip")
        .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
        .output()
        .await
    {
        tracing::warn!("Command failed: {}", e);
    }

    fip.assigned_vm = None;
    state.store.save_entity("floating_ips", &id, &fip).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(fip))
}

/// DELETE /api/floating-ips/:id - Delete a floating IP (Admin only)
pub async fn delete_floating_ip(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(delete_floating_ip));
    if let Ok(Some(fip)) = state.store.get_entity::<FloatingIp>("floating_ips", &id) {
        if let Err(e) = Command::new("ip")
            .args(["addr", "del", &format!("{}/32", fip.address), "dev", &fip.interface])
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
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

/// POST /api/dhcp-servers - Enable DHCP server on a bridge via systemd-networkd (Admin only)
pub async fn create_dhcp_server(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDhcpServerRequest>,
) -> Result<(StatusCode, Json<DhcpServerConfig>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(create_dhcp_server));
    // Validate bridge name to prevent path traversal
    crate::validation::validate_hostname(&req.bridge).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid bridge name: {}", msg) })))
    })?;

    // Validate DNS servers
    for dns in &req.dns_servers {
        crate::validation::validate_ip_address(dns).map_err(|msg| {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid DNS server: {}", msg) })))
        })?;
    }

    // Validate gateway if provided
    if let Some(ref gw) = req.gateway {
        crate::validation::validate_ip_address(gw).map_err(|msg| {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid gateway: {}", msg) })))
        })?;
    }

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

    tokio::fs::write(&file_path, &network_content).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Failed to write config: {}", e) })))
    })?;

    // Reload networkd
    if let Err(e) = Command::new("networkctl").arg("reload").output().await {
        tracing::warn!("Command failed: {}", e);
    }

    state.store.save_entity("dhcp_servers", &config.id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(config)))
}

/// GET /api/dhcp-servers - List DHCP server configs
pub async fn list_dhcp_servers(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<Vec<DhcpServerConfig>> {
    tracing::debug!("network_cloud::{}", stringify!(list_dhcp_servers));
    let configs: Vec<DhcpServerConfig> = state.store.list_entities("dhcp_servers").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    Json(configs)
}

/// DELETE /api/dhcp-servers/:id - Remove DHCP server (Admin only)
pub async fn delete_dhcp_server(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(delete_dhcp_server));
    if let Ok(Some(config)) = state.store.get_entity::<DhcpServerConfig>("dhcp_servers", &id) {
        let config_dir = &state.config.network.networkd_config_dir;
        let prefix = &state.config.network.networkd_file_prefix;
        let file_path = format!("{}/{}{}-dhcp.network", config_dir, prefix, config.bridge);
        if let Err(e) = tokio::fs::remove_file(&file_path).await {
            tracing::warn!("Failed to remove file: {}", e);
        }
        if let Err(e) = Command::new("networkctl").arg("reload").output().await {
            tracing::warn!("Command failed: {}", e);
        }
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

    // Sanitize values to prevent INI injection via newlines
    let sanitize = |s: &str| -> String { s.replace('\n', "").replace('\r', "") };

    if let Some(ref gw) = config.gateway {
        content.push_str(&format!("Address={}/24\n", sanitize(gw)));
    }

    if let Some(ref domain) = config.domain {
        content.push_str(&format!("Domains={}\n", sanitize(domain)));
    }

    for dns in &config.dns_servers {
        content.push_str(&format!("DNS={}\n", sanitize(dns)));
    }

    content.push_str(&format!(
        "\n[DHCPServer]\nPoolOffset={}\nPoolSize={}\nDefaultLeaseTimeSec={}\nMaxLeaseTimeSec={}\n",
        config.pool_offset, config.pool_size,
        config.default_lease_time_sec, config.max_lease_time_sec,
    ));

    if !config.dns_servers.is_empty() {
        content.push_str(&format!("DNS={}\n", config.dns_servers.iter().map(|s| sanitize(s)).collect::<Vec<_>>().join(" ")));
    }

    if let Some(ref domain) = config.domain {
        content.push_str(&format!("SendOption=15:string:{}\n", sanitize(domain)));
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

/// POST /api/dns - Create DNS configuration (Admin only)
pub async fn create_dns_config(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateDnsConfigRequest>,
) -> Result<(StatusCode, Json<DnsConfig>), (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(create_dns_config));
    // Validate domain name
    crate::validation::validate_hostname(&req.domain).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid domain: {}", msg) })))
    })?;
    // Validate upstream servers
    for server in &req.upstream_servers {
        crate::validation::validate_hostname(server).map_err(|msg| {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid upstream server: {}", msg) })))
        })?;
    }
    // Validate search domains
    for domain in &req.search_domains {
        crate::validation::validate_hostname(domain).map_err(|msg| {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid search domain: {}", msg) })))
        })?;
    }

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
        if let Err(e) = Command::new("resolvectl")
            .arg("domain")
            .arg("--")
            .args(&config.search_domains)
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
    }

    if !config.upstream_servers.is_empty() {
        if let Err(e) = Command::new("resolvectl")
            .arg("dns")
            .arg("--")
            .args(&config.upstream_servers)
            .output()
            .await
        {
            tracing::warn!("Command failed: {}", e);
        }
    }

    state.store.save_entity("dns_configs", &config.id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok((StatusCode::CREATED, Json(config)))
}

/// GET /api/dns - List DNS configurations
pub async fn list_dns_configs(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Json<Vec<DnsConfig>> {
    tracing::debug!("network_cloud::{}", stringify!(list_dns_configs));
    let configs: Vec<DnsConfig> = state.store.list_entities("dns_configs").unwrap_or_else(|e| { tracing::error!("Storage error: {}", e); Vec::new() });
    Json(configs)
}

/// POST /api/dns/:id/records - Add a DNS record
pub async fn add_dns_record(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<AddDnsRecordRequest>,
) -> Result<Json<DnsConfig>, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(add_dns_record));
    let mut config = match state.store.get_entity::<DnsConfig>("dns_configs", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "DNS config not found" })))),
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))),
    };

    // Validate DNS record fields
    crate::validation::validate_hostname(&req.name).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid record name: {}", msg) })))
    })?;
    crate::validation::validate_hostname(&req.value).map_err(|msg| {
        (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid record value: {}", msg) })))
    })?;
    // Validate record type against allowlist
    let allowed_types = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "NS", "PTR"];
    if !allowed_types.contains(&req.record_type.as_str()) {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Invalid record type '{}'. Allowed: {}", req.record_type, allowed_types.join(", ")) }))));
    }

    config.records.push(DnsRecord {
        name: req.name,
        record_type: req.record_type,
        value: req.value,
    });

    // Write /etc/hosts-style entries for A records
    update_hosts_file(&config).await;

    state.store.save_entity("dns_configs", &id, &config).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(Json(config))
}

/// DELETE /api/dns/:id - Delete DNS configuration
pub async fn delete_dns_config(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("network_cloud::{}", stringify!(delete_dns_config));
    state.store.delete_entity("dns_configs", &id).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
    })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_hosts_file(config: &DnsConfig) {
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

    if let Err(e) = tokio::fs::write(hosts_path, content).await {
        tracing::warn!("Failed to write hosts file: {}", e);
    }
}
