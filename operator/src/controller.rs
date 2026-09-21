// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use futures::StreamExt;
use kube::{
    api::Api,
    runtime::{watcher::Config, Controller},
    Client,
};
use std::sync::Arc;

use crate::{
    crd::{ContainerGroup, InferenceDeployment, ModelArtifact, VirtualMachine},
    reconcile,
};

pub struct Context {
    pub client: Client,
    pub http: reqwest::Client,
    pub zyvor_fabricd_url: String,
    pub zyvor_fabricd_token: Option<String>,
}

pub async fn run(client: Client) -> Result<()> {
    let vms = Api::<VirtualMachine>::all(client.clone());
    let container_groups = Api::<ContainerGroup>::all(client.clone());
    let model_artifacts = Api::<ModelArtifact>::all(client.clone());
    let inference_deployments = Api::<InferenceDeployment>::all(client.clone());

    let zyvor_fabricd_url = std::env::var("ZYVOR_FABRICD_URL")
        .unwrap_or_else(|_| "http://zyvor-fabricd:9095".to_string());
    let zyvor_fabricd_token = std::env::var("ZYVOR_FABRICD_TOKEN")
        .ok()
        .filter(|s| !s.is_empty());

    let context = Arc::new(Context {
        client: client.clone(),
        http: reqwest::Client::new(),
        zyvor_fabricd_url,
        zyvor_fabricd_token,
    });

    let vm_controller = Controller::new(vms, Config::default())
        .run(
            reconcile::reconcile,
            reconcile::error_policy,
            context.clone(),
        )
        .for_each(|res| async move {
            match res {
                Ok(o) => tracing::info!("Reconciled VM: {:?}", o),
                Err(e) => tracing::error!("VM reconcile error: {:?}", e),
            }
        });

    let container_group_controller = Controller::new(container_groups, Config::default())
        .run(
            reconcile::reconcile_container_group,
            reconcile::error_policy_container_group,
            context.clone(),
        )
        .for_each(|res| async move {
            match res {
                Ok(o) => tracing::info!("Reconciled ContainerGroup: {:?}", o),
                Err(e) => tracing::error!("ContainerGroup reconcile error: {:?}", e),
            }
        });

    let model_artifact_controller = Controller::new(model_artifacts, Config::default())
        .run(
            reconcile::reconcile_model_artifact,
            reconcile::error_policy_model_artifact,
            context.clone(),
        )
        .for_each(|res| async move {
            match res {
                Ok(o) => tracing::info!("Reconciled ModelArtifact: {:?}", o),
                Err(e) => tracing::error!("ModelArtifact reconcile error: {:?}", e),
            }
        });

    let inference_deployment_controller =
        Controller::new(inference_deployments, Config::default())
            .run(
                reconcile::reconcile_inference_deployment,
                reconcile::error_policy_inference_deployment,
                context,
            )
            .for_each(|res| async move {
                match res {
                    Ok(o) => tracing::info!("Reconciled InferenceDeployment: {:?}", o),
                    Err(e) => tracing::error!("InferenceDeployment reconcile error: {:?}", e),
                }
            });

    tokio::join!(
        vm_controller,
        container_group_controller,
        model_artifact_controller,
        inference_deployment_controller
    );

    Ok(())
}
