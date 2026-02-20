use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use std::sync::Arc;
use uuid::Uuid;

use crate::server::AppState;
use certificate_manager::{
    CertHealthDashboard, CertStatus, Certificate, CertificateAuthority, CertificateRequest,
    CertificateRotation, RotationStatus, TrustAttestation, VmSecurityBaseline,
    VmSecurityCompliance,
};

// ============================================================================
// Certificate authority handlers
// ============================================================================

pub async fn list_cas(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<CertificateAuthority> = state.store.list_entities("cert_cas").unwrap_or_default();
    Json(items)
}

pub async fn create_ca(
    State(state): State<Arc<AppState>>,
    Json(mut ca): Json<CertificateAuthority>,
) -> impl IntoResponse {
    if ca.id.is_empty() { ca.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    ca.created = now;
    ca.updated = now;
    match state.store.save_entity("cert_cas", &ca.id, &ca) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&ca).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn delete_ca(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.store.delete_entity("cert_cas", &id);
    StatusCode::NO_CONTENT
}

// ============================================================================
// Certificate handlers
// ============================================================================

pub async fn list_certificates(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<Certificate> = state.store.list_entities("certificates").unwrap_or_default();
    Json(items)
}

pub async fn issue_certificate(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CertificateRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let not_after = now + chrono::Duration::days(req.validity_days as i64);
    let cert = Certificate {
        id: Uuid::new_v4().to_string(),
        common_name: req.common_name,
        subject_alt_names: req.subject_alt_names,
        issuer: req.ca_id,
        serial_number: Uuid::new_v4().to_string(),
        not_before: now,
        not_after,
        fingerprint_sha256: format!("sha256:{}", Uuid::new_v4()),
        key_algorithm: req.key_algorithm,
        usage: req.usage,
        status: CertStatus::Active,
        auto_renew: req.auto_renew,
        component: req.component,
        created: now,
        updated: now,
    };
    match state.store.save_entity("certificates", &cert.id, &cert) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&cert).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn revoke_certificate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut cert = match state.store.get_entity::<Certificate>("certificates", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    cert.status = CertStatus::Revoked;
    cert.updated = Utc::now();
    let _ = state.store.save_entity("certificates", &cert.id, &cert);
    StatusCode::OK.into_response()
}

pub async fn renew_certificate(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let old_cert = match state.store.get_entity::<Certificate>("certificates", &id) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let now = Utc::now();
    let validity = old_cert.not_after - old_cert.not_before;
    // Mark old cert as expired first (before moving fields)
    let mut expired = old_cert.clone();
    expired.status = CertStatus::Expired;
    expired.updated = now;
    let _ = state.store.save_entity("certificates", &id, &expired);
    let new_cert = Certificate {
        id: Uuid::new_v4().to_string(),
        common_name: old_cert.common_name,
        subject_alt_names: old_cert.subject_alt_names,
        issuer: old_cert.issuer,
        serial_number: Uuid::new_v4().to_string(),
        not_before: now,
        not_after: now + validity,
        fingerprint_sha256: format!("sha256:{}", Uuid::new_v4()),
        key_algorithm: old_cert.key_algorithm,
        usage: old_cert.usage,
        status: CertStatus::Active,
        auto_renew: old_cert.auto_renew,
        component: old_cert.component,
        created: now,
        updated: now,
    };
    let _ = state.store.save_entity("certificates", &new_cert.id, &new_cert);
    Json(serde_json::to_value(&new_cert).unwrap()).into_response()
}

#[derive(serde::Deserialize)]
pub struct ExpiringQuery {
    #[serde(default = "default_days")]
    pub days: u32,
}

fn default_days() -> u32 { 30 }

pub async fn check_expiring(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<ExpiringQuery>,
) -> impl IntoResponse {
    let certs: Vec<Certificate> = state.store.list_entities("certificates").unwrap_or_default();
    let threshold = Utc::now() + chrono::Duration::days(query.days as i64);
    let expiring: Vec<_> = certs.into_iter()
        .filter(|c| c.status == CertStatus::Active && c.not_after <= threshold)
        .collect();
    Json(expiring)
}

// ============================================================================
// Certificate request handlers
// ============================================================================

pub async fn list_cert_requests(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<CertificateRequest> = state.store.list_entities("cert_requests").unwrap_or_default();
    Json(items)
}

pub async fn submit_cert_request(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CertificateRequest>,
) -> impl IntoResponse {
    if req.id.is_empty() { req.id = Uuid::new_v4().to_string(); }
    req.status = certificate_manager::CsrStatus::Pending;
    req.created = Utc::now();
    match state.store.save_entity("cert_requests", &req.id, &req) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&req).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn approve_cert_request(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut req = match state.store.get_entity::<CertificateRequest>("cert_requests", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    req.status = certificate_manager::CsrStatus::Approved;
    let _ = state.store.save_entity("cert_requests", &req.id, &req);
    Json(serde_json::to_value(&req).unwrap()).into_response()
}

pub async fn reject_cert_request(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut req = match state.store.get_entity::<CertificateRequest>("cert_requests", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    req.status = certificate_manager::CsrStatus::Rejected;
    let _ = state.store.save_entity("cert_requests", &req.id, &req);
    StatusCode::OK.into_response()
}

// ============================================================================
// Rotation handlers
// ============================================================================

pub async fn list_rotations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<CertificateRotation> = state.store.list_entities("cert_rotations").unwrap_or_default();
    Json(items)
}

#[derive(serde::Deserialize)]
pub struct ScheduleRotationRequest {
    pub certificate_id: String,
    pub scheduled_at: chrono::DateTime<Utc>,
}

pub async fn schedule_rotation(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ScheduleRotationRequest>,
) -> impl IntoResponse {
    let cert = match state.store.get_entity::<Certificate>("certificates", &req.certificate_id) {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let rotation = CertificateRotation {
        id: Uuid::new_v4().to_string(),
        certificate_id: req.certificate_id,
        old_cert_fingerprint: cert.fingerprint_sha256,
        new_cert_fingerprint: None,
        status: RotationStatus::Scheduled,
        scheduled_at: req.scheduled_at,
        completed_at: None,
        error: None,
    };
    let _ = state.store.save_entity("cert_rotations", &rotation.id, &rotation);
    (StatusCode::CREATED, Json(serde_json::to_value(&rotation).unwrap())).into_response()
}

pub async fn execute_rotation(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut rotation = match state.store.get_entity::<CertificateRotation>("cert_rotations", &id) {
        Ok(Some(r)) => r,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    rotation.status = RotationStatus::Completed;
    rotation.new_cert_fingerprint = Some(format!("sha256:{}", Uuid::new_v4()));
    rotation.completed_at = Some(Utc::now());
    let _ = state.store.save_entity("cert_rotations", &rotation.id, &rotation);
    Json(serde_json::to_value(&rotation).unwrap()).into_response()
}

// ============================================================================
// Attestation handlers
// ============================================================================

pub async fn list_attestations(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<TrustAttestation> = state.store.list_entities("attestations").unwrap_or_default();
    Json(items)
}

pub async fn submit_attestation(
    State(state): State<Arc<AppState>>,
    Json(att): Json<TrustAttestation>,
) -> impl IntoResponse {
    match state.store.save_entity("attestations", &att.host_id, &att) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&att).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

pub async fn verify_attestation(
    State(state): State<Arc<AppState>>,
    Path(host_id): Path<String>,
) -> impl IntoResponse {
    let mut att = match state.store.get_entity::<TrustAttestation>("attestations", &host_id) {
        Ok(Some(a)) => a,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let trusted = att.tpm_present && att.secure_boot_enabled && att.measured_boot_valid;
    att.attestation_status = if trusted {
        certificate_manager::AttestationStatus::Trusted
    } else {
        certificate_manager::AttestationStatus::Untrusted
    };
    att.last_attested = Some(Utc::now());
    let _ = state.store.save_entity("attestations", &att.host_id, &att);
    Json(serde_json::json!({"trusted": trusted})).into_response()
}

// ============================================================================
// Security baseline handlers
// ============================================================================

pub async fn list_security_baselines(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let items: Vec<VmSecurityBaseline> = state.store.list_entities("security_baselines").unwrap_or_default();
    Json(items)
}

pub async fn create_security_baseline(
    State(state): State<Arc<AppState>>,
    Json(mut baseline): Json<VmSecurityBaseline>,
) -> impl IntoResponse {
    if baseline.id.is_empty() { baseline.id = Uuid::new_v4().to_string(); }
    let now = Utc::now();
    baseline.created = now;
    baseline.updated = now;
    match state.store.save_entity("security_baselines", &baseline.id, &baseline) {
        Ok(_) => (StatusCode::CREATED, Json(serde_json::to_value(&baseline).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct VmComplianceRequest {
    pub vm_name: String,
    pub vm_encrypted: bool,
    pub vm_has_tpm: bool,
    pub vm_secure_boot: bool,
    pub host_trusted: bool,
}

pub async fn check_vm_security_compliance(
    State(state): State<Arc<AppState>>,
    Path(baseline_id): Path<String>,
    Json(req): Json<VmComplianceRequest>,
) -> impl IntoResponse {
    let baseline = match state.store.get_entity::<VmSecurityBaseline>("security_baselines", &baseline_id) {
        Ok(Some(b)) => b,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mut violations = Vec::new();
    if baseline.require_encryption && !req.vm_encrypted {
        violations.push("VM disk encryption is required but not enabled".to_string());
    }
    if baseline.require_tpm && !req.vm_has_tpm {
        violations.push("TPM is required but not present".to_string());
    }
    if baseline.require_secure_boot && !req.vm_secure_boot {
        violations.push("Secure boot is required but not enabled".to_string());
    }
    if baseline.require_trusted_host && !req.host_trusted {
        violations.push("Trusted host is required but host is not trusted".to_string());
    }
    let result = VmSecurityCompliance {
        vm_name: req.vm_name,
        baseline_id: baseline_id,
        baseline_name: baseline.name,
        compliant: violations.is_empty(),
        violations,
        checked_at: Utc::now(),
    };
    Json(serde_json::to_value(&result).unwrap()).into_response()
}

// ============================================================================
// Dashboard
// ============================================================================

pub async fn get_cert_health_dashboard(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let certs: Vec<Certificate> = state.store.list_entities("certificates").unwrap_or_default();
    let cas: Vec<CertificateAuthority> = state.store.list_entities("cert_cas").unwrap_or_default();
    let requests: Vec<CertificateRequest> = state.store.list_entities("cert_requests").unwrap_or_default();
    let rotations: Vec<CertificateRotation> = state.store.list_entities("cert_rotations").unwrap_or_default();
    let now = Utc::now();
    let expiry_threshold = now + chrono::Duration::days(30);
    let mut active = 0u32;
    let mut expiring_soon = 0u32;
    let mut expired = 0u32;
    let mut revoked = 0u32;
    for cert in &certs {
        match cert.status {
            CertStatus::Active => {
                active += 1;
                if cert.not_after <= expiry_threshold { expiring_soon += 1; }
            }
            CertStatus::Expired => expired += 1,
            CertStatus::Revoked => revoked += 1,
            CertStatus::PendingRenewal => active += 1,
        }
    }
    let pending_requests = requests.iter()
        .filter(|r| r.status == certificate_manager::CsrStatus::Pending)
        .count() as u32;
    let dashboard = CertHealthDashboard {
        total_certs: certs.len() as u32,
        active,
        expiring_soon,
        expired,
        revoked,
        cas: cas.len() as u32,
        pending_requests,
        recent_rotations: rotations,
    };
    Json(dashboard)
}
