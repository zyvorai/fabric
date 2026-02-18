use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub daemon: DaemonConfig,
    pub storage: StorageConfig,
    pub network: NetworkConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub listen: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    pub path: String,
    #[serde(default = "default_image_path")]
    pub image_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    pub bridge: String,
}

fn default_image_path() -> String {
    "/var/lib/vmspawnd/images".to_string()
}

impl Config {
    pub fn load() -> Result<Self> {
        let paths = vec![
            "/etc/vmspawnd/vmspawnd.toml",
            "configs/vmspawnd.toml",
            "vmspawnd.toml",
        ];

        for path in paths {
            if let Ok(content) = fs::read_to_string(path) {
                let config: Config = toml::from_str(&content)?;
                return Ok(config);
            }
        }

        // Default config
        Ok(Config {
            daemon: DaemonConfig {
                listen: "0.0.0.0:8080".to_string(),
            },
            storage: StorageConfig {
                path: "/var/lib/vmspawnd".to_string(),
                image_path: "/var/lib/vmspawnd/images".to_string(),
            },
            network: NetworkConfig {
                bridge: "br0".to_string(),
            },
        })
    }
}
