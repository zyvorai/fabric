// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use serde::Serialize;
use vmspawn_sdk::{Client, ClientConfig};

#[derive(Serialize)]
struct VmSummary {
    name: String,
    state: String,
    cpus: u32,
    memory: u64,
}

fn client(endpoint: &str, token: Option<String>) -> Result<Client, String> {
    Client::new(ClientConfig {
        endpoint: endpoint.to_string(),
        token,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn fabric_health(endpoint: String, token: Option<String>) -> Result<String, String> {
    let client = client(&endpoint, token)?;
    client.health().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fabric_list_vms(endpoint: String, token: Option<String>) -> Result<Vec<VmSummary>, String> {
    let client = client(&endpoint, token)?;
    let vms = client.list_vms().await.map_err(|e| e.to_string())?;
    Ok(vms
        .into_iter()
        .map(|vm| VmSummary {
            name: vm.name,
            state: format!("{:?}", vm.state),
            cpus: vm.cpus,
            memory: vm.memory,
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fabric_health, fabric_list_vms])
        .run(tauri::generate_context!())
        .expect("error while running Machina desktop");
}
