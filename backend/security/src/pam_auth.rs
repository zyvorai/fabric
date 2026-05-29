// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::{Context, Result};

/// Authenticate a user against PAM.
///
/// Uses the "vmspawnd" PAM service if available, falling back to "login".
pub fn authenticate(username: &str, password: &str) -> Result<()> {
    let service = if std::path::Path::new("/etc/pam.d/vmspawnd").exists() {
        "vmspawnd"
    } else {
        "login"
    };

    let mut client = pam::Client::with_password(service).context("Failed to create PAM client")?;

    client
        .conversation_mut()
        .set_credentials(username, password);

    client
        .authenticate()
        .map_err(|e| anyhow::anyhow!("PAM authentication failed: {:?}", e))?;

    Ok(())
}
