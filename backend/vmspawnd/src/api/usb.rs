use axum::{http::StatusCode, Json};
use serde::Serialize;
use security::RequireRead;

#[derive(Debug, Serialize)]
pub struct UsbDevice {
    pub bus: String,
    pub device: String,
    pub vendor_id: String,
    pub product_id: String,
    pub description: String,
}

/// GET /api/system/usb - List USB devices available for passthrough
pub async fn list_usb_devices(
    RequireRead(_claims): RequireRead,
) -> Result<Json<Vec<UsbDevice>>, (StatusCode, Json<serde_json::Value>)> {
    let output = tokio::process::Command::new("lsusb")
        .output()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Failed to run lsusb: {}", e)})),
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let devices: Vec<UsbDevice> = stdout
        .lines()
        .filter_map(|line| {
            // Parse "Bus 001 Device 002: ID 1234:5678 Description"
            let parts: Vec<&str> = line.splitn(7, ' ').collect();
            if parts.len() >= 7 {
                let id_part = parts[5].trim_end_matches(':'); // remove trailing colon
                let ids: Vec<&str> = id_part.split(':').collect();
                if ids.len() == 2 {
                    return Some(UsbDevice {
                        bus: parts[1].to_string(),
                        device: parts[3].trim_end_matches(':').to_string(),
                        vendor_id: ids[0].to_string(),
                        product_id: ids[1].to_string(),
                        description: parts.get(6).unwrap_or(&"").to_string(),
                    });
                }
            }
            None
        })
        .collect();

    Ok(Json(devices))
}
