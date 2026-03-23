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
    vec!["http://127.0.0.1:9095".to_string()]
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
#[serde(rename_all = "lowercase")]
pub enum ControllerMode {
    Standalone,
    Controller,
}

impl Default for ControllerMode {
    fn default() -> Self {
        Self::Standalone
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControllerConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub mode: ControllerMode,
    #[serde(default)]
    pub cluster_name: Option<String>,
    #[serde(default)]
    pub datacenter_name: Option<String>,
}

impl Default for ControllerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: ControllerMode::default(),
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
    match std::env::var("VMSPAWND_JWT_SECRET") {
        Ok(secret) => secret,
        Err(_) => {
            // Generate a random secret and persist it so tokens survive restarts
            let secret = generate_random_secret();
            let secret_path = "/var/lib/vmspawnd/.jwt_secret";
            // Try to load a previously persisted secret first
            if let Ok(persisted) = std::fs::read_to_string(secret_path) {
                let trimmed = persisted.trim().to_string();
                if !trimmed.is_empty() {
                    return trimmed;
                }
            }
            // Persist the newly generated secret
            if let Some(parent) = std::path::Path::new(secret_path).parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    tracing::warn!("Failed to create directory for JWT secret: {}", e);
                }
            }
            if let Err(e) = std::fs::write(secret_path, &secret) {
                tracing::warn!(
                    "Could not persist JWT secret to {}: {}. \
                     Tokens will be invalidated on restart. \
                     Set VMSPAWND_JWT_SECRET or fix file permissions.",
                    secret_path, e
                );
            } else {
                // Set restrictive permissions on the secret file
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Err(e) = std::fs::set_permissions(secret_path, std::fs::Permissions::from_mode(0o600)) {
                        tracing::warn!("Failed to set permissions on JWT secret file: {}", e);
                    }
                }
            }
            secret
        }
    }
}

fn generate_random_secret() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    (0..64)
        .map(|_| rng.sample(rand::distr::Alphanumeric) as char)
        .collect()
}

fn default_auth_db_path() -> String {
    "/var/lib/vmspawnd/auth.db".to_string()
}

fn default_admin_password() -> String {
    // Use env var or generate a secure random password (never default to "admin")
    std::env::var("VMSPAWND_ADMIN_PASSWORD").unwrap_or_else(|_| {
        let password = generate_random_secret();
        tracing::warn!(
            "================================================================"
        );
        tracing::warn!(
            "No admin password configured. Generated random password."
        );
        tracing::warn!(
            "Set VMSPAWND_ADMIN_PASSWORD or auth.default_admin_password in config."
        );
        tracing::warn!(
            "Generated admin password has been written to /var/lib/vmspawnd/.admin_password"
        );
        // Persist to a file instead of logging the password
        let pw_path = "/var/lib/vmspawnd/.admin_password";
        if let Some(parent) = std::path::Path::new(pw_path).parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                tracing::warn!("Failed to create directory for admin password: {}", e);
            }
        }
        if let Err(e) = std::fs::write(pw_path, &password) {
            tracing::error!("Failed to write admin password file: {}", e);
        } else {
            // Set restrictive permissions on the password file
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Err(e) = std::fs::set_permissions(pw_path, std::fs::Permissions::from_mode(0o600)) {
                    tracing::warn!("Failed to set permissions on admin password file: {}", e);
                }
            }
        }
        tracing::warn!(
            "================================================================"
        );
        password
    })
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
                listen: "127.0.0.1:9095".to_string(),
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
