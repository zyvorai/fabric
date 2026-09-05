// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! `VmDataplaneDriver` backed by FluxVM Network Fabric v3
//! (`/v1/vms/{id}/network/{policy,status,stats,flows}`).

use anyhow::Result;
use async_trait::async_trait;
use zyvor_fabric_driver_core::{
    DataplaneStats, DataplaneStatus, FlowRecord, VmDataplaneDriver, VmNetworkPolicy,
};
use zyvor_fabric_fluxvm_client as client;

use crate::FluxVmDriver;

fn to_policy(p: client::VmNetworkPolicy) -> VmNetworkPolicy {
    VmNetworkPolicy {
        default_allow: p.default_allow,
        allow_cidrs: p.allow_cidrs,
        allow_ports: p.allow_ports,
        max_egress_mbps: p.max_egress_mbps,
        max_egress_pps: p.max_egress_pps,
        sample_rate: p.sample_rate,
    }
}

fn from_policy(p: &VmNetworkPolicy) -> client::VmNetworkPolicy {
    client::VmNetworkPolicy {
        default_allow: p.default_allow,
        allow_cidrs: p.allow_cidrs.clone(),
        allow_ports: p.allow_ports.clone(),
        max_egress_mbps: p.max_egress_mbps,
        max_egress_pps: p.max_egress_pps,
        sample_rate: p.sample_rate,
    }
}

fn to_status(s: client::DataplaneStatus) -> DataplaneStatus {
    DataplaneStatus {
        mode: s.mode,
        required: s.required,
        attached: s.attached,
        interface: s.interface,
        identity: s.identity,
        pin_dir: s.pin_dir,
        schema_version: s.schema_version,
        schema_compatible: s.schema_compatible,
        policy_synced: s.policy_synced,
        policy: to_policy(s.policy),
    }
}

fn to_stats(s: client::DataplaneStats) -> DataplaneStats {
    DataplaneStats {
        allowed_packets: s.allowed_packets,
        allowed_bytes: s.allowed_bytes,
        dropped_packets: s.dropped_packets,
        dropped_bytes: s.dropped_bytes,
    }
}

fn to_flow(f: client::FlowRecord) -> FlowRecord {
    FlowRecord {
        identity: f.identity,
        family: f.family,
        source: f.source,
        destination: f.destination,
        source_port: f.source_port,
        destination_port: f.destination_port,
        protocol: f.protocol,
        verdict: f.verdict,
        packets: f.packets,
        bytes: f.bytes,
        last_seen_ns: f.last_seen_ns,
    }
}

#[async_trait]
impl VmDataplaneDriver for FluxVmDriver {
    async fn dataplane_status(&self, name: &str) -> Result<DataplaneStatus> {
        let vm = self.resolve(name).await?;
        Ok(to_status(self.client.network_status(vm.id).await?))
    }

    async fn get_dataplane_policy(&self, name: &str) -> Result<VmNetworkPolicy> {
        let vm = self.resolve(name).await?;
        Ok(to_policy(self.client.get_network_policy(vm.id).await?))
    }

    async fn set_dataplane_policy(
        &self,
        name: &str,
        policy: &VmNetworkPolicy,
    ) -> Result<VmNetworkPolicy> {
        let vm = self.resolve(name).await?;
        Ok(to_policy(
            self.client
                .set_network_policy(vm.id, &from_policy(policy))
                .await?,
        ))
    }

    async fn dataplane_stats(&self, name: &str) -> Result<DataplaneStats> {
        let vm = self.resolve(name).await?;
        Ok(to_stats(self.client.network_stats(vm.id).await?))
    }

    async fn dataplane_flows(&self, name: &str, limit: Option<usize>) -> Result<Vec<FlowRecord>> {
        let vm = self.resolve(name).await?;
        Ok(self
            .client
            .network_flows(vm.id, limit)
            .await?
            .into_iter()
            .map(to_flow)
            .collect())
    }
}
