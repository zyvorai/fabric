// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Fabric-side orchestration for FluxVM Service Fabric.
//!
//! Fabric owns distributed service intent. Each FluxVM node owns eBPF maps
//! and packet rewriting. This crate deliberately talks only to the stable
//! `/v1/network/services` REST contract; it never manipulates bpffs or `tc`.

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::Ipv4Addr};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ServiceBackend {
    pub address: Ipv4Addr,
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
    pub vip: Ipv4Addr,
    pub port: u16,
    pub protocol: ServiceProtocol,
    #[serde(default)]
    pub algorithm: ServiceAlgorithm,
    #[serde(default)]
    pub mode: ServiceMode,
    #[serde(default)]
    pub backends: Vec<ServiceBackend>,
    #[serde(default)]
    pub maglev_table_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NodeTarget {
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApplyReport {
    pub service: String,
    pub applied_nodes: Vec<String>,
    pub rolled_back_nodes: Vec<String>,
}

#[async_trait]
pub trait ServiceNodeClient: Send + Sync {
    async fn get_service(&self, node: &NodeTarget, name: &str) -> Result<Option<ServiceSpec>>;
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

    async fn upsert_service(&self, node: &NodeTarget, spec: &ServiceSpec) -> Result<()> {
        validate_name(&spec.name)?;
        let resp = self
            .auth(
                node,
                self.http.post(Self::url(node, "/v1/network/services")?),
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

    /// Apply intent to every node. Before mutating anything, snapshot each
    /// node's prior value. A mid-fanout failure triggers best-effort rollback
    /// of nodes already updated, preventing Fabric from silently accepting a
    /// half-deployed service.
    pub async fn apply(&self, spec: &ServiceSpec, nodes: &[NodeTarget]) -> Result<ApplyReport> {
        validate_name(&spec.name)?;
        if nodes.is_empty() {
            bail!("service apply requires at least one FluxVM node");
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
            before.push((node.clone(), self.client.get_service(node, name).await?));
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
            backends: vec![ServiceBackend {
                address: "10.40.1.21".parse().unwrap(),
                port: 8443,
                weight: 1,
                enabled: true,
            }],
            maglev_table_size: Some(251),
        }
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

    #[tokio::test]
    async fn delete_fans_out() {
        let client = FakeClient::default();
        let ns = nodes();
        for node in &ns {
            client
                .state
                .lock()
                .await
                .insert((node.name.clone(), "payments".into()), service(443));
        }
        let orch = ServiceOrchestrator::new(client.clone());
        orch.delete("payments", &ns).await.unwrap();
        assert!(client.state.lock().await.is_empty());
    }
}
