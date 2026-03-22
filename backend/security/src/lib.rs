pub mod db;

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
}

impl JwtConfig {
    pub fn new(secret: String) -> Self {
        Self {
            secret,
            expiration_hours: 24,
        }
    }

    pub fn generate_token(&self, user_id: &str, role: Role) -> Result<String> {
        let expiration = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(self.expiration_hours))
            .ok_or_else(|| anyhow::anyhow!("Token expiration time overflow"))?
            .timestamp() as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            role,
            exp: expiration,
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

        Ok(token_data.claims)
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
/// default Claims to allow all operations.
fn unauthenticated_claims() -> Claims {
    Claims {
        sub: "anonymous".to_string(),
        role: Role::Admin,
        exp: usize::MAX,
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
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub user_id: String,
    pub action: String,
    pub resource: String,
    pub status: String,
}

impl AuditLog {
    pub fn new(user_id: String, action: String, resource: String, status: String) -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            user_id,
            action,
            resource,
            status,
        }
    }

    pub fn log(&self) -> Result<()> {
        // In production, write to audit log file or database
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
