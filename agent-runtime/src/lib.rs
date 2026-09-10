// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

pub mod app;
pub mod config;
pub mod credentials;
pub mod egress;
pub mod fluxvm;
pub mod model;
pub mod store;

use crate::{config::Config, credentials::CredentialVault, fluxvm::FluxVm, store::Store};
use anyhow::Result;
use std::sync::Arc;

pub struct AppState {
    pub config: Config,
    pub store: Arc<Store>,
    pub fluxvm: FluxVm,
    pub credentials: CredentialVault,
    pub egress_http: reqwest::Client,
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
        Ok(Arc::new(Self { config, store, fluxvm, credentials, egress_http }))
    }
}
