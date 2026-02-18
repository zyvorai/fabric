use anyhow::Result;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
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
            .unwrap()
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
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    let claims = jwt_config
        .validate_token(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Add claims to request extensions
    req.extensions_mut().insert(claims);

    Ok(next.run(req).await)
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
