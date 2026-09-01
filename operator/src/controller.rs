// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use futures::StreamExt;
use kube::{
    api::Api,
    runtime::{watcher::Config, Controller},
    Client,
};
use std::sync::Arc;

use crate::{crd::VirtualMachine, reconcile};

pub struct Context {
    pub client: Client,
    pub http: reqwest::Client,
    pub vmspawnd_url: String,
    pub vmspawnd_token: Option<String>,
}

pub async fn run(client: Client) -> Result<()> {
    let vms = Api::<VirtualMachine>::all(client.clone());

    let vmspawnd_url = std::env::var("ZYVOR_FABRICD_URL")
        .unwrap_or_else(|_| "http://zyvor-fabricd:9095".to_string());
    let vmspawnd_token = std::env::var("ZYVOR_FABRICD_TOKEN").ok().filter(|s| !s.is_empty());

    let context = Arc::new(Context {
        client: client.clone(),
        http: reqwest::Client::new(),
        vmspawnd_url,
        vmspawnd_token,
    });

    Controller::new(vms, Config::default())
        .run(reconcile::reconcile, reconcile::error_policy, context)
        .for_each(|res| async move {
            match res {
                Ok(o) => tracing::info!("Reconciled: {:?}", o),
                Err(e) => tracing::error!("Reconcile error: {:?}", e),
            }
        })
        .await;

    Ok(())
}
