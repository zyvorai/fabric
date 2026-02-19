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
    // TODO: Read firmware status from VM configuration
    // For now, return a placeholder response
    tracing::info!("Getting firmware status for VM '{}'", vm_name);

    // This would typically read from the VM's configuration file
    Err((
        StatusCode::NOT_IMPLEMENTED,
        "Firmware status retrieval not yet implemented".to_string(),
    ))
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

    // TODO: Update VM configuration to use UEFI
    // This would:
    // 1. Load VM config
    // 2. Create OvmfConfig with specified settings
    // 3. Update VM config
    // 4. Save config

    Ok(StatusCode::OK)
}

/// POST /api/vms/:name/firmware/secureboot - Enable Secure Boot for a VM
pub async fn enable_secureboot(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Enabling Secure Boot for VM '{}'", vm_name);

    // TODO: Update VM configuration to enable Secure Boot
    // This requires OVMF with Secure Boot support

    if !is_secureboot_available() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Secure Boot OVMF firmware not available on this system".to_string(),
        ));
    }

    Ok(StatusCode::OK)
}

/// DELETE /api/vms/:name/firmware/secureboot - Disable Secure Boot for a VM
pub async fn disable_secureboot(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Disabling Secure Boot for VM '{}'", vm_name);

    // TODO: Update VM configuration to disable Secure Boot

    Ok(StatusCode::OK)
}

/// POST /api/vms/:name/firmware/reset - Reset NVRAM to defaults
pub async fn reset_nvram(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Resetting NVRAM for VM '{}'", vm_name);

    // TODO: Reset OVMF NVRAM variables to template defaults
    // This would:
    // 1. Load VM config
    // 2. Get OvmfConfig
    // 3. Call ovmf_config.reset_nvram()
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
