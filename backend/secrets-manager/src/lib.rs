// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

/// XOR-based obfuscation key for secret values at rest.
/// In a production deployment with external KMS, this would be replaced
/// by envelope encryption using the KMS-managed key.
const OBFUSCATION_KEY: &[u8] = b"zyvor-fabricd-secrets-at-rest-key-v1!";

/// Encrypt a secret value for storage at rest.
fn encrypt_value(plaintext: &str) -> String {
    let encrypted: Vec<u8> = plaintext
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.len()])
        .collect();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&encrypted)
}

/// Decrypt a secret value from storage.
fn decrypt_value(ciphertext: &str) -> Result<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(ciphertext)
        .map_err(|e| anyhow::anyhow!("Failed to decode secret: {}", e))?;
    let decrypted: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.len()])
        .collect();
    String::from_utf8(decrypted)
        .map_err(|e| anyhow::anyhow!("Failed to decode secret as UTF-8: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Secret {
    pub id: String,
    pub name: String,
    /// Encrypted at rest — call `decrypt_value` to read.
    pub value: String,
    pub created: chrono::DateTime<chrono::Utc>,
    pub updated: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: HashMap<String, String>,
}

/// A redacted view of a secret (value is hidden).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretInfo {
    pub id: String,
    pub name: String,
    pub created: chrono::DateTime<chrono::Utc>,
    pub updated: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: HashMap<String, String>,
}

impl From<&Secret> for SecretInfo {
    fn from(s: &Secret) -> Self {
        Self {
            id: s.id.clone(),
            name: s.name.clone(),
            created: s.created,
            updated: s.updated,
            metadata: s.metadata.clone(),
        }
    }
}

pub struct SecretsManager {
    secrets: RwLock<HashMap<String, Secret>>,
}

impl Default for SecretsManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretsManager {
    pub fn new() -> Self {
        Self {
            secrets: RwLock::new(HashMap::new()),
        }
    }

    pub fn create_secret(
        &self,
        name: &str,
        value: &str,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<Secret> {
        if name.is_empty() || name.len() > 256 {
            anyhow::bail!("Secret name must be between 1 and 256 characters");
        }
        if value.is_empty() || value.len() > 65536 {
            anyhow::bail!("Secret value must be between 1 and 65536 characters");
        }

        let secret = Secret {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            value: encrypt_value(value),
            created: chrono::Utc::now(),
            updated: None,
            metadata: metadata.unwrap_or_default(),
        };
        let mut secrets = self.secrets.write().unwrap_or_else(|e| e.into_inner());
        secrets.insert(secret.id.clone(), secret.clone());
        // Return with decrypted value for immediate use
        let mut result = secret;
        result.value = value.to_string();
        Ok(result)
    }

    pub fn get_secret(&self, id: &str) -> Option<Secret> {
        let secrets = self.secrets.read().unwrap_or_else(|e| e.into_inner());
        secrets.get(id).cloned().map(|mut s| {
            s.value = decrypt_value(&s.value).unwrap_or_default();
            s
        })
    }

    pub fn list_secrets(&self) -> Vec<SecretInfo> {
        let secrets = self.secrets.read().unwrap_or_else(|e| e.into_inner());
        secrets.values().map(SecretInfo::from).collect()
    }

    pub fn update_secret(&self, id: &str, value: &str) -> Result<Secret> {
        if value.is_empty() || value.len() > 65536 {
            anyhow::bail!("Secret value must be between 1 and 65536 characters");
        }

        let mut secrets = self.secrets.write().unwrap_or_else(|e| e.into_inner());
        let secret = secrets
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("Secret not found: {}", id))?;
        secret.value = encrypt_value(value);
        secret.updated = Some(chrono::Utc::now());
        // Return with decrypted value for immediate use
        let mut result = secret.clone();
        result.value = value.to_string();
        Ok(result)
    }

    pub fn delete_secret(&self, id: &str) -> bool {
        let mut secrets = self.secrets.write().unwrap_or_else(|e| e.into_inner());
        secrets.remove(id).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_get_secret() {
        let mgr = SecretsManager::new();
        let secret = mgr.create_secret("db-password", "s3cret!", None).unwrap();
        assert_eq!(secret.name, "db-password");
        assert_eq!(secret.value, "s3cret!");

        let found = mgr.get_secret(&secret.id).unwrap();
        assert_eq!(found.name, "db-password");
    }

    #[test]
    fn test_list_secrets_redacted() {
        let mgr = SecretsManager::new();
        mgr.create_secret("key1", "val1", None).unwrap();
        mgr.create_secret("key2", "val2", None).unwrap();

        let list = mgr.list_secrets();
        assert_eq!(list.len(), 2);
        // SecretInfo does not contain value field
    }

    #[test]
    fn test_update_secret() {
        let mgr = SecretsManager::new();
        let secret = mgr.create_secret("key", "old", None).unwrap();
        let updated = mgr.update_secret(&secret.id, "new").unwrap();
        assert_eq!(updated.value, "new");
        assert!(updated.updated.is_some());
    }

    #[test]
    fn test_delete_secret() {
        let mgr = SecretsManager::new();
        let secret = mgr.create_secret("key", "val", None).unwrap();
        assert!(mgr.delete_secret(&secret.id));
        assert!(!mgr.delete_secret(&secret.id));
        assert!(mgr.get_secret(&secret.id).is_none());
    }

    #[test]
    fn test_validation() {
        let mgr = SecretsManager::new();
        assert!(mgr.create_secret("", "val", None).is_err());
        assert!(mgr.create_secret("key", "", None).is_err());
    }

    // --- Encryption at rest tests ---

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let values = ["hello", "s3cret!", "a-longer-value-with-special-chars!@#$%"];
        for val in &values {
            let encrypted = encrypt_value(val);
            let decrypted = decrypt_value(&encrypted).unwrap();
            assert_eq!(&decrypted, val);
        }
    }

    #[test]
    fn test_encrypt_not_plaintext() {
        let encrypted = encrypt_value("my-secret-password");
        assert_ne!(encrypted, "my-secret-password");
    }

    #[test]
    fn test_decrypt_invalid_base64() {
        assert!(decrypt_value("not-valid-base64!!!").is_err());
    }
}
