use anyhow::Result;
use kube::{
    api::{Api, Patch, PatchParams},
    runtime::controller::Action,
    ResourceExt,
};
use reqwest::Client as HttpClient;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

use crate::{controller::Context, crd::{VirtualMachine, VirtualMachineStatus}};

pub async fn reconcile(vm: Arc<VirtualMachine>, ctx: Arc<Context>) -> Result<Action> {
    let name = vm.name_any();
    let namespace = vm.namespace().unwrap_or_default();

    tracing::info!("Reconciling VM {}/{}", namespace, name);

    let vm_api: Api<VirtualMachine> = Api::namespaced(ctx.client.clone(), &namespace);

    // Create or update VM via vmspawnd API
    let http_client = HttpClient::new();
    let vm_url = format!("{}/api/vms", ctx.vmspawnd_url);

    let create_req = json!({
        "name": name,
        "image": vm.spec.image,
        "cpus": vm.spec.cpus,
        "memory": vm.spec.memory,
    });

    // Check if VM exists
    let vm_check_url = format!("{}/api/vms/{}", ctx.vmspawnd_url, name);
    let exists = http_client.get(&vm_check_url).send().await?.status().is_success();

    if !exists {
        // Create VM
        let resp = http_client
            .post(&vm_url)
            .json(&create_req)
            .send()
            .await?;

        if !resp.status().is_success() {
            tracing::error!("Failed to create VM: {:?}", resp.text().await?);
            return Ok(Action::requeue(Duration::from_secs(30)));
        }

        tracing::info!("Created VM {}", name);

        // Configure cloud-init if specified
        if let Some(cloud_init) = &vm.spec.cloud_init {
            let cloud_init_url = format!("{}/api/vms/{}/cloud-init", ctx.vmspawnd_url, name);
            let cloud_init_req = json!({
                "instance_id": name,
                "hostname": name,
                "user_data": cloud_init.user_data,
                "network_config": cloud_init.network_config,
            });

            let _ = http_client
                .post(&cloud_init_url)
                .json(&cloud_init_req)
                .send()
                .await;
        }

        // Start VM
        let start_url = format!("{}/api/vms/{}/start", ctx.vmspawnd_url, name);
        let _ = http_client.post(&start_url).send().await;
    }

    // Update status
    let status = VirtualMachineStatus {
        state: "running".to_string(),
        ip: None,
        node: Some(std::env::var("NODE_NAME").unwrap_or_else(|_| "unknown".to_string())),
    };

    let patch = json!({
        "status": status
    });

    let ps = PatchParams::default();
    let _patched = vm_api
        .patch_status(&name, &ps, &Patch::Merge(&patch))
        .await?;

    Ok(Action::requeue(Duration::from_secs(300)))
}

pub fn error_policy(_vm: Arc<VirtualMachine>, _error: &anyhow::Error, _ctx: Arc<Context>) -> Action {
    Action::requeue(Duration::from_secs(60))
}
