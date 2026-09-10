// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

pub mod app;
pub mod config;
pub mod credentials;
pub mod egress;
pub mod fluxvm;
pub mod model;
pub mod pool;
pub mod store;

use crate::{config::Config, credentials::CredentialVault, fluxvm::FluxVm, store::Store};
use anyhow::Result;
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
    pub egress_http: reqwest::Client,
    /// Serializes the idempotency/quota reservation section of session creation.
    pub session_create_lock: tokio::sync::Mutex<()>,
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
        let fluxvm = FluxVm::new(&config.fluxvm_url, config.fluxvm_token.clone())?;
        let egress_http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(120))
            .build()?;
        Ok(Arc::new(Self {
            config,
            store,
            fluxvm,
            credentials,
            egress_http,
            session_create_lock: tokio::sync::Mutex::new(()),
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
}
