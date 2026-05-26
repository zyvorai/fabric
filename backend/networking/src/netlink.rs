// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use futures::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use netlink_packet_route::link::{
    LinkAttribute, LinkFlags, LinkInfo, InfoKind, LinkLayerType,
};
use netlink_packet_route::address::{AddressAttribute, AddressScope};
use netlink_packet_route::AddressFamily;

/// Network interface information retrieved via netlink.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetlinkInterface {
    pub index: u32,
    pub name: String,
    pub mac: String,
    pub mtu: u32,
    pub state: String,
    pub link_type: String,
    pub flags: Vec<String>,
    pub addresses: Vec<InterfaceAddress>,
    pub master_index: Option<u32>,
    pub master_name: Option<String>,
    pub kind: Option<String>,
    pub speed_mbps: Option<u32>,
}

/// IP address assigned to an interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceAddress {
    pub address: String,
    pub prefix_len: u8,
    pub family: String,
    pub scope: String,
}

/// List all network interfaces via netlink.
pub async fn list_interfaces() -> Result<Vec<NetlinkInterface>> {
    let (conn, handle, _) = rtnetlink::new_connection()?;
    tokio::spawn(conn);

    let mut links = handle.link().get().execute();
    let mut ifaces: Vec<NetlinkInterface> = Vec::new();
    let mut index_to_name: HashMap<u32, String> = HashMap::new();

    while let Some(msg) = links.try_next().await? {
        let header = &msg.header;
        let index = header.index;
        let lf = header.flags;
        let state = if lf.contains(LinkFlags::Up) { "up" } else { "down" };

        let mut name = String::new();
        let mut mac = String::new();
        let mut mtu: u32 = 0;
        let mut kind: Option<String> = None;
        let mut master_index: Option<u32> = None;

        for attr in &msg.attributes {
            match attr {
                LinkAttribute::IfName(n) => name = n.clone(),
                LinkAttribute::Address(bytes) => {
                    mac = bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(":");
                }
                LinkAttribute::Mtu(m) => mtu = *m,
                LinkAttribute::Controller(m) => master_index = Some(*m),
                LinkAttribute::LinkInfo(infos) => {
                    for info in infos {
                        if let LinkInfo::Kind(k) = info {
                            kind = Some(match k {
                                InfoKind::Bridge => "bridge".to_string(),
                                InfoKind::Bond => "bond".to_string(),
                                InfoKind::Vlan => "vlan".to_string(),
                                InfoKind::Vxlan => "vxlan".to_string(),
                                InfoKind::MacVlan => "macvlan".to_string(),
                                InfoKind::MacVtap => "macvtap".to_string(),
                                InfoKind::Tun => "tun".to_string(),
                                InfoKind::Veth => "veth".to_string(),
                                InfoKind::Dummy => "dummy".to_string(),
                                InfoKind::Other(s) => s.clone(),
                                _ => format!("{:?}", k),
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        let link_type = match header.link_layer_type {
            LinkLayerType::Ether => "ether",
            LinkLayerType::Loopback => "loopback",
            _ => "other",
        };

        let mut flag_names = Vec::new();
        if lf.contains(LinkFlags::Up) { flag_names.push("UP".to_string()); }
        if lf.contains(LinkFlags::Broadcast) { flag_names.push("BROADCAST".to_string()); }
        if lf.contains(LinkFlags::Loopback) { flag_names.push("LOOPBACK".to_string()); }
        if lf.contains(LinkFlags::Pointopoint) { flag_names.push("POINTOPOINT".to_string()); }
        if lf.contains(LinkFlags::Multicast) { flag_names.push("MULTICAST".to_string()); }
        if lf.contains(LinkFlags::Running) { flag_names.push("RUNNING".to_string()); }
        if lf.contains(LinkFlags::LowerUp) { flag_names.push("LOWER_UP".to_string()); }

        index_to_name.insert(index, name.clone());

        ifaces.push(NetlinkInterface {
            index,
            name,
            mac,
            mtu,
            state: state.to_string(),
            link_type: link_type.to_string(),
            flags: flag_names,
            addresses: Vec::new(),
            master_index,
            master_name: None,
            kind,
            speed_mbps: None,
        });
    }

    // Resolve master names
    for iface in &mut ifaces {
        if let Some(mi) = iface.master_index {
            iface.master_name = index_to_name.get(&mi).cloned();
        }
    }

    // Get addresses via netlink
    let mut addrs = handle.address().get().execute();
    while let Some(msg) = addrs.try_next().await? {
        let if_index = msg.header.index;
        let prefix_len = msg.header.prefix_len;
        let family = match msg.header.family {
            AddressFamily::Inet => "inet",
            AddressFamily::Inet6 => "inet6",
            _ => "unknown",
        };
        let scope = match msg.header.scope {
            AddressScope::Universe => "global",
            AddressScope::Link => "link",
            AddressScope::Host => "host",
            AddressScope::Site => "site",
            _ => "other",
        };

        let mut addr_str = String::new();
        for attr in &msg.attributes {
            if let AddressAttribute::Address(ip) = attr {
                addr_str = ip.to_string();
            }
        }

        if !addr_str.is_empty() {
            if let Some(iface) = ifaces.iter_mut().find(|i| i.index == if_index) {
                iface.addresses.push(InterfaceAddress {
                    address: addr_str,
                    prefix_len,
                    family: family.to_string(),
                    scope: scope.to_string(),
                });
            }
        }
    }

    // Get link speeds from sysfs
    for iface in &mut ifaces {
        if iface.link_type == "ether" {
            if let Ok(speed) = std::fs::read_to_string(format!("/sys/class/net/{}/speed", iface.name)) {
                if let Ok(s) = speed.trim().parse::<i32>() {
                    if s > 0 {
                        iface.speed_mbps = Some(s as u32);
                    }
                }
            }
        }
    }

    Ok(ifaces)
}

/// List all non-loopback interfaces.
pub async fn list_physical_interfaces() -> Result<Vec<NetlinkInterface>> {
    let all = list_interfaces().await?;
    Ok(all.into_iter().filter(|i| i.name != "lo").collect())
}

/// List all non-loopback interfaces that are not already enslaved.
pub async fn list_available_interfaces() -> Result<Vec<NetlinkInterface>> {
    let all = list_interfaces().await?;
    Ok(all.into_iter().filter(|i| {
        i.name != "lo" && i.master_index.is_none()
    }).collect())
}
