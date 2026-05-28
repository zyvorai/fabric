// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use std::collections::HashSet;

use chrono::Utc;
use nat_gateway::models::{NatProtocol, NatRule, NatRuleType};
use networking::host_firewalld::{self, DiscoveredFirewalldZone};
use networking::host_nat::{self, DiscoveredHostNatRule};
use networking::host_nft_filter::{self, DiscoveredNftFilterChain};
use networking::host_services::{self, HostListener};
use networking::host_tc::{self, DiscoveredTcQdisc};
use service_mesh::models::{LoadBalancerAlgorithm, Service, ServicePort, ServiceProtocol};
use traffic_shaping::models::{BandwidthRate, BandwidthUnit, QoSPolicy, TrafficClass};
use vm_firewall::models::{FirewallAction, FirewallProfile, FirewallZone};
use uuid::Uuid;

use crate::server::AppState;

pub fn is_host_managed_nat(rule: &NatRule) -> bool {
    !rule.managed
}

pub fn is_host_managed_service(service: &Service) -> bool {
    !service.managed
}

pub fn is_host_managed_zone(zone: &FirewallZone) -> bool {
    !zone.managed
}

pub fn is_host_managed_qos(policy: &QoSPolicy) -> bool {
    !policy.managed
}

pub fn is_host_managed_profile(profile: &FirewallProfile) -> bool {
    !profile.managed
}

fn host_nat_uuid(key: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_DNS,
        format!("vmspawnd:host:nat:{key}").as_bytes(),
    )
}

fn host_service_uuid(key: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_DNS,
        format!("vmspawnd:host:svc:{key}").as_bytes(),
    )
}

fn host_zone_uuid(name: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_DNS,
        format!("vmspawnd:host:fwzone:{name}").as_bytes(),
    )
}

fn host_qos_uuid(key: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_DNS,
        format!("vmspawnd:host:qos:{key}").as_bytes(),
    )
}

fn host_profile_uuid(key: &str) -> Uuid {
    Uuid::new_v5(
        &Uuid::NAMESPACE_DNS,
        format!("vmspawnd:host:fwprof:{key}").as_bytes(),
    )
}

fn discovered_to_nat_rule(d: DiscoveredHostNatRule) -> NatRule {
    let rule_type = match d.rule_type.as_str() {
        "snat" => NatRuleType::Snat,
        "dnat" => NatRuleType::Dnat,
        "hairpin" => NatRuleType::Hairpin,
        _ => NatRuleType::Masquerade,
    };
    let protocol = match d.protocol.as_deref() {
        Some("tcp") => NatProtocol::Tcp,
        Some("udp") => NatProtocol::Udp,
        _ => NatProtocol::Any,
    };
    let now = Utc::now();
    NatRule {
        id: host_nat_uuid(&d.key),
        name: d.name,
        description: d.description,
        rule_type,
        selector: Default::default(),
        protocol,
        source_cidr: d.source_cidr,
        dest_cidr: d.dest_cidr,
        dest_port: d.dest_port,
        dest_port_end: None,
        translate_to: d.translate_to,
        translate_port: d.translate_port,
        pool_id: None,
        outbound_interface: d.outbound_interface,
        enabled: true,
        managed: false,
        created: now,
        updated: now,
    }
}

fn listener_to_service(l: HostListener) -> Service {
    let protocol = if l.protocol == "udp" {
        ServiceProtocol::Udp
    } else {
        ServiceProtocol::Tcp
    };
    let bind_ip = if l.bind_address.is_empty() || l.bind_address == "*" {
        "0.0.0.0".to_string()
    } else {
        l.bind_address.clone()
    };
    let now = Utc::now();
    Service {
        id: host_service_uuid(&l.key),
        name: l.name,
        description: l.description,
        virtual_ip: bind_ip,
        selector: Default::default(),
        ports: vec![ServicePort {
            port: l.port,
            target_port: Some(l.port),
            protocol,
        }],
        algorithm: LoadBalancerAlgorithm::RoundRobin,
        health_check: Default::default(),
        enabled: true,
        managed: false,
        created: now,
        updated: now,
    }
}

