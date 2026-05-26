// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use kube::CustomResource;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(CustomResource, Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "vmspawnd.io",
    version = "v1alpha1",
    kind = "VirtualMachine",
    plural = "virtualmachines",
    shortname = "vm",
    status = "VirtualMachineStatus",
    namespaced
)]
#[kube(printcolumn = r#"{"name":"State", "type":"string", "jsonPath":".status.state"}"#)]
#[kube(printcolumn = r#"{"name":"Age", "type":"date", "jsonPath":".metadata.creationTimestamp"}"#)]
pub struct VirtualMachineSpec {
    /// VM image path
    pub image: String,

    /// Number of CPUs
    #[serde(default = "default_cpus")]
    pub cpus: u32,

    /// Memory in MB
    #[serde(default = "default_memory")]
    pub memory: u64,

    /// cloud-init configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_init: Option<CloudInitSpec>,

    /// TPM configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tpm: Option<TPMSpec>,

    /// VNC configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vnc: Option<VNCSpec>,
}

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct CloudInitSpec {
    pub user_data: Option<String>,
    pub network_config: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct TPMSpec {
    pub enabled: bool,
    #[serde(default = "default_tpm_version")]
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct VNCSpec {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct VirtualMachineStatus {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<String>,
}

fn default_cpus() -> u32 {
    2
}

fn default_memory() -> u64 {
    2048
}

fn default_tpm_version() -> String {
    "2.0".to_string()
}
