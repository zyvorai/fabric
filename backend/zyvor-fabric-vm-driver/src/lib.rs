// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! Builds base VM disk images via `mkosi`, an offline OS-image-building
//! tool — unrelated to VM *lifecycle* (start/stop/etc.), which is entirely
//! `state.driver`'s job (`driver-core::VmDriver`, Ephemera-backed). This
//! crate used to also hold the systemd-vmspawn/machinectl VM-lifecycle
//! shellouts `MachinectlDriver` wrapped; those were deleted alongside
//! `machinectl-driver`/`machined-dbus` once every capability they provided
//! had a real Ephemera-backed equivalent (see the systemd-removal
//! migration plan).

use anyhow::{anyhow, Result};

/// Build a VM image using mkosi
///
/// mkosi builds OS images from a configuration. Usage:
///   mkosi -d <distribution> -p <packages> --autologin -o <output> build
pub fn build_image_mkosi(config: &MkosiConfig) -> Result<String> {
    let output_path = format!("/var/lib/zyvor-fabricd/images/{}.raw", config.name);

    let mut cmd = std::process::Command::new("mkosi");

    // Distribution
    cmd.arg("-d").arg(&config.distribution);

    // Packages
    for pkg in &config.packages {
        cmd.arg("-p").arg(pkg);
    }

    // Output
    cmd.arg("-o").arg(&output_path);

    // Force rebuild
    cmd.arg("-f");

    // Auto-login for convenience
    if config.autologin {
        cmd.arg("--autologin");
    }

    // Build command
    cmd.arg("build");

    tracing::info!("Building image '{}' with mkosi: {:?}", config.name, cmd);

    let output = cmd
        .output()
        .map_err(|e| anyhow!("Failed to run mkosi: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("mkosi build failed: {}", stderr));
    }

    tracing::info!(
        "Image '{}' built successfully at {}",
        config.name,
        output_path
    );
    Ok(output_path)
}

/// Configuration for mkosi image builds
#[derive(Debug, Clone)]
pub struct MkosiConfig {
    pub name: String,
    pub distribution: String,
    pub packages: Vec<String>,
    pub autologin: bool,
}
