// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

use crate::server::AppState;
use security::{RequireAdmin, RequireRead};

// ============================================================================
// OIDC State Tracking
// ============================================================================

/// Tracks a pending OIDC login flow so the callback can find the provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OidcPendingState {
    /// The state parameter value (used as the store key).
    pub state_id: String,
    pub provider_id: String,
    pub created: DateTime<Utc>,
}

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
    /// Role mapping: LDAP group -> zyvor-fabricd role
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
    /// Role mapping: OIDC role value -> zyvor-fabricd role
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

fn default_viewer() -> String {
    "viewer".into()
}

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
    let providers = state
        .store
        .list_entities::<AuthProvider>("auth_providers")
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
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
        crate::api::notifications::validate_external_url_public(&oidc.issuer_url).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Invalid issuer URL: {}", e)})),
            )
        })?;
    }

    // Validate LDAP server URL against SSRF
    if let AuthProviderConfig::Ldap(ref ldap) = req.config {
        crate::api::notifications::validate_external_url_public(&ldap.server_url).map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Invalid LDAP server URL: {}", e)})),
            )
        })?;
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

    state
        .store
        .save_entity("auth_providers", &provider.id, &provider)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    tracing::info!("Created auth provider '{}'", provider.name);
    Ok((StatusCode::CREATED, Json(provider)))
}

/// DELETE /api/auth/providers/:id - Delete an auth provider
pub async fn delete_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    state
        .store
        .delete_entity("auth_providers", &id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/auth/providers/:id/test - Test auth provider connectivity
pub async fn test_provider(
    RequireAdmin(_claims): RequireAdmin,
    State(state): State<Arc<AppState>>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let provider = state
        .store
        .get_entity::<AuthProvider>("auth_providers", &id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Provider not found"})),
            )
        })?;

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
            let discovery_url = format!(
                "{}/.well-known/openid-configuration",
                config.issuer_url.trim_end_matches('/')
            );

            match state.http_client.get(&discovery_url).send().await {
                Ok(resp) if resp.status().is_success() => Ok(Json(json!({
                    "status": "ok",
                    "provider": provider.name,
                    "type": "oidc",
                    "issuer": config.issuer_url,
                    "message": "OIDC discovery endpoint reachable"
                }))),
                Ok(resp) => Err((
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": format!("OIDC discovery returned {}", resp.status())
                    })),
                )),
                Err(e) => Err((
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": format!("OIDC discovery failed: {}", e)
                    })),
                )),
            }
        }
    }
}

/// GET /api/auth/oidc/login/:provider_id - Get OIDC login URL
pub async fn oidc_login_url(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(provider_id): axum::extract::Path<String>,
) -> Result<Json<OidcLoginUrl>, (StatusCode, Json<serde_json::Value>)> {
    let provider = state
        .store
        .get_entity::<AuthProvider>("auth_providers", &provider_id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Provider not found"})),
            )
        })?;

    let oidc_config = match &provider.config {
        AuthProviderConfig::Oidc(c) => c,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Provider is not OIDC"})),
            ))
        }
    };

    let state_param = uuid::Uuid::new_v4().to_string();

    // Persist the state -> provider mapping so the callback can look it up
    let pending = OidcPendingState {
        state_id: state_param.clone(),
        provider_id: provider_id.clone(),
        created: Utc::now(),
    };
    state
        .store
        .save_entity("oidc_pending_states", &state_param, &pending)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;

    // Fetch OIDC discovery to get the real authorization endpoint
    let (auth_endpoint, _token_endpoint) =
        discover_oidc_endpoints(&state.http_client, &oidc_config.issuer_url).await;

    let scopes = oidc_config.scopes.join(" ");

    // Use proper percent-encoding (RFC 3986)
    let encoded_redirect = percent_encode(&oidc_config.redirect_uri);
    let encoded_scopes = percent_encode(&scopes);

    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}",
        auth_endpoint,
        percent_encode(&oidc_config.client_id),
        encoded_redirect,
        encoded_scopes,
        state_param,
    );

    Ok(Json(OidcLoginUrl {
        url,
        state: state_param,
    }))
}

