pub mod db;
pub mod pam_auth;
pub mod totp;

use anyhow::Result;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // subject (user id)
    pub role: Role,
    pub exp: usize, // expiration time
    #[serde(default)]
    pub jti: String, // JWT ID for revocation
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    User,
    Viewer,
}

impl Role {
    pub fn can_write(&self) -> bool {
        matches!(self, Role::Admin | Role::User)
    }

    pub fn can_read(&self) -> bool {
        true // All roles can read
    }

    pub fn can_manage(&self) -> bool {
        matches!(self, Role::Admin)
    }
}

pub struct JwtConfig {
    pub secret: String,
    pub expiration_hours: i64,
    /// Maps JTI -> expiration timestamp so expired entries can be evicted.
    revoked_tokens: std::sync::Mutex<std::collections::HashMap<String, usize>>,
}

impl JwtConfig {
    pub fn new(secret: String) -> Self {
        Self {
            secret,
            expiration_hours: 24,
            revoked_tokens: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    pub fn generate_token(&self, user_id: &str, role: Role) -> Result<String> {
        let hours = if self.expiration_hours < 1 {
            tracing::warn!("Token expiration_hours ({}) is too low, using minimum of 1 hour", self.expiration_hours);
            1
        } else {
            self.expiration_hours
        };
        let expiration = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(hours))
            .ok_or_else(|| anyhow::anyhow!("Token expiration time overflow"))?
            .timestamp() as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            role,
            exp: expiration,
            jti: uuid::Uuid::new_v4().to_string(),
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )?;

        Ok(token)
    }

    pub fn validate_token(&self, token: &str) -> Result<Claims> {
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )?;

        let claims = token_data.claims;
        if let Ok(revoked) = self.revoked_tokens.lock() {
            if !claims.jti.is_empty() && revoked.contains_key(&claims.jti) {
                return Err(anyhow::anyhow!("Token has been revoked"));
            }
        }
        Ok(claims)
    }

    pub fn revoke_token(&self, jti: &str) {
        self.revoke_token_with_exp(jti, 0);
    }

    /// Revoke a token, recording its expiration time for later cleanup.
    pub fn revoke_token_with_exp(&self, jti: &str, exp: usize) {
        if let Ok(mut revoked) = self.revoked_tokens.lock() {
            revoked.insert(jti.to_string(), exp);
            // Evict expired entries when the set grows large
            if revoked.len() > 100_000 {
                let now = chrono::Utc::now().timestamp() as usize;
                revoked.retain(|_, token_exp| *token_exp == 0 || *token_exp > now);
            }
        }
    }
}

pub async fn auth_middleware(
    State(jwt_config): State<Arc<JwtConfig>>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    let token = match auth_header {
        Some(header) => header.strip_prefix("Bearer ").ok_or(StatusCode::UNAUTHORIZED)?,
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    let claims = jwt_config
        .validate_token(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Add claims to request extensions
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
}

// ============================================================================
// Role-based authorization extractors
// ============================================================================

/// When auth middleware is not active (auth disabled), extractors use this
/// default Claims. Defaults to Viewer role so that unauthenticated requests
/// only get read access, not full admin privileges. Endpoints that require
/// write or admin access will reject these claims via their role checks.
fn unauthenticated_claims() -> Claims {
    Claims {
        sub: "anonymous".to_string(),
        role: Role::Viewer,
        exp: usize::MAX,
        jti: String::new(),
    }
}

/// Extractor that requires the caller to have at least read permission (any role).
/// When auth is disabled (no claims in extensions), allows the request through.
pub struct RequireRead(pub Claims);

impl<S> axum::extract::FromRequestParts<S> for RequireRead
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let claims = parts.extensions.get::<Claims>().cloned()
            .unwrap_or_else(unauthenticated_claims);
        Ok(RequireRead(claims))
    }
}

/// Extractor that requires the caller to have write permission (Admin or User).
/// Rejects Viewer role with 403 Forbidden.
/// When auth is disabled (no claims in extensions), allows the request through.
pub struct RequireWrite(pub Claims);

impl<S> axum::extract::FromRequestParts<S> for RequireWrite
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let claims = parts.extensions.get::<Claims>().cloned()
            .unwrap_or_else(unauthenticated_claims);
        if !claims.role.can_write() {
            tracing::warn!(
                "Authorization denied: user '{}' with role {:?} attempted a write operation",
                claims.sub, claims.role
            );
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(RequireWrite(claims))
    }
}

/// Extractor that requires the caller to have admin permission (Admin only).
/// Rejects User and Viewer roles with 403 Forbidden.
/// When auth is disabled (no claims in extensions), allows the request through.
pub struct RequireAdmin(pub Claims);

impl<S> axum::extract::FromRequestParts<S> for RequireAdmin
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let claims = parts.extensions.get::<Claims>().cloned()
            .unwrap_or_else(unauthenticated_claims);
        if !claims.role.can_manage() {
            tracing::warn!(
                "Authorization denied: user '{}' with role {:?} attempted an admin operation",
                claims.sub, claims.role
            );
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(RequireAdmin(claims))
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub role: Role,
}

impl User {
    pub fn new(id: String, username: String, password: &str, role: Role) -> Result<Self> {
        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;
        Ok(Self {
            id,
            username,
            password_hash,
            role,
        })
    }

    pub fn verify_password(&self, password: &str) -> Result<bool> {
        Ok(bcrypt::verify(password, &self.password_hash)?)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user_id: String,
    pub role: Role,
}

// Audit logging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub user_id: String,
    pub action: String,
    pub resource: String,
    pub status: String,
}

impl AuditLog {
    pub fn new(user_id: String, action: String, resource: String, status: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            user_id,
            action,
            resource,
            status,
        }
    }

    pub fn log(&self) -> Result<()> {
        tracing::info!(
            "AUDIT: {} {} {} {} at {}",
            self.user_id,
            self.action,
            self.resource,
            self.status,
            self.timestamp
        );
        Ok(())
    }
}
