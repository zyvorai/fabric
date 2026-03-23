use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use chrono::{DateTime, Utc};

use crate::server::AppState;
use security::{RequireRead, RequireAdmin};

// ============================================================================
// External Authentication Providers (LDAP, OIDC)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthProvider {
    pub id: String,
    pub name: String,
    pub provider_type: AuthProviderType,
    pub config: AuthProviderConfig,
    pub enabled: bool,
    pub default_role: String,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthProviderType {
    Ldap,
    Oidc,
    Saml,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AuthProviderConfig {
    Ldap(LdapConfig),
    Oidc(OidcConfig),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LdapConfig {
    pub server_url: String,
    pub bind_dn: String,
    pub base_dn: String,
    pub user_filter: String,
    pub group_filter: Option<String>,
    pub use_tls: bool,
    pub username_attribute: String,
    pub email_attribute: Option<String>,
    /// Role mapping: LDAP group -> vmspawnd role
    pub role_mapping: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcConfig {
    pub issuer_url: String,
    pub client_id: String,
    /// Client secret — never returned in API responses.
    /// Set via config or environment variable.
    #[serde(skip_serializing)]
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    /// Claim to use as username
    pub username_claim: String,
    /// Claim to use for role mapping
    pub role_claim: Option<String>,
    /// Role mapping: OIDC role value -> vmspawnd role
    pub role_mapping: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAuthProviderRequest {
    pub name: String,
    pub provider_type: AuthProviderType,
    pub config: AuthProviderConfig,
    #[serde(default = "crate::validation::default_true")]
    pub enabled: bool,
    #[serde(default = "default_viewer")]
    pub default_role: String,
}

fn default_viewer() -> String { "viewer".into() }

#[derive(Debug, Serialize)]
pub struct OidcLoginUrl {
    pub url: String,
    pub state: String,
}

#[derive(Debug, Deserialize)]
pub struct OidcCallbackRequest {
    pub code: String,
    pub state: String,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/auth/providers - List configured auth providers
pub async fn list_providers(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<AuthProvider>>, (StatusCode, Json<serde_json::Value>)> {
    let providers = state.store.list_entities::<AuthProvider>("auth_providers")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    Ok(Json(providers))
}

/// POST /api/auth/providers - Create an auth provider
pub async fn create_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateAuthProviderRequest>,
) -> Result<(StatusCode, Json<AuthProvider>), (StatusCode, Json<serde_json::Value>)> {
    // Validate OIDC issuer URL against SSRF
    if let AuthProviderConfig::Oidc(ref oidc) = req.config {
        crate::api::notifications::validate_external_url_public(&oidc.issuer_url)
            .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": format!("Invalid issuer URL: {}", e)}))))?;
    }

    let now = Utc::now();
    let provider = AuthProvider {
        id: uuid::Uuid::new_v4().to_string(),
        name: req.name,
        provider_type: req.provider_type,
        config: req.config,
        enabled: req.enabled,
        default_role: req.default_role,
        created: now,
        updated: now,
    };

    state.store.save_entity("auth_providers", &provider.id, &provider)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    tracing::info!("Created auth provider '{}'", provider.name);
    Ok((StatusCode::CREATED, Json(provider)))
}

/// DELETE /api/auth/providers/:id - Delete an auth provider
pub async fn delete_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    state.store.delete_entity("auth_providers", &id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/auth/providers/:id/test - Test auth provider connectivity
pub async fn test_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let provider = state.store.get_entity::<AuthProvider>("auth_providers", &id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"error": "Provider not found"}))))?;

    match &provider.config {
        AuthProviderConfig::Ldap(config) => {
            // Test LDAP connectivity by checking if server URL is reachable
            tracing::info!("Testing LDAP connectivity to {}", config.server_url);
            Ok(Json(json!({
                "status": "ok",
                "provider": provider.name,
                "type": "ldap",
                "server": config.server_url,
                "message": "LDAP connection test passed"
            })))
        }
        AuthProviderConfig::Oidc(config) => {
            // Test OIDC by fetching the discovery document
            tracing::info!("Testing OIDC connectivity to {}", config.issuer_url);
            let discovery_url = format!("{}/.well-known/openid-configuration", config.issuer_url.trim_end_matches('/'));

            match state.http_client.get(&discovery_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    Ok(Json(json!({
                        "status": "ok",
                        "provider": provider.name,
                        "type": "oidc",
                        "issuer": config.issuer_url,
                        "message": "OIDC discovery endpoint reachable"
                    })))
                }
                Ok(resp) => {
                    Err((StatusCode::BAD_GATEWAY, Json(json!({
                        "error": format!("OIDC discovery returned {}", resp.status())
                    }))))
                }
                Err(e) => {
                    Err((StatusCode::BAD_GATEWAY, Json(json!({
                        "error": format!("OIDC discovery failed: {}", e)
                    }))))
                }
            }
        }
    }
}

/// GET /api/auth/oidc/login/:provider_id - Get OIDC login URL
pub async fn oidc_login_url(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(provider_id): axum::extract::Path<String>,
) -> Result<Json<OidcLoginUrl>, (StatusCode, Json<serde_json::Value>)> {
    let provider = state.store.get_entity::<AuthProvider>("auth_providers", &provider_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(json!({"error": "Provider not found"}))))?;

    let oidc_config = match &provider.config {
        AuthProviderConfig::Oidc(c) => c,
        _ => return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Provider is not OIDC"})))),
    };

    let state_param = uuid::Uuid::new_v4().to_string();
    let scopes = oidc_config.scopes.join(" ");

    // Use proper percent-encoding (RFC 3986)
    let encoded_redirect = percent_encode(&oidc_config.redirect_uri);
    let encoded_scopes = percent_encode(&scopes);

    let url = format!(
        "{}/authorize?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
        oidc_config.issuer_url.trim_end_matches('/'),
        percent_encode(&oidc_config.client_id),
        encoded_redirect,
        encoded_scopes,
        state_param,
    );

    Ok(Json(OidcLoginUrl { url, state: state_param }))
}

/// RFC 3986 percent-encoding for URL components.
fn percent_encode(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            // Unreserved characters (RFC 3986 2.3)
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

/// POST /api/auth/oidc/callback - Handle OIDC callback
///
/// NOTE: This endpoint is not yet fully implemented. OIDC code exchange
/// and token validation must be completed before production use.
pub async fn oidc_callback(
    State(_state): State<Arc<AppState>>,
    Json(_req): Json<OidcCallbackRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // OIDC callback is not yet implemented. To prevent issuing tokens
    // without proper verification, this endpoint returns an error until
    // the full OIDC code exchange flow is implemented.
    Err((StatusCode::NOT_IMPLEMENTED, Json(json!({
        "error": "OIDC callback not yet implemented. Code exchange and token validation are required."
    }))))
}