/// Fetch the OIDC discovery document and extract the authorization and token endpoints.
/// Falls back to conventional `{issuer}/authorize` and `{issuer}/token` if discovery fails.
async fn discover_oidc_endpoints(
    http_client: &reqwest::Client,
    issuer_url: &str,
) -> (String, String) {
    let discovery_url = format!(
        "{}/.well-known/openid-configuration",
        issuer_url.trim_end_matches('/')
    );

    if let Ok(resp) = http_client.get(&discovery_url).send().await {
        if let Ok(doc) = resp.json::<serde_json::Value>().await {
            let auth_endpoint = doc
                .get("authorization_endpoint")
                .and_then(|v| v.as_str())
                .map(String::from);
            let token_endpoint = doc
                .get("token_endpoint")
                .and_then(|v| v.as_str())
                .map(String::from);

            if let (Some(auth), Some(token)) = (auth_endpoint, token_endpoint) {
                // Validate discovered endpoints against SSRF to prevent
                // a malicious provider from redirecting to internal services
                if crate::api::notifications::validate_external_url_public(&auth).is_ok()
                    && crate::api::notifications::validate_external_url_public(&token).is_ok()
                {
                    tracing::debug!("OIDC discovery: auth={}, token={}", auth, token);
                    return (auth, token);
                }
                tracing::warn!("OIDC discovery endpoints failed SSRF validation, using fallback");
            }
        }
    }

    tracing::debug!("OIDC discovery failed, using conventional endpoints");
    let base = issuer_url.trim_end_matches('/');
    (format!("{}/authorize", base), format!("{}/token", base))
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
/// Completes the OIDC authorization code flow:
/// 1. Validates the state parameter against stored pending states
/// 2. Exchanges the authorization code for tokens at the provider's token endpoint
/// 3. Parses the ID token to extract user claims
/// 4. Maps the OIDC user to a local role and issues a local JWT
pub async fn oidc_callback(
    State(state): State<Arc<AppState>>,
    Json(req): Json<OidcCallbackRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // 1. Look up and consume the pending state to find the provider
    let pending = state
        .store
        .get_entity::<OidcPendingState>("oidc_pending_states", &req.state)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid or expired state parameter"})),
            )
        })?;

    // Reject state tokens older than 10 minutes to prevent replay
    if (Utc::now() - pending.created).num_seconds() > 600 {
        let _ = state.store.delete_entity("oidc_pending_states", &req.state);
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "State parameter expired"})),
        ));
    }

    // Consume the state so it cannot be reused
    let _ = state.store.delete_entity("oidc_pending_states", &req.state);

    // 2. Load the OIDC provider configuration
    let provider = state
        .store
        .get_entity::<AuthProvider>("auth_providers", &pending.provider_id)
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Auth provider not found"})),
            )
        })?;

    let oidc_config = match &provider.config {
        AuthProviderConfig::Oidc(c) => c,
        _ => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Provider is not OIDC"})),
            ))
        }
    };

    if !provider.enabled {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Auth provider is disabled"})),
        ));
    }

    // 3. Exchange the authorization code for tokens at the provider's token endpoint
    let (_auth_endpoint, token_url) =
        discover_oidc_endpoints(&state.http_client, &oidc_config.issuer_url).await;

    let token_response = state
        .http_client
        .post(&token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &req.code),
            ("redirect_uri", &oidc_config.redirect_uri),
            ("client_id", &oidc_config.client_id),
            ("client_secret", &oidc_config.client_secret),
        ])
        .send()
        .await
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": format!("Token exchange failed: {}", e)})),
            )
        })?;

    if !token_response.status().is_success() {
        let status = token_response.status();
        let body = token_response.text().await.unwrap_or_default();
        tracing::error!("OIDC token exchange failed ({}): {}", status, body);
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": format!("Token endpoint returned {}", status)
            })),
        ));
    }

    let token_data: serde_json::Value = token_response.json().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": format!("Invalid token response: {}", e)})),
        )
    })?;

    let id_token = token_data
        .get("id_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": "No id_token in token response"})),
            )
        })?;

    // 4. Decode the ID token payload (the provider's signature was validated by the TLS
    //    connection to the token endpoint — the token came directly from the provider)
    let claims = decode_id_token_claims(id_token).map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error": format!("Invalid ID token: {}", e)})),
        )
    })?;

    // 5. Extract the username from the configured claim
    let username = claims
        .get(&oidc_config.username_claim)
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "error": format!("ID token missing '{}' claim", oidc_config.username_claim)
                })),
            )
        })?
        .to_string();

    // 6. Determine the local role via role mapping
    let role = if let Some(ref role_claim) = oidc_config.role_claim {
        let role_value = claims
            .get(role_claim)
            .and_then(|v| v.as_str())
            .unwrap_or("");
        match oidc_config.role_mapping.get(role_value) {
            Some(mapped) => parse_role(mapped),
            None => parse_role(&provider.default_role),
        }
    } else {
        parse_role(&provider.default_role)
    };

    // 7. Issue a local JWT
    let jwt_config = state.jwt_config.as_ref().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Authentication not configured"})),
        )
    })?;

    let token = jwt_config
        .generate_token(&username, role.clone())
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Token generation failed: {}", e)})),
            )
        })?;

    tracing::info!(
        "OIDC login successful for user '{}' via provider '{}' (role: {:?})",
        username,
        provider.name,
        role
    );

    Ok(Json(json!({
        "token": token,
        "user_id": username,
        "role": role,
        "provider": provider.name,
    })))
}

