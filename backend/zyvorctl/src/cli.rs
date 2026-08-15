// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use tabled::{Table, Tabled};
use vm_model::{CreateVMRequest, VM};

const API_BASE: &str = "http://localhost:9095/api";

// ─── Output format ───────────────────────────────────────────────────────────

#[derive(Clone, Copy, ValueEnum)]
pub enum OutputFormat {
    Table,
    Json,
    Yaml,
}

// ─── Main CLI ────────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "zyvorctl")]
#[command(about = "zyvor-fabricd command-line interface", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output format
    #[arg(long, short = 'o', default_value = "table", global = true)]
    output: OutputFormat,
}

#[derive(Subcommand)]
enum Commands {
    // ─── VM Management ───────────────────────────────────────────────────
    /// List all VMs
    List,
    /// Get VM information
    Info { name: String },
    /// Create a new VM
    Create {
        name: String,
        #[arg(long)]
        image: String,
        #[arg(long, default_value = "2")]
        cpus: u32,
        #[arg(long, default_value = "2048")]
        memory: u64,
        #[arg(long, default_value = "20")]
        disk: u64,
        #[arg(long)]
        hostname: Option<String>,
        #[arg(long, value_delimiter = ',')]
        tags: Option<Vec<String>>,
        #[arg(long, value_parser = parse_label)]
        label: Option<Vec<(String, String)>>,
    },
    /// Start a VM
    Start { name: String },
    /// Stop a VM
    Stop { name: String },
    /// Restart a VM
    Restart { name: String },
    /// Delete a VM
    Delete { name: String },
    /// Get VM metrics
    Metrics { name: String },

    // ─── Config import (JSON/YAML) ───────────────────────────────────────
    /// Apply configuration from a JSON or YAML file
    Apply {
        /// Path to JSON or YAML config file
        #[arg(short, long)]
        file: String,
    },
    /// Export current config to JSON or YAML
    Export {
        /// Resource type to export (vm, firewall, network-policy, service, qos, dns, vpn, mirror, nat, monitor)
        resource: String,
    },

    // ─── Network Policies ────────────────────────────────────────────────
    /// Manage network policies
    #[command(subcommand)]
    Policy(PolicyCmd),

    // ─── Firewall ────────────────────────────────────────────────────────
    /// Manage VM firewall profiles and zones
    #[command(subcommand)]
    Firewall(FirewallCmd),

    // ─── Service Mesh ────────────────────────────────────────────────────
    /// Manage service mesh services
    #[command(subcommand)]
    Service(ServiceCmd),

    // ─── QoS / Traffic Shaping ───────────────────────────────────────────
    /// Manage QoS / traffic shaping policies
    #[command(subcommand)]
    Qos(QosCmd),

    // ─── DNS ─────────────────────────────────────────────────────────────
    /// Manage DNS zones and policies
    #[command(subcommand)]
    Dns(DnsCmd),

    // ─── VPN Mesh ────────────────────────────────────────────────────────
    /// Manage VPN tunnels and networks
    #[command(subcommand)]
    Vpn(VpnCmd),

    // ─── Packet Mirror ───────────────────────────────────────────────────
    /// Manage packet mirror sessions
    #[command(subcommand)]
    Mirror(MirrorCmd),

    // ─── NAT Gateway ─────────────────────────────────────────────────────
    /// Manage NAT rules, pools, and gateways
    #[command(subcommand)]
    Nat(NatCmd),

    // ─── Network Monitor ─────────────────────────────────────────────────
    /// Manage network monitoring policies and view alerts
    #[command(subcommand)]
    Monitor(MonitorCmd),

    // ─── Ceph ────────────────────────────────────────────────────────────
    /// Manage Ceph storage pools and RBD images
    #[command(subcommand)]
    Ceph(CephCmd),

    // ─── Network (networkd) ──────────────────────────────────────────────
    /// Manage networkd bridges, VLANs, bonds, taps, port-forwards
    #[command(subcommand)]
    Net(NetCmd),
}

// ─── Sub-command enums ───────────────────────────────────────────────────────

#[derive(Subcommand)]
enum PolicyCmd {
    /// List network policies
    List,
    /// Get a network policy
    Get { id: String },
    /// Create a network policy from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a network policy
    Delete { id: String },
    /// Sync network policies
    Sync,
    /// Show policy enforcement status
    Status,
}

#[derive(Subcommand)]
enum FirewallCmd {
    /// List firewall profiles
    List,
    /// Get a firewall profile
    Get { id: String },
    /// Create a firewall profile from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a firewall profile
    Delete { id: String },
    /// List firewall zones
    Zones,
    /// Assign firewall to a VM
    Assign {
        /// VM name
        vm: String,
        /// Profile ID
        #[arg(long)]
        profile: String,
    },
    /// Remove firewall from a VM
    Unassign { vm: String },
    /// Sync firewall rules
    Sync,
    /// Show firewall status
    Status,
}

