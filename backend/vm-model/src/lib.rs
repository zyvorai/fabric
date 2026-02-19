use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VM {
    pub name: String,
    pub state: VMState,
    pub cpus: u32,
    pub memory: u64, // in MB
    pub disk: u64,   // in GB
    pub image: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vnc_port: Option<u16>,
    pub created: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<DateTime<Utc>>,
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
    #[serde(default = "default_disk_size")]
    pub disk: u64, // in GB
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

fn default_disk_size() -> u64 {
    20 // 20GB default disk size
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
        Self::with_disk(name, image, cpus, memory, 20)
    }

    pub fn with_disk(name: String, image: String, cpus: u32, memory: u64, disk: u64) -> Self {
        Self {
            name,
            state: VMState::Stopped,
            cpus,
            memory,
            disk,
            image,
            ip: None,
            pid: None,
            mac_address: None,
            hostname: None,
            tags: None,
            vnc_port: None,
            created: Utc::now(),
            updated: None,
        }
    }

    pub fn from_request(req: &CreateVMRequest) -> Self {
        Self {
            name: req.name.clone(),
            state: VMState::Stopped,
            cpus: req.cpus,
            memory: req.memory,
            disk: req.disk,
            image: req.image.clone(),
            ip: None,
            pid: None,
            mac_address: None,
            hostname: req.hostname.clone(),
            tags: req.tags.clone(),
            vnc_port: None,
            created: Utc::now(),
            updated: None,
        }
    }
}