pub fn discover_host_nat_rules() -> Vec<NatRule> {
    host_nat::discover_host_nat_rules()
        .unwrap_or_else(|e| {
            tracing::warn!("host NAT discovery failed: {}", e);
            Vec::new()
        })
        .into_iter()
        .map(discovered_to_nat_rule)
        .collect()
}

fn firewalld_to_zone(d: DiscoveredFirewalldZone) -> FirewallZone {
    let now = Utc::now();
    FirewallZone {
        id: host_zone_uuid(&d.name),
        name: d.name,
        description: d.description,
        default_profile_id: None,
        managed: false,
        created: now,
        updated: now,
    }
}

pub fn discover_host_firewall_zones() -> Vec<FirewallZone> {
    host_firewalld::discover_firewalld_zones()
        .unwrap_or_else(|e| {
            tracing::warn!("firewalld zone discovery failed: {}", e);
            Vec::new()
        })
        .into_iter()
        .map(firewalld_to_zone)
        .collect()
}

pub fn discover_host_services() -> Vec<Service> {
    host_services::discover_host_listeners()
        .unwrap_or_else(|e| {
            tracing::warn!("host listener discovery failed: {}", e);
            Vec::new()
        })
        .into_iter()
        .map(listener_to_service)
        .collect()
}

pub fn merge_nat_rules(_state: &AppState, mut items: Vec<NatRule>) -> Vec<NatRule> {
    let mut known_ids: HashSet<Uuid> = items.iter().map(|r| r.id).collect();
    let mut known_names: HashSet<String> = items.iter().map(|r| r.name.clone()).collect();

    for host in discover_host_nat_rules() {
        if known_ids.contains(&host.id) || known_names.contains(&host.name) {
            continue;
        }
        known_ids.insert(host.id);
        known_names.insert(host.name.clone());
        items.push(host);
    }
    items
}

pub fn merge_services(_state: &AppState, mut items: Vec<Service>) -> Vec<Service> {
    let mut known_ids: HashSet<Uuid> = items.iter().map(|s| s.id).collect();
    let mut known_names: HashSet<String> = items.iter().map(|s| s.name.clone()).collect();

    for host in discover_host_services() {
        if known_ids.contains(&host.id) || known_names.contains(&host.name) {
            continue;
        }
        known_ids.insert(host.id);
        known_names.insert(host.name.clone());
        items.push(host);
    }
    items
}

pub fn find_host_nat_rule(_state: &AppState, id: &str) -> Option<NatRule> {
    let uuid = Uuid::parse_str(id).ok()?;
    merge_nat_rules(_state, vec![])
        .into_iter()
        .find(|r| r.id == uuid)
}

pub fn find_host_service(_state: &AppState, id: &str) -> Option<Service> {
    let uuid = Uuid::parse_str(id).ok()?;
    merge_services(_state, vec![])
        .into_iter()
        .find(|s| s.id == uuid)
}

pub fn merge_firewall_zones(_state: &AppState, mut items: Vec<FirewallZone>) -> Vec<FirewallZone> {
    let mut known_ids: HashSet<Uuid> = items.iter().map(|z| z.id).collect();
    let mut known_names: HashSet<String> = items.iter().map(|z| z.name.clone()).collect();

    for host in discover_host_firewall_zones() {
        if known_ids.contains(&host.id) || known_names.contains(&host.name) {
            continue;
        }
        known_ids.insert(host.id);
        known_names.insert(host.name.clone());
        items.push(host);
    }
    items
}

pub fn find_host_firewall_zone(_state: &AppState, id: &str) -> Option<FirewallZone> {
    let uuid = Uuid::parse_str(id).ok()?;
    merge_firewall_zones(_state, vec![])
        .into_iter()
        .find(|z| z.id == uuid)
}

