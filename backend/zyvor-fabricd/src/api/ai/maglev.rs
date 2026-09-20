// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Maglev ServiceSpec builder for AI inference endpoints (preview).

use zyvor_fabric_fluxvm_client::{
    NetworkServiceAlgorithm, NetworkServiceBackend, NetworkServiceExposure, NetworkServiceMode,
    NetworkServiceProtocol, NetworkServiceSpec,
};

use super::types::InferenceReplica;

/// Build an equal-weight Maglev service from ready replicas.
pub fn build_maglev_service_spec(
    name: &str,
    vip: &str,
    port: u16,
    replicas: &[InferenceReplica],
    max_egress_mbps: Option<u32>,
) -> NetworkServiceSpec {
    build_maglev_service_spec_weighted(name, vip, port, replicas, max_egress_mbps)
}

/// Build a Maglev service using each replica's `maglev_weight` (default 1).
pub fn build_maglev_service_spec_weighted(
    name: &str,
    vip: &str,
    port: u16,
    replicas: &[InferenceReplica],
    max_egress_mbps: Option<u32>,
) -> NetworkServiceSpec {
    let backends: Vec<NetworkServiceBackend> = replicas
        .iter()
        .filter(|r| r.ready)
        .filter_map(|r| {
            let address = r.address.as_ref()?;
            let weight = r.maglev_weight.unwrap_or(1).clamp(1, 32);
            Some(NetworkServiceBackend {
                address: address.clone(),
                port,
                weight,
                enabled: true,
                state: Default::default(),
                drain_until_unix_ms: None,
            })
        })
        .collect();

    NetworkServiceSpec {
        name: name.to_string(),
        vip: vip.to_string(),
        port,
        protocol: NetworkServiceProtocol::Tcp,
        algorithm: NetworkServiceAlgorithm::Maglev,
        mode: NetworkServiceMode::Nat,
        exposure: NetworkServiceExposure::EastWest,
        backends,
        maglev_table_size: None,
        snat_address: None,
        health_check: None,
        advertise: false,
        max_egress_mbps,
        flow_sample_rate: 0,
        host_routing: false,
    }
}

/// Mark a backend draining by address (scale-down / delete path).
pub fn drain_backend(spec: &mut NetworkServiceSpec, address: &str) {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    for b in &mut spec.backends {
        if b.address == address {
            b.enabled = false;
            b.state = zyvor_fabric_fluxvm_client::NetworkBackendState::Draining;
            b.drain_until_unix_ms = Some(now_ms.saturating_add(30_000));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::ai::types::InferenceReplica;

    #[test]
    fn equal_weights_only_ready_with_address() {
        let replicas = vec![
            InferenceReplica {
                vm_name: "a".into(),
                bdf: "0000:01:00.0".into(),
                ready: true,
                address: Some("10.0.0.1".into()),
                metrics: None,
                maglev_weight: None,
                site: None,
                cost_tier: None,
                draining: false,
            },
            InferenceReplica {
                vm_name: "b".into(),
                bdf: "0000:02:00.0".into(),
                ready: false,
                address: Some("10.0.0.2".into()),
                metrics: None,
                maglev_weight: None,
                site: None,
                cost_tier: None,
                draining: false,
            },
            InferenceReplica {
                vm_name: "c".into(),
                bdf: "0000:03:00.0".into(),
                ready: true,
                address: None,
                metrics: None,
                maglev_weight: None,
                site: None,
                cost_tier: None,
                draining: false,
            },
        ];
        let spec = build_maglev_service_spec("ai-llm", "10.96.0.50", 8000, &replicas, Some(1000));
        assert_eq!(spec.backends.len(), 1);
        assert_eq!(spec.backends[0].weight, 1);
        assert_eq!(spec.backends[0].address, "10.0.0.1");
        assert_eq!(spec.max_egress_mbps, Some(1000));
        assert!(matches!(spec.algorithm, NetworkServiceAlgorithm::Maglev));
    }

    #[test]
    fn weighted_uses_replica_maglev_weight() {
        let replicas = vec![InferenceReplica {
            vm_name: "a".into(),
            bdf: "0000:01:00.0".into(),
            ready: true,
            address: Some("10.0.0.1".into()),
            metrics: None,
            maglev_weight: Some(8),
            site: None,
            cost_tier: None,
            draining: false,
        }];
        let spec = build_maglev_service_spec_weighted("ai-llm", "10.96.0.50", 8000, &replicas, None);
        assert_eq!(spec.backends[0].weight, 8);
    }

    #[test]
    fn drain_marks_backend() {
        let mut spec = build_maglev_service_spec(
            "ai-llm",
            "10.96.0.50",
            8000,
            &[InferenceReplica {
                vm_name: "a".into(),
                bdf: "0000:01:00.0".into(),
                ready: true,
                address: Some("10.0.0.1".into()),
                metrics: None,
                maglev_weight: None,
                site: None,
                cost_tier: None,
                draining: false,
            }],
            None,
        );
        drain_backend(&mut spec, "10.0.0.1");
        assert!(!spec.backends[0].enabled);
        assert!(matches!(
            spec.backends[0].state,
            zyvor_fabric_fluxvm_client::NetworkBackendState::Draining
        ));
    }
}
