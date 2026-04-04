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
        if attempts.len() > 10_000 {
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

/// Global login rate limiter: 5 failed attempts per username per 5 minutes.
static LOGIN_LIMITER: std::sync::LazyLock<LoginRateLimiter> =
    std::sync::LazyLock::new(|| LoginRateLimiter::new(5, 300));

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
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
) -> Result<impl IntoResponse, StatusCode> {
    tracing::debug!("auth::{}", stringify!(login));

    // Rate limit check
    if LOGIN_LIMITER.is_limited(&req.username) {
        tracing::warn!("Login rate limited for user '{}'", req.username);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    let jwt_config = state.jwt_config.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    // Authenticate via PAM (system users)
    let pam_result = tokio::task::spawn_blocking({
        let username = req.username.clone();
        let password = req.password.clone();
        move || security::pam_auth::authenticate(&username, &password)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Err(_e) = pam_result {
        tracing::warn!("PAM authentication failed for '{}'", req.username);
        LOGIN_LIMITER.record_failure(&req.username);
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Successful PAM login — clear rate limit
    LOGIN_LIMITER.clear(&req.username);

    // Determine role: root and wheel/sudo group members get admin, others get user
    let role = if req.username == "root" || is_admin_user(&req.username) {
        security::Role::Admin
    } else {
        security::Role::User
    };

    let user_id = req.username.clone();
    let token = jwt_config
        .generate_token(&user_id, role.clone())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
fn is_admin_user(username: &str) -> bool {
    use std::process::Command;
    if let Ok(output) = Command::new("id").arg("-Gn").arg(username).output() {
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
) -> Result<impl IntoResponse, StatusCode> {
    tracing::debug!("auth::{}", stringify!(me));
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or(StatusCode::UNAUTHORIZED)?
        .clone();

    let user_db = state.user_db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = user_db
        .get_by_id(&claims.sub)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

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
