// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::server::AppState;

/// Simple IP-based rate limiter for login attempts.
/// Tracks failed attempts per username with a sliding window.
pub struct LoginRateLimiter {
    attempts: std::sync::Mutex<HashMap<String, Vec<std::time::Instant>>>,
    max_attempts: usize,
    window: std::time::Duration,
}

impl LoginRateLimiter {
    pub fn new(max_attempts: usize, window_secs: u64) -> Self {
        Self {
            attempts: std::sync::Mutex::new(HashMap::new()),
            max_attempts,
            window: std::time::Duration::from_secs(window_secs),
        }
    }

    /// Check if the given key is rate-limited. Returns true if blocked.
    pub fn is_limited(&self, key: &str) -> bool {
        let mut attempts = self.attempts.lock().unwrap_or_else(|e| {
            tracing::warn!("Rate limiter mutex was poisoned, recovering");
            e.into_inner()
        });
        let now = std::time::Instant::now();

        if let Some(times) = attempts.get_mut(key) {
            times.retain(|t| now.duration_since(*t) < self.window);
            times.len() >= self.max_attempts
        } else {
            false
        }
    }

    /// Record a failed attempt for the given key.
    pub fn record_failure(&self, key: &str) {
        let mut attempts = self.attempts.lock().unwrap_or_else(|e| {
            tracing::warn!("Rate limiter mutex was poisoned, recovering");
            e.into_inner()
        });
        let now = std::time::Instant::now();

        // Periodic eviction: remove stale entries when map exceeds threshold
        if attempts.len() > 1_000 {
            attempts.retain(|_, times| {
                times.retain(|t| now.duration_since(*t) < self.window);
                !times.is_empty()
            });
        }

        let times = attempts.entry(key.to_string()).or_default();
        times.retain(|t| now.duration_since(*t) < self.window);
        times.push(now);
    }

    /// Clear attempts for a key (on successful login).
    pub fn clear(&self, key: &str) {
        let mut attempts = self.attempts.lock().unwrap_or_else(|e| {
            tracing::warn!("Rate limiter mutex was poisoned, recovering");
            e.into_inner()
        });
        attempts.remove(key);
    }
}

/// Per-username login rate limiter: 5 failed attempts per username per 5 minutes.
static LOGIN_LIMITER: std::sync::LazyLock<LoginRateLimiter> =
    std::sync::LazyLock::new(|| LoginRateLimiter::new(5, 300));

