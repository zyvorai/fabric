// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

pub mod ovf;

use anyhow::Result;
use std::path::Path;

/// Export a VM to OVA format (tar containing OVF descriptor + disk images).
pub fn export_ova(
    vm_name: &str,
    disk_path: &str,
    cpus: u32,
    memory_mb: u64,
    output_path: &str,
) -> Result<String> {
    // Validate inputs
    if vm_name.is_empty() || vm_name.len() > 128 {
        anyhow::bail!("Invalid VM name");
    }
    if !Path::new(disk_path).exists() {
        anyhow::bail!("Disk image not found: {}", disk_path);
    }

    // Step 1: Convert disk to VMDK
    let vmdk_path = format!("{}.vmdk", output_path.trim_end_matches(".ova"));
    let output = std::process::Command::new("qemu-img")
        .args([
            "convert", "-f", "qcow2", "-O", "vmdk", disk_path, &vmdk_path,
        ])
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("qemu-img convert failed: {}", stderr);
    }

    let vmdk_size = std::fs::metadata(&vmdk_path)?.len();

    // Step 2: Generate OVF descriptor
    let ovf_content = ovf::generate_ovf(vm_name, cpus, memory_mb, vmdk_size);
    let ovf_filename = format!("{}.ovf", vm_name);
    let ovf_path = format!("{}.ovf", output_path.trim_end_matches(".ova"));
    std::fs::write(&ovf_path, &ovf_content)?;

    // Step 3: Package as OVA (tar archive)
    let ova_path = if output_path.ends_with(".ova") {
        output_path.to_string()
    } else {
        format!("{}.ova", output_path)
    };

    let parent_dir = Path::new(&ovf_path)
        .parent()
        .unwrap_or(Path::new("."))
        .to_str()
        .unwrap_or(".");
    let vmdk_filename = Path::new(&vmdk_path)
        .file_name()
        .unwrap_or_default()
        .to_str()
        .unwrap_or_default();

    let tar_output = std::process::Command::new("tar")
        .args([
            "cf",
            &ova_path,
            "-C",
            parent_dir,
            &ovf_filename,
            vmdk_filename,
        ])
        .output()?;
    if !tar_output.status.success() {
        let stderr = String::from_utf8_lossy(&tar_output.stderr);
        // Clean up intermediate files on failure
        let _ = std::fs::remove_file(&ovf_path);
        let _ = std::fs::remove_file(&vmdk_path);
        anyhow::bail!("tar failed: {}", stderr);
    }

    // Clean up intermediate files
    let _ = std::fs::remove_file(&ovf_path);
    let _ = std::fs::remove_file(&vmdk_path);

    Ok(ova_path)
}