fn tc_to_qos(d: DiscoveredTcQdisc) -> QoSPolicy {
    let rate = d.rate_kbit.unwrap_or(100).max(1);
    let ceil = d.ceil_kbit.unwrap_or(rate).max(rate);
    let now = Utc::now();
    QoSPolicy {
        id: host_qos_uuid(&d.key),
        name: d.name,
        description: d.description,
        interface: d.interface,
        selector: Default::default(),
        traffic_class: TrafficClass {
            name: d.kind,
            guaranteed_rate: BandwidthRate {
                value: rate,
                unit: BandwidthUnit::Kbit,
            },
            max_rate: BandwidthRate {
                value: ceil,
                unit: BandwidthUnit::Kbit,
            },
            burst: None,
            priority: 4,
        },
        enabled: true,
        managed: false,
        created: now,
        updated: now,
    }
}

fn nft_chain_to_profile(d: DiscoveredNftFilterChain) -> FirewallProfile {
    let default_action = if d.default_action.eq_ignore_ascii_case("accept") {
        FirewallAction::Accept
    } else {
        FirewallAction::Drop
    };
    let now = Utc::now();
    FirewallProfile {
        id: host_profile_uuid(&d.key),
        name: d.name,
        description: d.description,
        default_action,
        rules: Vec::new(),
        managed: false,
        created: now,
        updated: now,
    }
}

pub fn discover_host_qos_policies() -> Vec<QoSPolicy> {
    host_tc::discover_host_tc_qdiscs()
        .unwrap_or_else(|e| {
            tracing::warn!("host tc discovery failed: {}", e);
            Vec::new()
        })
        .into_iter()
        .map(tc_to_qos)
        .collect()
}

pub fn discover_host_firewall_profiles() -> Vec<FirewallProfile> {
    host_nft_filter::discover_host_nft_filter_chains()
        .unwrap_or_else(|e| {
            tracing::warn!("host nft filter discovery failed: {}", e);
            Vec::new()
        })
        .into_iter()
        .map(nft_chain_to_profile)
        .collect()
}

pub fn merge_qos_policies(_state: &AppState, mut items: Vec<QoSPolicy>) -> Vec<QoSPolicy> {
    let mut known_ids: HashSet<Uuid> = items.iter().map(|p| p.id).collect();
    let mut known_names: HashSet<String> = items.iter().map(|p| p.name.clone()).collect();

    for host in discover_host_qos_policies() {
        if known_ids.contains(&host.id) || known_names.contains(&host.name) {
            continue;
        }
        known_ids.insert(host.id);
        known_names.insert(host.name.clone());
        items.push(host);
    }
    items
}

pub fn merge_firewall_profiles(
    _state: &AppState,
    mut items: Vec<FirewallProfile>,
) -> Vec<FirewallProfile> {
    let mut known_ids: HashSet<Uuid> = items.iter().map(|p| p.id).collect();
    let mut known_names: HashSet<String> = items.iter().map(|p| p.name.clone()).collect();

    for host in discover_host_firewall_profiles() {
        if known_ids.contains(&host.id) || known_names.contains(&host.name) {
            continue;
        }
        known_ids.insert(host.id);
        known_names.insert(host.name.clone());
        items.push(host);
    }
    items
}

pub fn find_host_qos_policy(_state: &AppState, id: &str) -> Option<QoSPolicy> {
    let uuid = Uuid::parse_str(id).ok()?;
    merge_qos_policies(_state, vec![])
        .into_iter()
        .find(|p| p.id == uuid)
}

pub fn find_host_firewall_profile(_state: &AppState, id: &str) -> Option<FirewallProfile> {
    let uuid = Uuid::parse_str(id).ok()?;
    merge_firewall_profiles(_state, vec![])
        .into_iter()
        .find(|p| p.id == uuid)
}