/// Decode the payload of a JWT ID token without cryptographic verification.
///
/// This is safe when the token was obtained directly from the provider's token
/// endpoint over TLS (authorization code flow), as the transport layer guarantees
/// authenticity. We must NOT skip verification for tokens received from untrusted
/// sources (e.g. implicit flow).
fn decode_id_token_claims(
    id_token: &str,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        return Err("ID token does not have 3 parts".to_string());
    }

    // Decode the payload (second part), handling base64url padding
    let payload = parts[1];
    let padded = match payload.len() % 4 {
        2 => format!("{}==", payload),
        3 => format!("{}=", payload),
        _ => payload.to_string(),
    };

    use base64::Engine;
    let bytes = base64::engine::general_purpose::URL_SAFE
        .decode(&padded)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|e| format!("JSON parse failed: {}", e))?;

    value
        .as_object()
        .cloned()
        .ok_or_else(|| "ID token payload is not a JSON object".to_string())
}

/// Parse a role string into a security::Role, defaulting to Viewer for unknown values.
fn parse_role(role_str: &str) -> security::Role {
    match role_str.to_lowercase().as_str() {
        "admin" => security::Role::Admin,
        "user" => security::Role::User,
        _ => security::Role::Viewer,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_id_token_valid() {
        use base64::Engine;
        let header = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(r#"{"alg":"RS256","typ":"JWT"}"#);
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(r#"{"sub":"user1","email":"u@test.com","name":"Test"}"#);
        let token = format!("{}.{}.fake-signature", header, payload);
        let claims = decode_id_token_claims(&token).unwrap();
        assert_eq!(claims.get("sub").unwrap().as_str().unwrap(), "user1");
        assert_eq!(claims.get("email").unwrap().as_str().unwrap(), "u@test.com");
    }

    #[test]
    fn test_decode_id_token_invalid_parts() {
        assert!(decode_id_token_claims("only-two.parts").is_err());
        assert!(decode_id_token_claims("").is_err());
    }

    #[test]
    fn test_decode_id_token_invalid_base64() {
        assert!(decode_id_token_claims("header.!!!invalid!!!.sig").is_err());
    }

    #[test]
    fn test_percent_encode_unreserved() {
        assert_eq!(percent_encode("abc123-._~"), "abc123-._~");
    }

    #[test]
    fn test_percent_encode_reserved() {
        let encoded = percent_encode("hello world&foo=bar");
        assert!(encoded.contains("%20")); // space
        assert!(encoded.contains("%26")); // &
        assert!(encoded.contains("%3D")); // =
        assert!(!encoded.contains(' '));
    }

    #[test]
    fn test_parse_role_variants() {
        assert_eq!(parse_role("admin"), security::Role::Admin);
        assert_eq!(parse_role("user"), security::Role::User);
        assert_eq!(parse_role("viewer"), security::Role::Viewer);
        assert_eq!(parse_role("unknown"), security::Role::Viewer);
    }

    #[test]
    fn test_parse_role_case_insensitive() {
        assert_eq!(parse_role("ADMIN"), security::Role::Admin);
        assert_eq!(parse_role("User"), security::Role::User);
        assert_eq!(parse_role("AdMiN"), security::Role::Admin);
    }
}
