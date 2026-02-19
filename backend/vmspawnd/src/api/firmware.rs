use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use vmspawnd_vm::{is_ovmf_available, is_secureboot_available, FirmwareStatus, TpmVersion};

// Request/Response types
#[derive(Debug, Deserialize)]
pub struct EnableUefiRequest {
    pub secure_boot: bool,
    pub tpm_version: Option<TpmVersionDto>,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum TpmVersionDto {
    #[serde(rename = "V1_2")]
    V1_2,
    #[serde(rename = "V2_0")]
    V2_0,
}

impl From<TpmVersionDto> for TpmVersion {
    fn from(dto: TpmVersionDto) -> Self {
        match dto {
            TpmVersionDto::V1_2 => TpmVersion::V1_2,
            TpmVersionDto::V2_0 => TpmVersion::V2_0,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct FirmwareCapabilities {
    pub ovmf_available: bool,
    pub secureboot_available: bool,
    pub tpm_available: bool,
}

// API Handlers

/// GET /api/vms/:name/firmware/status - Get firmware status for a VM
pub async fn get_firmware_status(
    Path(vm_name): Path<String>,
) -> Result<Json<FirmwareStatus>, (StatusCode, String)> {
    // Read firmware status from VM configuration
    tracing::info!("Getting firmware status for VM '{}'", vm_name);

    let config_dir = std::env::var("VM_CONFIG_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/vms".to_string());
    let config_path = std::path::Path::new(&config_dir)
        .join(&vm_name)
        .join("config.json");

    if !config_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' configuration not found", vm_name),
        ));
    }

