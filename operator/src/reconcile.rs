// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

use kube::{
    api::{Api, Patch, PatchParams},
    runtime::controller::Action,
    ResourceExt,
};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

use crate::{controller::Context, crd::{VirtualMachine, VirtualMachineStatus}, error::OperatorError};

fn with_auth(ctx: &Context, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    if let Some(ref token) = ctx.vmspawnd_token {
        req.bearer_auth(token)
    } else {
        req
    }
}

pub async fn reconcile(
    vm: Arc<VirtualMachine>,
    ctx: Arc<Context>,
) -> Result<Action, OperatorError> {
    let name = vm.name_any();
    let namespace = vm.namespace().unwrap_or_default();

    tracing::info!("Reconciling VM {}/{}", namespace, name);

    let vm_api: Api<VirtualMachine> = Api::namespaced(ctx.client.clone(), &namespace);
    let http_client = &ctx.http;
    let vm_url = format!("{}/api/vms", ctx.vmspawnd_url);

    let create_req = json!({
        "name": name,
        "image": vm.spec.image,
        "cpus": vm.spec.cpus,
        "memory": vm.spec.memory,
    });

    let vm_check_url = format!("{}/api/vms/{}", ctx.vmspawnd_url, name);
    let exists = with_auth(&ctx, http_client.get(&vm_check_url))
        .send()
        .await?
        .status()
        .is_success();

    let mut observed_state = "unknown".to_string();
    let mut observed_ip: Option<String> = None;

    if !exists {
        let resp = with_auth(&ctx, http_client.post(&vm_url))
            .json(&create_req)
            .send()
            .await?;

        if !resp.status().is_success() {
            tracing::error!("Failed to create VM: {:?}", resp.text().await?);
            return Ok(Action::requeue(Duration::from_secs(30)));
        }

        tracing::info!("Created VM {}", name);

        if let Some(cloud_init) = &vm.spec.cloud_init {
            let cloud_init_url = format!("{}/api/vms/{}/cloud-init", ctx.vmspawnd_url, name);
            let cloud_init_req = json!({
                "instance_id": name,
                "hostname": name,
                "user_data": cloud_init.user_data,
                "network_config": cloud_init.network_config,
            });

            if let Err(e) = with_auth(&ctx, http_client.post(&cloud_init_url))
                .json(&cloud_init_req)
                .send()
                .await
            {
                tracing::warn!("Failed to configure cloud-init for VM '{}': {}", name, e);
            }
        }

        let start_url = format!("{}/api/vms/{}/start", ctx.vmspawnd_url, name);
        if let Err(e) = with_auth(&ctx, http_client.post(&start_url)).send().await {
            tracing::error!("Failed to start VM '{}': {}", name, e);
        }
    }

    if let Ok(resp) = with_auth(&ctx, http_client.get(&vm_check_url)).send().await {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<serde_json::Value>().await {
                if let Some(state) = body.get("state").and_then(|v| v.as_str()) {
                    observed_state = state.to_string();
                }
                observed_ip = body
                    .get("ip")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
            }
        }
    }

    let status = VirtualMachineStatus {
        state: observed_state,
        ip: observed_ip,
        node: Some(std::env::var("NODE_NAME").unwrap_or_else(|_| "unknown".to_string())),
    };

    let patch = json!({ "status": status });

    let ps = PatchParams::default();
    let _patched = vm_api
        .patch_status(&name, &ps, &Patch::Merge(&patch))
        .await?;

    Ok(Action::requeue(Duration::from_secs(300)))
}

pub fn error_policy(
    _vm: Arc<VirtualMachine>,
    _error: &OperatorError,
    _ctx: Arc<Context>,
) -> Action {
    Action::requeue(Duration::from_secs(60))
}