/// Global login rate limiter: 50 failed attempts across all users per 5 minutes.
static GLOBAL_LOGIN_LIMITER: std::sync::LazyLock<LoginRateLimiter> =
    std::sync::LazyLock::new(|| LoginRateLimiter::new(50, 300));

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    pub totp_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user_id: String,
    pub role: String,
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub id: String,
    pub username: String,
    pub role: String,
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("auth::{}", stringify!(login));

    // Validate username format
    if req.username.is_empty() || req.username.len() > 64
        || !req.username.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(crate::api_error::json_error(StatusCode::BAD_REQUEST, "Invalid username format"));
    }

    // Rate limit check (per-user)
    if LOGIN_LIMITER.is_limited(&req.username) {
        tracing::warn!("Login rate limited for user '{}'", req.username);
        return Err(crate::api_error::json_error(StatusCode::TOO_MANY_REQUESTS, "Too many login attempts, try again later"));
    }

    // Global rate limit check (across all users)
    if GLOBAL_LOGIN_LIMITER.is_limited("__global__") {
        tracing::warn!("Global login rate limit exceeded");
        return Err(crate::api_error::json_error(StatusCode::TOO_MANY_REQUESTS, "Too many login attempts, try again later"));
    }

    let jwt_config = state.jwt_config.as_ref().ok_or_else(|| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;

    // Authenticate via PAM (system users)
    let pam_result = tokio::task::spawn_blocking({
        let username = req.username.clone();
        let password = req.password.clone();
        move || security::pam_auth::authenticate(&username, &password)
    })
    .await
    .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;

    if let Err(_e) = pam_result {
        tracing::warn!("PAM authentication failed for '{}'", req.username);
        LOGIN_LIMITER.record_failure(&req.username);
        GLOBAL_LOGIN_LIMITER.record_failure("__global__");
        return Err(crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
    }

    // Successful PAM login — clear rate limit
    LOGIN_LIMITER.clear(&req.username);

    // Check if TOTP 2FA is enabled for this user
    // Note: TOTP DB methods query by user ID (not username), so we must look up the user first.
    if let Some(ref user_db) = state.user_db {
        if let Ok(Some(db_user)) = user_db.get_by_username(&req.username) {
            let totp_enabled = user_db
                .is_totp_enabled(&db_user.id)
                .unwrap_or(false);
            if totp_enabled {
                match &req.totp_code {
                    None => {
                        return Err(crate::api_error::json_error_extras(
                            StatusCode::FORBIDDEN,
                            "unauthorized",
                            "2FA code required",
                            serde_json::json!({ "requires_2fa": true }),
                        ));
                    }
                    Some(code) => {
                        let secret = user_db
                            .get_totp_secret(&db_user.id)
                            .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;
                        if let Some(secret) = secret {
                            let valid = security::totp::verify_code(&secret, code)
                                .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;
                            if !valid {
                                return Err(crate::api_error::json_error(
                                    StatusCode::UNAUTHORIZED,
                                    "Invalid 2FA code",
                                ));
                            }
                        }
                    }
                }
            }
        }
    }

    // Determine role: root and wheel/sudo group members get admin, others get user
    let role = if req.username == "root" || is_admin_user(&req.username).await {
        security::Role::Admin
    } else {
        security::Role::User
    };

    let user_id = req.username.clone();
    let token = jwt_config
        .generate_token(&user_id, role.clone())
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;

    let role_str = match role {
        security::Role::Admin => "admin",
        security::Role::User => "user",
        security::Role::Viewer => "viewer",
    }.to_string();

    Ok(Json(LoginResponse {
        token,
        user_id: user_id.clone(),
        role: role_str,
        username: user_id,
    }))
}

/// Check if a user belongs to an admin group (wheel, sudo, or adm).
async fn is_admin_user(username: &str) -> bool {
    if let Ok(output) = tokio::process::Command::new("id")
        .arg("-Gn")
        .arg(username)
        .output()
        .await
    {
        if let Ok(groups) = String::from_utf8(output.stdout) {
            return groups.split_whitespace()
                .any(|g| g == "wheel" || g == "sudo" || g == "adm");
        }
    }
    false
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    req: axum::extract::Request,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    tracing::debug!("auth::{}", stringify!(me));
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or_else(|| crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Authentication required"))?
        .clone();

    let user_db = state.user_db.as_ref().ok_or_else(|| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;

    let user = user_db
        .get_by_id(&claims.sub)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?
        .ok_or_else(|| crate::api_error::json_error(StatusCode::NOT_FOUND, "User not found"))?;

    let role_str = match user.role {
        security::Role::Admin => "admin",
        security::Role::User => "user",
        security::Role::Viewer => "viewer",
    }.to_string();

    Ok(Json(MeResponse {
        id: user.id,
        username: user.username,
        role: role_str,
    }))
}

// ============================================================================
// 2FA / TOTP endpoints
// ============================================================================

#[derive(Debug, Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub otpauth_url: String,
}

#[derive(Debug, Deserialize)]
pub struct TotpVerifyRequest {
    pub code: String,
}

/// POST /api/auth/2fa/setup - Generate a TOTP secret for the authenticated user.
pub async fn setup_2fa(
    State(state): State<Arc<AppState>>,
    req: axum::extract::Request,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or_else(|| crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Authentication required"))?
        .clone();

    let user_db = state.user_db.as_ref().ok_or_else(|| {
        crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Auth not configured")
    })?;

    // Check if already enabled
    let already_enabled = user_db
        .is_totp_enabled(&claims.sub)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?;
    if already_enabled {
        return Err(crate::api_error::json_error(StatusCode::CONFLICT, "2FA is already enabled"));
    }

    let (secret, otpauth_url) = security::totp::generate_secret(&claims.sub, "vmspawnd")
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate TOTP secret"))?;

    // Store the secret (but don't enable yet until verified)
    user_db
        .enable_totp(&claims.sub, &secret)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save TOTP secret"))?;

    Ok(Json(TotpSetupResponse {
        secret,
        otpauth_url,
    }))
}

/// POST /api/auth/2fa/verify - Verify a TOTP code (used during setup confirmation).
pub async fn verify_2fa(
    State(state): State<Arc<AppState>>,
    req: axum::extract::Request,
    // We need to extract the body manually since we already consumed extensions
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or_else(|| crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Authentication required"))?
        .clone();

    let body = axum::body::to_bytes(req.into_body(), 1024)
        .await
        .map_err(|_| crate::api_error::json_error(StatusCode::BAD_REQUEST, "Invalid request body"))?;
    let verify_req: TotpVerifyRequest = serde_json::from_slice(&body)
        .map_err(|_| crate::api_error::json_error(StatusCode::BAD_REQUEST, "Invalid JSON"))?;

    let user_db = state.user_db.as_ref().ok_or_else(|| {
        crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Auth not configured")
    })?;

    let secret = user_db
        .get_totp_secret(&claims.sub)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))?
        .ok_or_else(|| crate::api_error::json_error(StatusCode::NOT_FOUND, "2FA not set up"))?;

    let valid = security::totp::verify_code(&secret, &verify_req.code)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Verification failed"))?;

    if valid {
        Ok(Json(serde_json::json!({"verified": true, "message": "2FA is now active"})))
    } else {
        Err(crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Invalid TOTP code"))
    }
}

/// POST /api/auth/2fa/disable - Disable 2FA for the authenticated user.
pub async fn disable_2fa(
    State(state): State<Arc<AppState>>,
    req: axum::extract::Request,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or_else(|| crate::api_error::json_error(StatusCode::UNAUTHORIZED, "Authentication required"))?
        .clone();

    let user_db = state.user_db.as_ref().ok_or_else(|| {
        crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Auth not configured")
    })?;

    user_db
        .disable_totp(&claims.sub)
        .map_err(|_| crate::api_error::json_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to disable 2FA"))?;

    Ok(Json(serde_json::json!({"message": "2FA disabled successfully"})))
}
