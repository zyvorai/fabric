// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Fabric orchestration for FluxVM Service Fabric v2.
//!
//! Fabric owns service intent, node selection, rollout and rollback. FluxVM
//! owns every TC/XDP program and BPF map. This crate never writes bpffs or
//! invokes `tc`, `ip`, or `bpftool` directly.

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::IpAddr};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceProtocol {
    Tcp,
    Udp,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ServiceAlgorithm {
    #[default]
    Maglev,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ServiceMode {
    #[default]
    Nat,
    Dsr,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ServiceExposure {
    #[default]
    EastWest,
    NorthSouth,
    Both,
}

impl ServiceExposure {
    pub fn north_south(self) -> bool {
        matches!(self, Self::NorthSouth | Self::Both)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServiceBackend {
    pub address: IpAddr,
    pub port: u16,
    #[serde(default = "default_weight")]
    pub weight: u16,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}
fn default_weight() -> u16 {
    1
}
fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServiceSpec {
    pub name: String,
    pub vip: IpAddr,
    pub port: u16,
    pub protocol: ServiceProtocol,
    #[serde(default)]
    pub algorithm: ServiceAlgorithm,
    #[serde(default)]
    pub mode: ServiceMode,
    #[serde(default)]
    pub exposure: ServiceExposure,
    #[serde(default)]
    pub backends: Vec<ServiceBackend>,
    #[serde(default)]
    pub maglev_table_size: Option<u32>,
    #[serde(default)]
    pub snat_address: Option<IpAddr>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NodeTarget {
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostInterfaceStatus {
    pub interface: String,
    pub tc_program_pinned: bool,
    pub xdp_requested: bool,
    pub xdp_program_pinned: bool,
    pub pin_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HostServiceStatus {
    pub schema_version: u32,
    pub north_south_interfaces: Vec<String>,
    pub xdp_acceleration: bool,
    pub interfaces: Vec<HostInterfaceStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApplyReport {
    pub service: String,
    pub applied_nodes: Vec<String>,
    pub rolled_back_nodes: Vec<String>,
}

pub fn validate_spec(spec: &ServiceSpec) -> Result<()> {
    validate_name(&spec.name)?;
    if spec.port == 0 {
        bail!("service port must be non-zero");
    }
    if spec.backends.is_empty() || !spec.backends.iter().any(|b| b.enabled) {
        bail!("service requires at least one enabled backend");
    }
    let v4 = spec.vip.is_ipv4();
    for backend in &spec.backends {
        if backend.address.is_ipv4() != v4 {
            bail!(
                "backend {} family does not match VIP {}",
                backend.address,
                spec.vip
            );
        }
        if backend.port == 0 {
            bail!("backend {} has port zero", backend.address);
        }
        if backend.weight == 0 || backend.weight > 32 {
            bail!("backend weight must be in 1..=32");
        }
        if spec.mode == ServiceMode::Dsr && backend.port != spec.port {
            bail!("DSR backend port must equal the VIP service port");
        }
    }
    if let Some(snat) = spec.snat_address {
        if snat.is_ipv4() != v4 {
            bail!("SNAT family does not match VIP family");
        }
        if spec.mode == ServiceMode::Dsr {
            bail!("DSR cannot be combined with SNAT");
        }
    }
    if spec.exposure.north_south()
        && spec.mode == ServiceMode::Nat
        && spec.snat_address.is_none()
    {
        bail!("north-south NAT requires snat_address");
    }
    if let Some(size) = spec.maglev_table_size {
        if ![251, 509, 1021, 2039, 4093, 8191, 16381].contains(&size) {
            bail!("unsupported Maglev table size {size}");
        }
    }
    Ok(())
}

#[async_trait]
pub trait ServiceNodeClient: Send + Sync {
    async fn get_service(&self, node: &NodeTarget, name: &str) -> Result<Option<ServiceSpec>>;
    async fn get_status(&self, node: &NodeTarget) -> Result<HostServiceStatus>;
    async fn upsert_service(&self, node: &NodeTarget, spec: &ServiceSpec) -> Result<()>;
    async fn delete_service(&self, node: &NodeTarget, name: &str) -> Result<()>;
}

#[derive(Clone, Default)]
pub struct FluxVmHttpClient {
    http: reqwest::Client,
}

impl FluxVmHttpClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()?,
        })
    }

    fn url(node: &NodeTarget, path: &str) -> Result<reqwest::Url> {
        let base = reqwest::Url::parse(&node.base_url)
            .with_context(|| format!("invalid FluxVM URL for node {}", node.name))?;
        base.join(path).context("joining FluxVM service URL")
    }

    fn auth(&self, node: &NodeTarget, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &node.token {
            Some(token) => req.bearer_auth(token),
            None => req,
        }
    }

    async fn expect_ok(resp: reqwest::Response, operation: &str) -> Result<reqwest::Response> {
        if resp.status().is_success() {
            return Ok(resp);
        }
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("{operation} failed: HTTP {status}: {body}")
    }
}

#[async_trait]
impl ServiceNodeClient for FluxVmHttpClient {
    async fn get_service(&self, node: &NodeTarget, name: &str) -> Result<Option<ServiceSpec>> {
        validate_name(name)?;
        let resp = self
            .auth(
                node,
                self.http
                    .get(Self::url(node, &format!("/v1/network/services/{name}"))?),
            )
            .send()
            .await?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let resp = Self::expect_ok(resp, "get service").await?;
        Ok(Some(resp.json().await?))
    }

    async fn get_status(&self, node: &NodeTarget) -> Result<HostServiceStatus> {
        let resp = self
            .auth(
                node,
                self.http
                    .get(Self::url(node, "/v1/network/services/status")?),
            )
            .send()
            .await?;
        let resp = Self::expect_ok(resp, "get service dataplane status").await?;
        Ok(resp.json().await?)
    }

    async fn upsert_service(&self, node: &NodeTarget, spec: &ServiceSpec) -> Result<()> {
        validate_spec(spec)?;
        let resp = self
            .auth(
                node,
                self.http
                    .post(Self::url(node, "/v1/network/services")?),
            )
            .json(spec)
            .send()
            .await?;
        Self::expect_ok(resp, "upsert service").await?;
        Ok(())
    }

    async fn delete_service(&self, node: &NodeTarget, name: &str) -> Result<()> {
        validate_name(name)?;
        let resp = self
            .auth(
                node,
                self.http
                    .delete(Self::url(node, &format!("/v1/network/services/{name}"))?),
            )
            .send()
            .await?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        Self::expect_ok(resp, "delete service").await?;
        Ok(())
    }
}

pub struct ServiceOrchestrator<C> {
    client: C,
}

impl<C> ServiceOrchestrator<C>
where
    C: ServiceNodeClient,
{
    pub fn new(client: C) -> Self {
        Self { client }
    }

    pub async fn apply(&self, spec: &ServiceSpec, nodes: &[NodeTarget]) -> Result<ApplyReport> {
        validate_spec(spec)?;
        if nodes.is_empty() {
            bail!("service apply requires at least one FluxVM node");
        }

        // North-south intent must only fan out to nodes actually configured
        // as service edges. Fabric checks this before taking any snapshot or
        // mutating service state, so a topology mistake has zero side effects.
        if spec.exposure.north_south() {
            for node in nodes {
                let status = self.client.get_status(node).await?;
                if status.schema_version < 2 {
                    bail!(
                        "node '{}' exposes service schema {}, need v2 for north-south/DSR/IPv6",
                        node.name,
                        status.schema_version
                    );
                }
                if status.north_south_interfaces.is_empty() {
                    bail!(
                        "node '{}' has no FluxVM north-south interfaces configured",
                        node.name
                    );
                }
            }
        }

        let mut before = Vec::with_capacity(nodes.len());
        for node in nodes {
            before.push((
                node.clone(),
                self.client.get_service(node, &spec.name).await?,
            ));
        }

        let mut applied: Vec<NodeTarget> = Vec::new();
        for node in nodes {
            if let Err(error) = self.client.upsert_service(node, spec).await {
                let rolled = self.rollback(&spec.name, &applied, &before).await;
                bail!(
                    "service '{}' failed on node '{}': {error:#}; rolled back {:?}",
                    spec.name,
                    node.name,
                    rolled
                );
            }
            applied.push(node.clone());
        }
        Ok(ApplyReport {
            service: spec.name.clone(),
            applied_nodes: applied.into_iter().map(|n| n.name).collect(),
            rolled_back_nodes: Vec::new(),
        })
    }

    pub async fn delete(&self, name: &str, nodes: &[NodeTarget]) -> Result<ApplyReport> {
        validate_name(name)?;
        if nodes.is_empty() {
            bail!("service delete requires at least one FluxVM node");
        }
        let mut before = Vec::with_capacity(nodes.len());
        for node in nodes {
            before.push((
                node.clone(),
                self.client.get_service(node, name).await?,
            ));
        }
        let mut applied = Vec::new();
        for node in nodes {
            if let Err(error) = self.client.delete_service(node, name).await {
                let rolled = self.rollback(name, &applied, &before).await;
                bail!(
                    "service delete '{}' failed on node '{}': {error:#}; rolled back {:?}",
                    name,
                    node.name,
                    rolled
                );
            }
            applied.push(node.clone());
        }
        Ok(ApplyReport {
            service: name.into(),
            applied_nodes: applied.into_iter().map(|n| n.name).collect(),
            rolled_back_nodes: Vec::new(),
        })
    }

    async fn rollback(
        &self,
        name: &str,
        applied: &[NodeTarget],
        before: &[(NodeTarget, Option<ServiceSpec>)],
    ) -> Vec<String> {
        let previous: HashMap<&str, &Option<ServiceSpec>> = before
            .iter()
            .map(|(node, spec)| (node.name.as_str(), spec))
            .collect();
        let mut rolled = Vec::new();
        for node in applied.iter().rev() {
            let result = match previous
                .get(node.name.as_str())
                .and_then(|spec| spec.as_ref())
            {
                Some(spec) => self.client.upsert_service(node, spec).await,
                None => self.client.delete_service(node, name).await,
            };
            if result.is_ok() {
                rolled.push(node.name.clone());
            }
        }
        rolled
    }
}

fn validate_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name.len() > 63
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
    {
        bail!("invalid FluxVM service name {name:?}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::Mutex;

    #[derive(Clone, Default)]
    struct FakeClient {
        state: Arc<Mutex<HashMap<(String, String), ServiceSpec>>>,
        status: Arc<Mutex<HashMap<String, HostServiceStatus>>>,
        fail_upsert_on: Arc<Mutex<Option<String>>>,
        fail_delete_on: Arc<Mutex<Option<String>>>,
    }

    #[async_trait]
    impl ServiceNodeClient for FakeClient {
        async fn get_service(&self, node: &NodeTarget, name: &str) -> Result<Option<ServiceSpec>> {
            Ok(self
                .state
                .lock()
                .await
                .get(&(node.name.clone(), name.into()))
                .cloned())
        }

        async fn get_status(&self, node: &NodeTarget) -> Result<HostServiceStatus> {
            Ok(self
                .status
                .lock()
                .await
                .get(&node.name)
                .cloned()
                .unwrap_or(HostServiceStatus {
                    schema_version: 2,
                    north_south_interfaces: vec!["eno1".into()],
                    xdp_acceleration: true,
                    interfaces: Vec::new(),
                }))
        }

        async fn upsert_service(&self, node: &NodeTarget, spec: &ServiceSpec) -> Result<()> {
            if self.fail_upsert_on.lock().await.as_deref() == Some(node.name.as_str()) {
                bail!("injected upsert failure");
            }
            self.state
                .lock()
                .await
                .insert((node.name.clone(), spec.name.clone()), spec.clone());
            Ok(())
        }

        async fn delete_service(&self, node: &NodeTarget, name: &str) -> Result<()> {
            if self.fail_delete_on.lock().await.as_deref() == Some(node.name.as_str()) {
                bail!("injected delete failure");
            }
            self.state
                .lock()
                .await
                .remove(&(node.name.clone(), name.into()));
            Ok(())
        }
    }

    fn nodes() -> Vec<NodeTarget> {
        ["a", "b", "c"]
            .into_iter()
            .map(|name| NodeTarget {
                name: name.into(),
                base_url: format!("http://{name}:7788"),
                token: None,
            })
            .collect()
    }

    fn service(port: u16) -> ServiceSpec {
        ServiceSpec {
            name: "payments".into(),
            vip: "10.40.0.100".parse().unwrap(),
            port,
            protocol: ServiceProtocol::Tcp,
            algorithm: ServiceAlgorithm::Maglev,
            mode: ServiceMode::Nat,
            exposure: ServiceExposure::EastWest,
            backends: vec![ServiceBackend {
                address: "10.40.1.21".parse().unwrap(),
                port: 8443,
                weight: 1,
                enabled: true,
            }],
            maglev_table_size: Some(251),
            snat_address: None,
        }
    }

    #[test]
    fn validates_ipv6_north_south_nat() {
        let mut s = service(443);
        s.vip = "2001:db8:40::100".parse().unwrap();
        s.backends[0].address = "2001:db8:40:1::21".parse().unwrap();
        s.exposure = ServiceExposure::NorthSouth;
        s.snat_address = Some("2001:db8:ffff::10".parse().unwrap());
        assert!(validate_spec(&s).is_ok());
    }

    #[test]
    fn dsr_rejects_snat_and_port_translation() {
        let mut s = service(443);
        s.mode = ServiceMode::Dsr;
        assert!(validate_spec(&s).is_err());
        s.backends[0].port = 443;
        assert!(validate_spec(&s).is_ok());
        s.snat_address = Some("192.0.2.5".parse().unwrap());
        assert!(validate_spec(&s).is_err());
    }

    #[tokio::test]
    async fn applies_to_every_node() {
        let client = FakeClient::default();
        let orch = ServiceOrchestrator::new(client.clone());
        let report = orch.apply(&service(443), &nodes()).await.unwrap();
        assert_eq!(report.applied_nodes.len(), 3);
        assert_eq!(client.state.lock().await.len(), 3);
    }

    #[tokio::test]
    async fn north_south_preflight_is_side_effect_free() {
        let client = FakeClient::default();
        let ns = nodes();
        client.status.lock().await.insert(
            "b".into(),
            HostServiceStatus {
                schema_version: 2,
                north_south_interfaces: Vec::new(),
                xdp_acceleration: false,
                interfaces: Vec::new(),
            },
        );
        let mut s = service(443);
        s.exposure = ServiceExposure::NorthSouth;
        s.snat_address = Some("192.0.2.10".parse().unwrap());
        let orch = ServiceOrchestrator::new(client.clone());
        assert!(orch.apply(&s, &ns).await.is_err());
        assert!(client.state.lock().await.is_empty());
    }

    #[tokio::test]
    async fn failed_fanout_rolls_back_previously_updated_nodes() {
        let client = FakeClient::default();
        let ns = nodes();
        let old = service(443);
        for node in &ns {
            client
                .state
                .lock()
                .await
                .insert((node.name.clone(), old.name.clone()), old.clone());
        }
        *client.fail_upsert_on.lock().await = Some("b".into());
        let orch = ServiceOrchestrator::new(client.clone());
        assert!(orch.apply(&service(8443), &ns).await.is_err());
        let state = client.state.lock().await;
        assert_eq!(
            state.get(&("a".into(), "payments".into())).unwrap().port,
            443
        );
        assert_eq!(
            state.get(&("b".into(), "payments".into())).unwrap().port,
            443
        );
        assert_eq!(
            state.get(&("c".into(), "payments".into())).unwrap().port,
            443
        );
    }
}