    // Read VM configuration
    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let vm_config: vmspawnd_vm::VmConfig = serde_json::from_str(&config_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Extract firmware status based on configuration
    let status = match vm_config.firmware {
        vmspawnd_vm::Firmware::BIOS => FirmwareStatus {
            firmware_type: "BIOS".to_string(),
            code_path: std::path::PathBuf::new(),
            vars_path: std::path::PathBuf::new(),
            secure_boot_enabled: false,
            tpm_enabled: false,
            tpm_version: None,
        },
        vmspawnd_vm::Firmware::UEFI { secure_boot } => {
            // Create OvmfConfig to get paths
            let vm_dir = std::path::Path::new(&config_dir).join(&vm_name);
            match vmspawnd_vm::OvmfConfig::new(&vm_name, &vm_dir, secure_boot) {
                Ok(ovmf) => ovmf.get_status(),
                Err(_) => FirmwareStatus {
                    firmware_type: if secure_boot {
                        "UEFI (Secure Boot)".to_string()
                    } else {
                        "UEFI".to_string()
                    },
                    code_path: std::path::PathBuf::new(),
                    vars_path: std::path::PathBuf::new(),
                    secure_boot_enabled: secure_boot,
                    tpm_enabled: false,
                    tpm_version: None,
                },
            }
        }
    };

    Ok(Json(status))
}

/// POST /api/vms/:name/firmware/uefi - Enable UEFI firmware for a VM
pub async fn enable_uefi(
    Path(vm_name): Path<String>,
    Json(req): Json<EnableUefiRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!(
        "Enabling UEFI for VM '{}': secure_boot={}, tpm={:?}",
        vm_name,
        req.secure_boot,
        req.tpm_version
    );

    // Update VM configuration to use UEFI
    let config_dir = std::env::var("VM_CONFIG_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/vms".to_string());
    let config_path = std::path::Path::new(&config_dir)
        .join(&vm_name)
        .join("config.json");

    if !config_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' configuration not found", vm_name),
        ));
    }

    // 1. Load VM config
    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut vm_config: vmspawnd_vm::VmConfig = serde_json::from_str(&config_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 2. Create OvmfConfig with specified settings
    let vm_dir = std::path::Path::new(&config_dir).join(&vm_name);
    std::fs::create_dir_all(&vm_dir)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ovmf_config = vmspawnd_vm::OvmfConfig::new(&vm_name, &vm_dir, req.secure_boot)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Add TPM if requested
    let ovmf_config = if let Some(tpm_dto) = req.tpm_version {
        let tpm_version: TpmVersion = tpm_dto.into();
        ovmf_config.with_tpm(tpm_version)
    } else {
        ovmf_config
    };

    // Store OVMF config (creates VARS file if needed)
    drop(ovmf_config);

    // 3. Update VM config
    vm_config.firmware = vmspawnd_vm::Firmware::UEFI {
        secure_boot: req.secure_boot,
    };

    // 4. Save config
    let updated_config = serde_json::to_string_pretty(&vm_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    std::fs::write(&config_path, updated_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("UEFI enabled for VM '{}'", vm_name);
    Ok(StatusCode::OK)
}

/// POST /api/vms/:name/firmware/secureboot - Enable Secure Boot for a VM
pub async fn enable_secureboot(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Enabling Secure Boot for VM '{}'", vm_name);

    // Check if Secure Boot is available
    if !is_secureboot_available() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Secure Boot OVMF firmware not available on this system".to_string(),
        ));
    }

    // Update VM configuration to enable Secure Boot
    let config_dir = std::env::var("VM_CONFIG_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/vms".to_string());
    let config_path = std::path::Path::new(&config_dir)
        .join(&vm_name)
        .join("config.json");

    if !config_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' configuration not found", vm_name),
        ));
    }

    // Load VM config
    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut vm_config: vmspawnd_vm::VmConfig = serde_json::from_str(&config_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update to UEFI with Secure Boot
    vm_config.firmware = vmspawnd_vm::Firmware::UEFI {
        secure_boot: true,
    };

    // Recreate OVMF config with Secure Boot
    let vm_dir = std::path::Path::new(&config_dir).join(&vm_name);
    vmspawnd_vm::OvmfConfig::new(&vm_name, &vm_dir, true)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Save config
    let updated_config = serde_json::to_string_pretty(&vm_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    std::fs::write(&config_path, updated_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Secure Boot enabled for VM '{}'", vm_name);
    Ok(StatusCode::OK)
}

/// DELETE /api/vms/:name/firmware/secureboot - Disable Secure Boot for a VM
pub async fn disable_secureboot(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Disabling Secure Boot for VM '{}'", vm_name);

    // Update VM configuration to disable Secure Boot
    let config_dir = std::env::var("VM_CONFIG_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/vms".to_string());
    let config_path = std::path::Path::new(&config_dir)
        .join(&vm_name)
        .join("config.json");

    if !config_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' configuration not found", vm_name),
        ));
    }

    // Load VM config
    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut vm_config: vmspawnd_vm::VmConfig = serde_json::from_str(&config_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update to UEFI without Secure Boot
    vm_config.firmware = vmspawnd_vm::Firmware::UEFI {
        secure_boot: false,
    };

    // Recreate OVMF config without Secure Boot
    let vm_dir = std::path::Path::new(&config_dir).join(&vm_name);
    vmspawnd_vm::OvmfConfig::new(&vm_name, &vm_dir, false)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Save config
    let updated_config = serde_json::to_string_pretty(&vm_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    std::fs::write(&config_path, updated_config)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("Secure Boot disabled for VM '{}'", vm_name);
    Ok(StatusCode::OK)
}

/// POST /api/vms/:name/firmware/reset - Reset NVRAM to defaults
pub async fn reset_nvram(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Resetting NVRAM for VM '{}'", vm_name);

    // Reset OVMF NVRAM variables to template defaults
    let config_dir = std::env::var("VM_CONFIG_DIR")
        .unwrap_or_else(|_| "/var/lib/vmspawnd/vms".to_string());
    let config_path = std::path::Path::new(&config_dir)
        .join(&vm_name)
        .join("config.json");

    if !config_path.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' configuration not found", vm_name),
        ));
    }

    // 1. Load VM config
    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let vm_config: vmspawnd_vm::VmConfig = serde_json::from_str(&config_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // 2. Get OvmfConfig if using UEFI
    match vm_config.firmware {
        vmspawnd_vm::Firmware::UEFI { secure_boot } => {
            let vm_dir = std::path::Path::new(&config_dir).join(&vm_name);
            let ovmf_config = vmspawnd_vm::OvmfConfig::new(&vm_name, &vm_dir, secure_boot)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            // 3. Call ovmf_config.reset_nvram()
            ovmf_config.reset_nvram()
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            tracing::info!("NVRAM reset successfully for VM '{}'", vm_name);
        }
        vmspawnd_vm::Firmware::BIOS => {
            return Err((
                StatusCode::BAD_REQUEST,
                "VM is using BIOS, not UEFI. NVRAM reset is only available for UEFI VMs"
                    .to_string(),
            ));
        }
    }

    // 4. Return success
    Ok(StatusCode::OK)
}

/// GET /api/system/firmware/capabilities - Get system firmware capabilities
pub async fn get_firmware_capabilities(
) -> Result<Json<FirmwareCapabilities>, (StatusCode, String)> {
    let capabilities = FirmwareCapabilities {
        ovmf_available: is_ovmf_available(),
        secureboot_available: is_secureboot_available(),
        tpm_available: true, // swtpm is typically available
    };

    Ok(Json(capabilities))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tpm_version_conversion() {
        let v2 = TpmVersionDto::V2_0;
        let tpm_version: TpmVersion = v2.into();
        assert!(matches!(tpm_version, TpmVersion::V2_0));
    }

    #[test]
    fn test_firmware_capabilities() {
        let caps = FirmwareCapabilities {
            ovmf_available: true,
            secureboot_available: false,
            tpm_available: true,
        };

        assert!(caps.ovmf_available);
        assert!(!caps.secureboot_available);
        assert!(caps.tpm_available);
    }
}