#[derive(Subcommand)]
enum ServiceCmd {
    /// List services
    List,
    /// Get a service
    Get { id: String },
    /// Create a service from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a service
    Delete { id: String },
    /// Show service backends
    Backends { id: String },
    /// Sync services
    Sync,
    /// Show service mesh status
    Status,
}

#[derive(Subcommand)]
enum QosCmd {
    /// List QoS policies
    List,
    /// Get a QoS policy
    Get { id: String },
    /// Create a QoS policy from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a QoS policy
    Delete { id: String },
    /// Sync QoS policies
    Sync,
    /// Show QoS status
    Status,
}

#[derive(Subcommand)]
enum DnsCmd {
    /// List DNS zones
    Zones,
    /// List DNS policies
    Policies,
    /// Get a DNS zone
    GetZone { id: String },
    /// Create a DNS zone from JSON/YAML file
    CreateZone {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a DNS zone
    DeleteZone { id: String },
    /// Create a DNS policy from JSON/YAML file
    CreatePolicy {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a DNS policy
    DeletePolicy { id: String },
    /// List DNS records
    Records,
    /// Sync DNS
    Sync,
}

#[derive(Subcommand)]
enum VpnCmd {
    /// List VPN tunnels
    Tunnels,
    /// List VPN networks
    Networks,
    /// Get a VPN tunnel
    GetTunnel { id: String },
    /// Create a VPN tunnel from JSON/YAML file
    CreateTunnel {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a VPN tunnel
    DeleteTunnel { id: String },
    /// Create a VPN network from JSON/YAML file
    CreateNetwork {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a VPN network
    DeleteNetwork { id: String },
    /// Sync VPN tunnels
    Sync,
    /// Show VPN status
    Status,
}

#[derive(Subcommand)]
enum MirrorCmd {
    /// List mirror sessions
    List,
    /// Get a mirror session
    Get { id: String },
    /// Create a mirror session from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a mirror session
    Delete { id: String },
    /// Sync mirror sessions
    Sync,
    /// Show mirror status
    Status,
}

#[derive(Subcommand)]
enum NatCmd {
    /// List NAT rules
    Rules,
    /// List NAT pools
    Pools,
    /// List NAT gateways
    Gateways,
    /// Get a NAT rule
    GetRule { id: String },
    /// Create a NAT rule from JSON/YAML file
    CreateRule {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a NAT rule
    DeleteRule { id: String },
    /// Create a NAT pool from JSON/YAML file
    CreatePool {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a NAT pool
    DeletePool { id: String },
    /// Create a NAT gateway from JSON/YAML file
    CreateGateway {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a NAT gateway
    DeleteGateway { id: String },
    /// Sync NAT rules
    Sync,
    /// Show NAT status
    Status,
}

#[derive(Subcommand)]
enum MonitorCmd {
    /// List monitor policies
    List,
    /// Get a monitor policy
    Get { id: String },
    /// Create a monitor policy from JSON/YAML file
    Create {
        #[arg(short, long)]
        file: String,
    },
    /// Delete a monitor policy
    Delete { id: String },
    /// Show live network metrics
    Metrics,
    /// Show VM-specific metrics
    VmMetrics { name: String },
    /// List bandwidth alerts
    Alerts,
    /// Sync monitor policies
    Sync,
    /// Show monitor status
    Status,
}

#[derive(Subcommand)]
enum CephCmd {
    /// Create a Ceph storage pool
    Create {
        /// Pool name in zyvor-fabricd
        name: String,
        /// Ceph monitor addresses (comma-separated)
        #[arg(long)]
        monitors: String,
        /// Ceph pool name (e.g. "rbd")
        #[arg(long)]
        pool: String,
        /// Ceph user (default: admin)
        #[arg(long)]
        user: Option<String>,
        /// Path to keyring file
        #[arg(long)]
        keyring: Option<String>,
        /// Auto-start on daemon startup
        #[arg(long, default_value = "true")]
        auto_start: bool,
    },
    /// List all storage pools (shows Ceph pools)
    Pools,
    /// Get Ceph cluster health
    Health { name: String },
    /// Get Ceph pool stats
    Stats { name: String },
    /// List RBD images in a Ceph pool
    Images { name: String },
    /// Create an RBD image
    CreateImage {
        /// Storage pool name
        pool: String,
        /// Image name
        name: String,
        /// Image size in MB
        #[arg(long)]
        size: u64,
    },
    /// Delete an RBD image
    DeleteImage {
        /// Storage pool name
        pool: String,
        /// Image name
        name: String,
    },
    /// Delete a Ceph storage pool
    Delete { name: String },
}

#[derive(Subcommand)]
enum NetCmd {
    /// List bridges
    Bridges,
    /// List VLANs
    Vlans,
    /// List bonds
    Bonds,
    /// List taps
    Taps,
    /// List port forwards
    Forwards,
    /// Create a bridge from JSON/YAML file
    CreateBridge {
        #[arg(short, long)]
        file: String,
    },
    /// Create a VLAN from JSON/YAML file
    CreateVlan {
        #[arg(short, long)]
        file: String,
    },
    /// Create a bond from JSON/YAML file
    CreateBond {
        #[arg(short, long)]
        file: String,
    },
    /// Create a port forward from JSON/YAML file
    CreateForward {
        #[arg(short, long)]
        file: String,
    },
    /// Sync port forwards
    SyncForwards,
    /// Reload networkd
    Reload,
    /// Show link status
    Links,
}

// ─── Table row types ─────────────────────────────────────────────────────────

#[derive(Tabled)]
struct VMRow {
    name: String,
    state: String,
    cpus: u32,
    memory: String,
    disk: String,
    image: String,
}

#[derive(Tabled)]
struct ResourceRow {
    id: String,
    name: String,
    status: String,
    info: String,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn parse_label(s: &str) -> Result<(String, String), String> {
    let parts: Vec<&str> = s.splitn(2, '=').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid label format '{}', use key=value", s));
    }
    Ok((parts[0].to_string(), parts[1].to_string()))
}

fn load_config_file(path: &str) -> Result<serde_json::Value> {
    tracing::debug!("Loading config file: {}", path);
    let content =
        std::fs::read_to_string(path).with_context(|| format!("Failed to read file: {}", path))?;
    if path.ends_with(".yaml") || path.ends_with(".yml") {
        tracing::debug!("Parsing as YAML");
        let val: serde_json::Value =
            serde_yaml::from_str(&content).with_context(|| "Failed to parse YAML")?;
        Ok(val)
    } else {
        tracing::debug!("Parsing as JSON");
        let val: serde_json::Value =
            serde_json::from_str(&content).with_context(|| "Failed to parse JSON")?;
        Ok(val)
    }
}

fn format_output<T: Serialize>(val: &T, fmt: OutputFormat) -> Result<String> {
    match fmt {
        OutputFormat::Json => Ok(serde_json::to_string_pretty(val)?),
        OutputFormat::Yaml => Ok(serde_yaml::to_string(val)?),
        OutputFormat::Table => Ok(serde_json::to_string_pretty(val)?),
    }
}

fn print_value(val: &serde_json::Value, fmt: OutputFormat) {
    match fmt {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(val).unwrap_or_default()),
        OutputFormat::Yaml => println!("{}", serde_yaml::to_string(val).unwrap_or_default()),
        OutputFormat::Table => {
            println!("{}", serde_json::to_string_pretty(val).unwrap_or_default())
        }
    }
}

fn print_resources(items: &[serde_json::Value], fmt: OutputFormat) {
    match fmt {
        OutputFormat::Table => {
            if items.is_empty() {
                println!("No resources found");
                return;
            }
            let rows: Vec<ResourceRow> = items
                .iter()
                .map(|v| ResourceRow {
                    id: v
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-")
                        .to_string(),
                    name: v
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-")
                        .to_string(),
                    status: v
                        .get("enabled")
                        .map(|e| {
                            if e.as_bool().unwrap_or(false) {
                                "active"
                            } else {
                                "disabled"
                            }
                        })
                        .unwrap_or("active")
                        .to_string(),
                    info: extract_info(v),
                })
                .collect();
            println!("{}", Table::new(rows));
        }
        OutputFormat::Json => println!(
            "{}",
            serde_json::to_string_pretty(items).unwrap_or_default()
        ),
        OutputFormat::Yaml => println!("{}", serde_yaml::to_string(items).unwrap_or_default()),
    }
}

fn extract_info(v: &serde_json::Value) -> String {
    // Try to build a short info string from common fields
    let mut parts = Vec::new();
    if let Some(t) = v.get("nat_type").and_then(|v| v.as_str()) {
        parts.push(format!("type={}", t));
    }
    if let Some(t) = v.get("topology").and_then(|v| v.as_str()) {
        parts.push(format!("topo={}", t));
    }
    if let Some(t) = v.get("algorithm").and_then(|v| v.as_str()) {
        parts.push(format!("algo={}", t));
    }
    if let Some(t) = v.get("direction").and_then(|v| v.as_str()) {
        parts.push(format!("dir={}", t));
    }
    if let Some(t) = v.get("domain").and_then(|v| v.as_str()) {
        parts.push(format!("domain={}", t));
    }
    if let Some(t) = v.get("priority").and_then(|v| v.as_u64()) {
        parts.push(format!("pri={}", t));
    }
    if let Some(t) = v.get("default_action").and_then(|v| v.as_str()) {
        parts.push(format!("default={}", t));
    }
    if let Some(a) = v.get("rules").and_then(|v| v.as_array()) {
        parts.push(format!("rules={}", a.len()));
    }
    if let Some(a) = v.get("backends").and_then(|v| v.as_array()) {
        parts.push(format!("backends={}", a.len()));
    }
    if let Some(a) = v.get("peers").and_then(|v| v.as_array()) {
        parts.push(format!("peers={}", a.len()));
    }
    if let Some(a) = v.get("thresholds").and_then(|v| v.as_array()) {
        parts.push(format!("thresholds={}", a.len()));
    }
    if parts.is_empty() {
        v.get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    } else {
        parts.join(", ")
    }
}

async fn api_get(client: &Client, path: &str) -> Result<serde_json::Value> {
    tracing::debug!("GET {}{}", API_BASE, path);
    let res = client.get(format!("{}{}", API_BASE, path)).send().await?;
    tracing::debug!("Response: {}", res.status());
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(res.json().await?)
}

async fn api_post(
    client: &Client,
    path: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value> {
    tracing::debug!("POST {}{}", API_BASE, path);
    let res = client
        .post(format!("{}{}", API_BASE, path))
        .json(body)
        .send()
        .await?;
    tracing::debug!("Response: {}", res.status());
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(res.json().await?)
}

async fn api_post_empty(client: &Client, path: &str) -> Result<serde_json::Value> {
    tracing::debug!("POST {}{} (empty body)", API_BASE, path);
    let res = client.post(format!("{}{}", API_BASE, path)).send().await?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(res
        .json()
        .await
        .unwrap_or(serde_json::json!({"status": "ok"})))
}

async fn api_put(
    client: &Client,
    path: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value> {
    tracing::debug!("PUT {}{}", API_BASE, path);
    let res = client
        .put(format!("{}{}", API_BASE, path))
        .json(body)
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(res.json().await?)
}

async fn api_delete(client: &Client, path: &str) -> Result<()> {
    tracing::debug!("DELETE {}{}", API_BASE, path);
    let res = client
        .delete(format!("{}{}", API_BASE, path))
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(())
}

async fn api_post_void(client: &Client, path: &str) -> Result<()> {
    tracing::debug!("POST {}{} (void)", API_BASE, path);
    let res = client.post(format!("{}{}", API_BASE, path)).send().await?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("{}: {}", status, body);
    }
    Ok(())
}

// ─── Execution ───────────────────────────────────────────────────────────────

impl Cli {
    pub async fn run(self) -> Result<()> {
        let client = Client::new();
        let fmt = self.output;

        match self.command {
            // ── VM Management ────────────────────────────────────────────
            Commands::List => {
                let vms: Vec<VM> = client
                    .get(format!("{}/vms", API_BASE))
                    .send()
                    .await?
                    .json()
                    .await?;

                match fmt {
                    OutputFormat::Table => {
                        if vms.is_empty() {
                            println!("No VMs found");
                            return Ok(());
                        }
                        let rows: Vec<VMRow> = vms
                            .into_iter()
                            .map(|vm| VMRow {
                                name: vm.name,
                                state: format!("{:?}", vm.state),
                                cpus: vm.cpus,
                                memory: format!("{}MB", vm.memory),
                                disk: format!("{}GB", vm.disk),
                                image: vm.image,
                            })
                            .collect();
                        println!("{}", Table::new(rows));
                    }
                    OutputFormat::Json => println!("{}", serde_json::to_string_pretty(&vms)?),
                    OutputFormat::Yaml => println!("{}", serde_yaml::to_string(&vms)?),
                }
            }

            Commands::Info { name } => {
                let vm: VM = client
                    .get(format!("{}/vms/{}", API_BASE, name))
                    .send()
                    .await?
                    .json()
                    .await?;

                match fmt {
                    OutputFormat::Table => {
                        println!("Name:     {}", vm.name);
                        println!("State:    {:?}", vm.state);
                        println!("CPUs:     {}", vm.cpus);
                        println!("Memory:   {}MB", vm.memory);
                        println!("Disk:     {}GB", vm.disk);
                        println!("Image:    {}", vm.image);
                        if let Some(ip) = &vm.ip {
                            println!("IP:       {}", ip);
                        }
                        if let Some(host) = &vm.hostname {
                            println!("Hostname: {}", host);
                        }
                        if let Some(tags) = &vm.tags {
                            println!("Tags:     {}", tags.join(", "));
                        }
                        if let Some(labels) = &vm.labels {
                            let l: Vec<String> =
                                labels.iter().map(|(k, v)| format!("{}={}", k, v)).collect();
                            println!("Labels:   {}", l.join(", "));
                        }
                    }
                    _ => println!("{}", format_output(&vm, fmt)?),
                }
            }

            Commands::Create {
                name,
                image,
                cpus,
                memory,
                disk,
                hostname,
                tags,
                label,
            } => {
                let labels =
                    label.map(|pairs| pairs.into_iter().collect::<HashMap<String, String>>());
                let req = CreateVMRequest {
                    name: name.clone(),
                    image,
                    cpus,
                    memory,
                    disk,
                    hostname,
                    tags,
                    labels,
                };
                let vm: VM = client
                    .post(format!("{}/vms", API_BASE))
                    .json(&req)
                    .send()
                    .await?
                    .json()
                    .await?;
                match fmt {
                    OutputFormat::Table => println!("VM '{}' created successfully", name),
                    _ => println!("{}", format_output(&vm, fmt)?),
                }
            }

            Commands::Start { name } => {
                client
                    .post(format!("{}/vms/{}/start", API_BASE, name))
                    .send()
                    .await?;
                println!("VM '{}' started", name);
            }

            Commands::Stop { name } => {
                client
                    .post(format!("{}/vms/{}/stop", API_BASE, name))
                    .send()
                    .await?;
                println!("VM '{}' stopped", name);
            }

            Commands::Restart { name } => {
                client
                    .post(format!("{}/vms/{}/restart", API_BASE, name))
                    .send()
                    .await?;
                println!("VM '{}' restarted", name);
            }

            Commands::Delete { name } => {
                client
                    .delete(format!("{}/vms/{}", API_BASE, name))
                    .send()
                    .await?;
                println!("VM '{}' deleted", name);
            }

            Commands::Metrics { name } => {
                let val = api_get(&client, &format!("/vms/{}/metrics", name)).await?;
                print_value(&val, fmt);
            }

            // ── Apply / Export ────────────────────────────────────────────
            Commands::Apply { file } => {
                let config = load_config_file(&file)?;
                let kind = config.get("kind").and_then(|v| v.as_str())
                    .context("Config must have a 'kind' field (vm, firewall-profile, network-policy, service, qos-policy, dns-zone, dns-policy, vpn-tunnel, vpn-network, mirror-session, nat-rule, nat-pool, nat-gateway, monitor-policy, bridge, vlan, bond, port-forward)")?;

                let spec = config.get("spec").unwrap_or(&config);
                let (method, path) = match kind {
                    "vm" => ("POST", "/vms"),
                    "firewall-profile" => ("POST", "/firewall-profiles"),
                    "firewall-zone" => ("POST", "/firewall-zones"),
                    "network-policy" => ("POST", "/network-policies"),
                    "service" => ("POST", "/services"),
                    "qos-policy" => ("POST", "/qos-policies"),
                    "dns-zone" => ("POST", "/dns-zones"),
                    "dns-policy" => ("POST", "/dns-policies"),
                    "vpn-tunnel" => ("POST", "/vpn-tunnels"),
                    "vpn-network" => ("POST", "/vpn-networks"),
                    "mirror-session" => ("POST", "/mirror-sessions"),
                    "nat-rule" => ("POST", "/nat-rules"),
                    "nat-pool" => ("POST", "/nat-pools"),
                    "nat-gateway" => ("POST", "/nat-gateways"),
                    "monitor-policy" => ("POST", "/monitor-policies"),
                    "ceph-pool" => ("POST", "/storage/pools/ceph"),
                    "bridge" => ("POST", "/networkd/bridges"),
                    "vlan" => ("POST", "/networkd/vlans"),
                    "bond" => ("POST", "/networkd/bonds"),
                    "port-forward" => ("POST", "/networkd/port-forwards"),
                    _ => anyhow::bail!("Unknown resource kind: {}", kind),
                };

                let result = if method == "POST" {
                    api_post(&client, path, spec).await?
                } else {
                    api_put(&client, path, spec).await?
                };
                println!("Applied {} successfully", kind);
                if !matches!(fmt, OutputFormat::Table) {
                    print_value(&result, fmt);
                }
            }

            Commands::Export { resource } => {
                let path = match resource.as_str() {
                    "vm" | "vms" => "/vms",
                    "firewall" | "firewall-profiles" => "/firewall-profiles",
                    "firewall-zones" => "/firewall-zones",
                    "network-policy" | "network-policies" => "/network-policies",
                    "service" | "services" => "/services",
                    "qos" | "qos-policies" => "/qos-policies",
                    "dns-zone" | "dns-zones" => "/dns-zones",
                    "dns-policy" | "dns-policies" => "/dns-policies",
                    "vpn-tunnel" | "vpn-tunnels" => "/vpn-tunnels",
                    "vpn-network" | "vpn-networks" => "/vpn-networks",
                    "mirror" | "mirror-sessions" => "/mirror-sessions",
                    "nat-rule" | "nat-rules" => "/nat-rules",
                    "nat-pool" | "nat-pools" => "/nat-pools",
                    "nat-gateway" | "nat-gateways" => "/nat-gateways",
                    "monitor" | "monitor-policies" => "/monitor-policies",
                    "bridge" | "bridges" => "/networkd/bridges",
                    "vlan" | "vlans" => "/networkd/vlans",
                    "bond" | "bonds" => "/networkd/bonds",
                    "port-forward" | "port-forwards" => "/networkd/port-forwards",
                    _ => anyhow::bail!("Unknown resource: {}", resource),
                };
                let val = api_get(&client, path).await?;
                print_value(&val, fmt);
            }

            // ── Network Policies ─────────────────────────────────────────
            Commands::Policy(cmd) => match cmd {
                PolicyCmd::List => {
                    let val = api_get(&client, "/network-policies").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                PolicyCmd::Get { id } => {
                    let val = api_get(&client, &format!("/network-policies/{}", id)).await?;
                    print_value(&val, fmt);
                }
                PolicyCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/network-policies", &body).await?;
                    println!("Network policy created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                PolicyCmd::Delete { id } => {
                    api_delete(&client, &format!("/network-policies/{}", id)).await?;
                    println!("Network policy '{}' deleted", id);
                }
                PolicyCmd::Sync => {
                    let val = api_post_empty(&client, "/network-policies/sync").await?;
                    print_value(&val, fmt);
                }
                PolicyCmd::Status => {
                    let val = api_get(&client, "/network-policies/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── Firewall ─────────────────────────────────────────────────
            Commands::Firewall(cmd) => match cmd {
                FirewallCmd::List => {
                    let val = api_get(&client, "/firewall-profiles").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                FirewallCmd::Get { id } => {
                    let val = api_get(&client, &format!("/firewall-profiles/{}", id)).await?;
                    print_value(&val, fmt);
                }
                FirewallCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/firewall-profiles", &body).await?;
                    println!("Firewall profile created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                FirewallCmd::Delete { id } => {
                    api_delete(&client, &format!("/firewall-profiles/{}", id)).await?;
                    println!("Firewall profile '{}' deleted", id);
                }
                FirewallCmd::Zones => {
                    let val = api_get(&client, "/firewall-zones").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                FirewallCmd::Assign { vm, profile } => {
                    let body = serde_json::json!({ "profile_id": profile });
                    api_put(&client, &format!("/vms/{}/firewall", vm), &body).await?;
                    println!("Firewall profile '{}' assigned to VM '{}'", profile, vm);
                }
                FirewallCmd::Unassign { vm } => {
                    api_delete(&client, &format!("/vms/{}/firewall", vm)).await?;
                    println!("Firewall removed from VM '{}'", vm);
                }
                FirewallCmd::Sync => {
                    let val = api_post_empty(&client, "/firewall/sync").await?;
                    print_value(&val, fmt);
                }
                FirewallCmd::Status => {
                    let val = api_get(&client, "/firewall/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── Service Mesh ─────────────────────────────────────────────
            Commands::Service(cmd) => match cmd {
                ServiceCmd::List => {
                    let val = api_get(&client, "/services").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                ServiceCmd::Get { id } => {
                    let val = api_get(&client, &format!("/services/{}", id)).await?;
                    print_value(&val, fmt);
                }
                ServiceCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/services", &body).await?;
                    println!("Service created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                ServiceCmd::Delete { id } => {
                    api_delete(&client, &format!("/services/{}", id)).await?;
                    println!("Service '{}' deleted", id);
                }
                ServiceCmd::Backends { id } => {
                    let val = api_get(&client, &format!("/services/{}/backends", id)).await?;
                    print_value(&val, fmt);
                }
                ServiceCmd::Sync => {
                    let val = api_post_empty(&client, "/services/sync").await?;
                    print_value(&val, fmt);
                }
                ServiceCmd::Status => {
                    let val = api_get(&client, "/services/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── QoS ─────────────────────────────────────────────────────
            Commands::Qos(cmd) => match cmd {
                QosCmd::List => {
                    let val = api_get(&client, "/qos-policies").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                QosCmd::Get { id } => {
                    let val = api_get(&client, &format!("/qos-policies/{}", id)).await?;
                    print_value(&val, fmt);
                }
                QosCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/qos-policies", &body).await?;
                    println!("QoS policy created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                QosCmd::Delete { id } => {
                    api_delete(&client, &format!("/qos-policies/{}", id)).await?;
                    println!("QoS policy '{}' deleted", id);
                }
                QosCmd::Sync => {
                    let val = api_post_empty(&client, "/qos-policies/sync").await?;
                    print_value(&val, fmt);
                }
                QosCmd::Status => {
                    let val = api_get(&client, "/qos-policies/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── DNS ──────────────────────────────────────────────────────
            Commands::Dns(cmd) => match cmd {
                DnsCmd::Zones => {
                    let val = api_get(&client, "/dns-zones").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                DnsCmd::Policies => {
                    let val = api_get(&client, "/dns-policies").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                DnsCmd::GetZone { id } => {
                    let val = api_get(&client, &format!("/dns-zones/{}", id)).await?;
                    print_value(&val, fmt);
                }
                DnsCmd::CreateZone { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/dns-zones", &body).await?;
                    println!("DNS zone created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                DnsCmd::DeleteZone { id } => {
                    api_delete(&client, &format!("/dns-zones/{}", id)).await?;
                    println!("DNS zone '{}' deleted", id);
                }
                DnsCmd::CreatePolicy { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/dns-policies", &body).await?;
                    println!("DNS policy created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                DnsCmd::DeletePolicy { id } => {
                    api_delete(&client, &format!("/dns-policies/{}", id)).await?;
                    println!("DNS policy '{}' deleted", id);
                }
                DnsCmd::Records => {
                    let val = api_get(&client, "/dns-records").await?;
                    print_value(&val, fmt);
                }
                DnsCmd::Sync => {
                    let val = api_post_empty(&client, "/dns-policies/sync").await?;
                    print_value(&val, fmt);
                }
            },

            // ── VPN ──────────────────────────────────────────────────────
            Commands::Vpn(cmd) => match cmd {
                VpnCmd::Tunnels => {
                    let val = api_get(&client, "/vpn-tunnels").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                VpnCmd::Networks => {
                    let val = api_get(&client, "/vpn-networks").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                VpnCmd::GetTunnel { id } => {
                    let val = api_get(&client, &format!("/vpn-tunnels/{}", id)).await?;
                    print_value(&val, fmt);
                }
                VpnCmd::CreateTunnel { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/vpn-tunnels", &body).await?;
                    println!("VPN tunnel created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                VpnCmd::DeleteTunnel { id } => {
                    api_delete(&client, &format!("/vpn-tunnels/{}", id)).await?;
                    println!("VPN tunnel '{}' deleted", id);
                }
                VpnCmd::CreateNetwork { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/vpn-networks", &body).await?;
                    println!("VPN network created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                VpnCmd::DeleteNetwork { id } => {
                    api_delete(&client, &format!("/vpn-networks/{}", id)).await?;
                    println!("VPN network '{}' deleted", id);
                }
                VpnCmd::Sync => {
                    let val = api_post_empty(&client, "/vpn-tunnels/sync").await?;
                    print_value(&val, fmt);
                }
                VpnCmd::Status => {
                    let val = api_get(&client, "/vpn-tunnels/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── Mirror ───────────────────────────────────────────────────
            Commands::Mirror(cmd) => match cmd {
                MirrorCmd::List => {
                    let val = api_get(&client, "/mirror-sessions").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                MirrorCmd::Get { id } => {
                    let val = api_get(&client, &format!("/mirror-sessions/{}", id)).await?;
                    print_value(&val, fmt);
                }
                MirrorCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/mirror-sessions", &body).await?;
                    println!("Mirror session created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                MirrorCmd::Delete { id } => {
                    api_delete(&client, &format!("/mirror-sessions/{}", id)).await?;
                    println!("Mirror session '{}' deleted", id);
                }
                MirrorCmd::Sync => {
                    let val = api_post_empty(&client, "/mirror-sessions/sync").await?;
                    print_value(&val, fmt);
                }
                MirrorCmd::Status => {
                    let val = api_get(&client, "/mirror-sessions/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── NAT ─────────────────────────────────────────────────────
            Commands::Nat(cmd) => match cmd {
                NatCmd::Rules => {
                    let val = api_get(&client, "/nat-rules").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NatCmd::Pools => {
                    let val = api_get(&client, "/nat-pools").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NatCmd::Gateways => {
                    let val = api_get(&client, "/nat-gateways").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NatCmd::GetRule { id } => {
                    let val = api_get(&client, &format!("/nat-rules/{}", id)).await?;
                    print_value(&val, fmt);
                }
                NatCmd::CreateRule { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/nat-rules", &body).await?;
                    println!("NAT rule created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NatCmd::DeleteRule { id } => {
                    api_delete(&client, &format!("/nat-rules/{}", id)).await?;
                    println!("NAT rule '{}' deleted", id);
                }
                NatCmd::CreatePool { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/nat-pools", &body).await?;
                    println!("NAT pool created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NatCmd::DeletePool { id } => {
                    api_delete(&client, &format!("/nat-pools/{}", id)).await?;
                    println!("NAT pool '{}' deleted", id);
                }
                NatCmd::CreateGateway { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/nat-gateways", &body).await?;
                    println!("NAT gateway created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NatCmd::DeleteGateway { id } => {
                    api_delete(&client, &format!("/nat-gateways/{}", id)).await?;
                    println!("NAT gateway '{}' deleted", id);
                }
                NatCmd::Sync => {
                    let val = api_post_empty(&client, "/nat-rules/sync").await?;
                    print_value(&val, fmt);
                }
                NatCmd::Status => {
                    let val = api_get(&client, "/nat-rules/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── Monitor ──────────────────────────────────────────────────
            Commands::Monitor(cmd) => match cmd {
                MonitorCmd::List => {
                    let val = api_get(&client, "/monitor-policies").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                MonitorCmd::Get { id } => {
                    let val = api_get(&client, &format!("/monitor-policies/{}", id)).await?;
                    print_value(&val, fmt);
                }
                MonitorCmd::Create { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/monitor-policies", &body).await?;
                    println!("Monitor policy created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                MonitorCmd::Delete { id } => {
                    api_delete(&client, &format!("/monitor-policies/{}", id)).await?;
                    println!("Monitor policy '{}' deleted", id);
                }
                MonitorCmd::Metrics => {
                    let val = api_get(&client, "/network-metrics").await?;
                    print_value(&val, fmt);
                }
                MonitorCmd::VmMetrics { name } => {
                    let val = api_get(&client, &format!("/network-metrics/{}", name)).await?;
                    print_value(&val, fmt);
                }
                MonitorCmd::Alerts => {
                    let val = api_get(&client, "/bandwidth-alerts").await?;
                    print_value(&val, fmt);
                }
                MonitorCmd::Sync => {
                    let val = api_post_empty(&client, "/monitor-policies/sync").await?;
                    print_value(&val, fmt);
                }
                MonitorCmd::Status => {
                    let val = api_get(&client, "/monitor-policies/status").await?;
                    print_value(&val, fmt);
                }
            },

            // ── Ceph ──────────────────────────────────────────────────────
            Commands::Ceph(cmd) => match cmd {
                CephCmd::Create {
                    name,
                    monitors,
                    pool,
                    user,
                    keyring,
                    auto_start,
                } => {
                    let body = serde_json::json!({
                        "name": name,
                        "monitors": monitors.split(',').map(|s| s.trim()).collect::<Vec<_>>(),
                        "pool_name": pool,
                        "user": user,
                        "keyring": keyring,
                        "auto_start": auto_start,
                    });
                    let val = api_post(&client, "/storage/pools/ceph", &body).await?;
                    println!("Ceph pool '{}' created", name);
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                CephCmd::Pools => {
                    let val = api_get(&client, "/storage/pools").await?;
                    print_value(&val, fmt);
                }
                CephCmd::Health { name } => {
                    let val = api_get(&client, &format!("/storage/pools/{}/health", name)).await?;
                    print_value(&val, fmt);
                }
                CephCmd::Stats { name } => {
                    let val = api_get(&client, &format!("/storage/pools/{}/stats", name)).await?;
                    print_value(&val, fmt);
                }
                CephCmd::Images { name } => {
                    let val = api_get(&client, &format!("/storage/pools/{}/images", name)).await?;
                    print_value(&val, fmt);
                }
                CephCmd::CreateImage { pool, name, size } => {
                    let body = serde_json::json!({ "name": name, "size_mb": size });
                    api_post(&client, &format!("/storage/pools/{}/images", pool), &body).await?;
                    println!(
                        "RBD image '{}' created in pool '{}' ({}MB)",
                        name, pool, size
                    );
                }
                CephCmd::DeleteImage { pool, name } => {
                    api_delete(&client, &format!("/storage/pools/{}/images/{}", pool, name))
                        .await?;
                    println!("RBD image '{}' deleted from pool '{}'", name, pool);
                }
                CephCmd::Delete { name } => {
                    api_delete(&client, &format!("/storage/pools/{}", name)).await?;
                    println!("Storage pool '{}' deleted", name);
                }
            },

            // ── Networkd ─────────────────────────────────────────────────
            Commands::Net(cmd) => match cmd {
                NetCmd::Bridges => {
                    let val = api_get(&client, "/networkd/bridges").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NetCmd::Vlans => {
                    let val = api_get(&client, "/networkd/vlans").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NetCmd::Bonds => {
                    let val = api_get(&client, "/networkd/bonds").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NetCmd::Taps => {
                    let val = api_get(&client, "/networkd/taps").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NetCmd::Forwards => {
                    let val = api_get(&client, "/networkd/port-forwards").await?;
                    print_resources(val.as_array().unwrap_or(&vec![]), fmt);
                }
                NetCmd::CreateBridge { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/networkd/bridges", &body).await?;
                    println!("Bridge created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NetCmd::CreateVlan { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/networkd/vlans", &body).await?;
                    println!("VLAN created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NetCmd::CreateBond { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/networkd/bonds", &body).await?;
                    println!("Bond created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NetCmd::CreateForward { file } => {
                    let body = load_config_file(&file)?;
                    let val = api_post(&client, "/networkd/port-forwards", &body).await?;
                    println!("Port forward created");
                    if !matches!(fmt, OutputFormat::Table) {
                        print_value(&val, fmt);
                    }
                }
                NetCmd::SyncForwards => {
                    let val = api_post_empty(&client, "/networkd/port-forwards/sync").await?;
                    print_value(&val, fmt);
                }
                NetCmd::Reload => {
                    api_post_void(&client, "/networkd/reload").await?;
                    println!("networkd reloaded");
                }
                NetCmd::Links => {
                    let val = api_get(&client, "/networkd/links").await?;
                    print_value(&val, fmt);
                }
            },
        }

        Ok(())
    }
}
