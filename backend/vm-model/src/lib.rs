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
    Starting,
    Stopping,
    Failed,
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

/// Options for starting a VM via systemd-vmspawn
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMStartOptions {
    /// Use KVM acceleration (None = auto-detect)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kvm: Option<bool>,
    /// Enable Secure Boot firmware
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secure_boot: Option<bool>,
    /// Enable VSock networking
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vsock: Option<bool>,
    /// VSock CID (None = random)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vsock_cid: Option<u32>,
    /// Start in graphical mode
    #[serde(default)]
    pub gui: bool,
    /// Use directory instead of image
    #[serde(skip_serializing_if = "Option::is_none")]
    pub directory: Option<String>,
    /// Credentials to pass (ID -> value)
    #[serde(default)]
    pub credentials: Vec<VMCredential>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMCredential {
    pub id: String,
    pub value: String,
}

impl Default for VMStartOptions {
    fn default() -> Self {
        Self {
            kvm: None,
            secure_boot: None,
            vsock: None,
            vsock_cid: None,
            gui: false,
            directory: None,
            credentials: Vec::new(),
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vm_new() {
        let vm = VM::new("test".to_string(), "img.qcow2".to_string(), 4, 2048);
        assert_eq!(vm.name, "test");
        assert_eq!(vm.cpus, 4);
        assert_eq!(vm.memory, 2048);
        assert_eq!(vm.disk, 20); // default
        assert_eq!(vm.state, VMState::Stopped);
        assert!(vm.ip.is_none());
    }

    #[test]
    fn test_vm_with_disk() {
        let vm = VM::with_disk("db".to_string(), "img.qcow2".to_string(), 8, 4096, 100);
        assert_eq!(vm.disk, 100);
    }

    #[test]
    fn test_vm_from_request() {
        let req = CreateVMRequest {
            name: "web-01".to_string(),
            image: "ubuntu.img".to_string(),
            cpus: 2,
            memory: 1024,
            disk: 50,
            hostname: Some("web-server".to_string()),
            tags: Some(vec!["production".to_string()]),
        };
        let vm = VM::from_request(&req);
        assert_eq!(vm.name, "web-01");
        assert_eq!(vm.hostname, Some("web-server".to_string()));
        assert_eq!(vm.tags, Some(vec!["production".to_string()]));
    }

    #[test]
    fn test_serialization_roundtrip() {
        let vm = VM::new("roundtrip".to_string(), "test.img".to_string(), 2, 1024);
        let json = serde_json::to_string(&vm).unwrap();
        let deserialized: VM = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "roundtrip");
        assert_eq!(deserialized.cpus, 2);
        assert_eq!(deserialized.memory, 1024);
    }

    #[test]
    fn test_vmstate_serialization() {
        let json = serde_json::to_string(&VMState::Running).unwrap();
        assert_eq!(json, "\"running\"");

        let state: VMState = serde_json::from_str("\"stopped\"").unwrap();
        assert_eq!(state, VMState::Stopped);
    }

    #[test]
    fn test_optional_fields_omitted() {
        let vm = VM::new("minimal".to_string(), "img".to_string(), 1, 512);
        let json = serde_json::to_string(&vm).unwrap();
        assert!(!json.contains("\"ip\""));
        assert!(!json.contains("\"pid\""));
        assert!(!json.contains("\"tags\""));
    }

    #[test]
    fn test_default_disk_size() {
        let req: CreateVMRequest = serde_json::from_str(r#"{
            "name": "test",
            "image": "img",
            "cpus": 1,
            "memory": 512
        }"#).unwrap();
        assert_eq!(req.disk, 20); // default
    }
}
