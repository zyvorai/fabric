// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

pub mod app;
pub mod audit;
pub mod browser;
pub mod config;
pub mod confine;
pub mod contain;
pub mod credentials;
pub mod egress;
pub mod export_tokens;
pub mod fluxvm;
pub mod goals;
pub mod l7;
pub mod mcp;
pub mod mitm;
pub mod model;
pub mod notify;
pub mod policy;
pub mod pool;
pub mod proxy;
pub mod schedules;
pub mod sentinel;
pub mod skills;
pub mod store;
pub mod workstations;

use crate::{
    config::Config, credentials::CredentialVault, export_tokens::ExportTokenStore, fluxvm::FluxVm,
    policy::PolicyTrust, store::Store,
};
use anyhow::{Context, Result};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

pub struct AppState {
    pub config: Config,
    pub store: Arc<Store>,
    pub fluxvm: FluxVm,
    pub credentials: CredentialVault,
    pub skill_scopes: skills::SkillScopes,
    pub egress_http: reqwest::Client,
    /// The TLS-interception CA, when `ZYVOR_AGENT_MITM_CA_DIR` is set.
    pub mitm: Option<Arc<mitm::Mitm>>,
    /// Extra roots the broker trusts for upstream TLS.
    pub extra_roots: Vec<reqwest::Certificate>,
    /// Keep: Ed25519 trusted signers for `keep.policy.yaml`.
    pub policy_trust: PolicyTrust,
    /// Keep: scoped export tokens (training default off).
    pub export_tokens: ExportTokenStore,
    /// Serializes the idempotency/quota reservation section of session creation,
    /// one lock per agent name so a slow or hung FluxVM call for one agent can
    /// never block session creation for every other agent on the process.
    pub session_create_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    /// Prevents concurrent pool reconcilers from overfilling the same deployment.
    pub warm_pool_reconcile_lock: tokio::sync::Mutex<()>,
    /// Per-session operation locks serialize steer/hibernate/resume/cancel/delete/expiry.
    pub session_locks: Mutex<HashMap<Uuid, Arc<tokio::sync::Mutex<()>>>>,
}

impl AppState {
    pub async fn from_config(config: Config) -> Result<Arc<Self>> {
        tokio::fs::create_dir_all(&config.snapshot_dir).await?;
        let store = Arc::new(Store::open(&config.state_dir).await?);
        let credentials = CredentialVault::load(config.credentials_file.as_deref()).await?;
        let skill_scopes = skills::SkillScopes::load(config.skill_scopes_file.as_deref()).await?;
        let fluxvm = FluxVm::new(&config.fluxvm_url, config.fluxvm_token.clone())?;
        let egress_http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(120))
            .build()?;
        let mitm = match &config.mitm_ca_dir {
            Some(dir) => Some(Arc::new(mitm::Mitm::load_or_create(dir).await?)),
            None => None,
        };
        let mut extra_roots = Vec::new();
        for path in &config.extra_ca_files {
            let pem = tokio::fs::read(path)
                .await
                .with_context(|| format!("reading extra CA file {}", path.display()))?;
            extra_roots.push(
                reqwest::Certificate::from_pem(&pem)
                    .with_context(|| format!("parsing extra CA file {}", path.display()))?,
            );
        }
        let policy_trust = PolicyTrust::from_env()?;
        let export_tokens = ExportTokenStore::open(&config.state_dir).await?;
        Ok(Arc::new(Self {
            config,
            store,
            fluxvm,
            credentials,
            skill_scopes,
            egress_http,
            mitm,
            extra_roots,
            policy_trust,
            export_tokens,
            session_create_locks: Mutex::new(HashMap::new()),
            warm_pool_reconcile_lock: tokio::sync::Mutex::new(()),
            session_locks: Mutex::new(HashMap::new()),
        }))
    }

    pub fn session_lock(&self, id: Uuid) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.session_locks.lock().unwrap_or_else(|e| e.into_inner());
        if locks.len() > 10_000 {
            locks.retain(|_, lock| Arc::strong_count(lock) > 1);
        }
        locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    }

    pub fn session_create_lock(&self, agent: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self
            .session_create_locks
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if locks.len() > 10_000 {
            locks.retain(|_, lock| Arc::strong_count(lock) > 1);
        }
        locks
            .entry(agent.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    }
}
