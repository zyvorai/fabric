use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VM {
    pub name: String,
    pub state: VMState,
    pub cpus: u32,
    pub memory: u64, // in MB
    pub image: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VMState {
    Running,
    Stopped,
    Paused,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateVMRequest {
    pub name: String,
    pub image: String,
    pub cpus: u32,
    pub memory: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMMetrics {
    pub cpu_usage: f64,
    pub memory_usage: u64,
    pub disk_usage: u64,
    pub network_rx: u64,
    pub network_tx: u64,
}

impl VM {
    pub fn new(name: String, image: String, cpus: u32, memory: u64) -> Self {
        Self {
            name,
            state: VMState::Stopped,
            cpus,
            memory,
            image,
            ip: None,
            pid: None,
        }
    }
}
