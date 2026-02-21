use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub daemon: DaemonConfig,
    pub storage: StorageConfig,
    pub network: NetworkConfig,
    #[serde(default)]
    pub controller: ControllerConfig,
    #[serde(default)]
    pub auth: AuthConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub listen: String,
    #[serde(default = "default_cors_origins")]
    pub cors_origins: Vec<String>,
}

fn default_cors_origins() -> Vec<String> {
    vec!["http://127.0.0.1:8080".to_string()]
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
    #[serde(default = "default_networkd_config_dir")]
    pub networkd_config_dir: String,
    #[serde(default = "default_networkd_file_prefix")]
    pub networkd_file_prefix: String,
}

fn default_networkd_config_dir() -> String {
    "/etc/systemd/network".to_string()
}

fn default_networkd_file_prefix() -> String {
    "50-vmspawnd-".to_string()
}

fn default_image_path() -> String {
    "/var/lib/vmspawnd/images".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControllerConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_controller_mode")]
    pub mode: String, // "standalone" or "controller"
    #[serde(default)]
    pub cluster_name: Option<String>,
    #[serde(default)]
    pub datacenter_name: Option<String>,
}

fn default_controller_mode() -> String {
    "standalone".to_string()
}

impl Default for ControllerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: default_controller_mode(),
            cluster_name: None,
            datacenter_name: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    #[serde(default = "default_auth_enabled")]
    pub enabled: bool,
    #[serde(default = "default_jwt_secret")]
    pub jwt_secret: String,
    #[serde(default = "default_auth_db_path")]
    pub db_path: String,
    #[serde(default = "default_admin_password")]
    pub default_admin_password: String,
    #[serde(default = "default_token_expiration_hours")]
    pub token_expiration_hours: i64,
}

fn default_auth_enabled() -> bool {
    true
}

fn default_jwt_secret() -> String {
    std::env::var("VMSPAWND_JWT_SECRET").unwrap_or_else(|_| {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..32)
            .map(|_| rng.sample(rand::distributions::Alphanumeric) as char)
            .collect()
    })
}

fn default_auth_db_path() -> String {
    "/var/lib/vmspawnd/auth.db".to_string()
}

fn default_admin_password() -> String {
    "admin".to_string()
}

fn default_token_expiration_hours() -> i64 {
    24
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            enabled: default_auth_enabled(),
            jwt_secret: default_jwt_secret(),
            db_path: default_auth_db_path(),
            default_admin_password: default_admin_password(),
            token_expiration_hours: default_token_expiration_hours(),
        }
    }
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
                listen: "127.0.0.1:8080".to_string(),
                cors_origins: default_cors_origins(),
            },
            storage: StorageConfig {
                path: "/var/lib/vmspawnd".to_string(),
                image_path: "/var/lib/vmspawnd/images".to_string(),
            },
            network: NetworkConfig {
                bridge: "br0".to_string(),
                networkd_config_dir: default_networkd_config_dir(),
                networkd_file_prefix: default_networkd_file_prefix(),
            },
            controller: ControllerConfig::default(),
            auth: AuthConfig::default(),
        })
    }
}
