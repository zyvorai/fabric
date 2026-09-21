// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Tenant model policy. No policy record means the existing tenant filter stands.

use crate::server::AppState;

use super::STORE_POLICIES;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TenantAiPolicy {
    pub id: String,
    #[serde(default)]
    pub allowed_models: Vec<String>,
    #[serde(default)]
    pub allowed_source_prefixes: Vec<String>,
}

pub fn allows(policy: &TenantAiPolicy, model: &str, source: &str) -> bool {
    let model_ok =
        policy.allowed_models.is_empty() || policy.allowed_models.iter().any(|name| name == model);
    let source_ok = policy.allowed_source_prefixes.is_empty()
        || policy
            .allowed_source_prefixes
            .iter()
            .any(|prefix| source.starts_with(prefix));
    model_ok && source_ok
}

pub fn enforce(
    state: &AppState,
    tenant: Option<&str>,
    model: &str,
    source: &str,
) -> Result<(), String> {
    let Some(tenant) = tenant.filter(|t| !t.is_empty()) else {
        return Ok(());
    };
    let Some(policy) = state
        .store
        .get_entity::<TenantAiPolicy>(STORE_POLICIES, tenant)
        .ok()
        .flatten()
    else {
        return Ok(());
    };
    if allows(&policy, model, source) {
        Ok(())
    } else {
        Err(format!(
            "tenant '{tenant}' is not allowed to deploy model '{model}'"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_blocks_an_unlisted_model() {
        let policy = TenantAiPolicy {
            id: "acme".into(),
            allowed_models: vec!["qwen".into()],
            allowed_source_prefixes: vec!["hf://Qwen/".into()],
        };
        assert!(allows(&policy, "qwen", "hf://Qwen/Qwen3-8B"));
        assert!(!allows(&policy, "other", "hf://Qwen/Qwen3-8B"));
        assert!(!allows(&policy, "qwen", "hf://secret/weights"));
    }
}

pub async fn put_policy(
    security::RequireWrite(claims): security::RequireWrite,
    axum::extract::State(state): axum::extract::State<std::sync::Arc<crate::server::AppState>>,
    axum::Json(policy): axum::Json<TenantAiPolicy>,
) -> Result<axum::Json<TenantAiPolicy>, (axum::http::StatusCode, axum::Json<serde_json::Value>)> {
    crate::validation::validate_entity_name(&policy.id).map_err(|(s, m)| super::err(s, m))?;
    state
        .store
        .save_entity(STORE_POLICIES, &policy.id, &policy)
        .map_err(|e| super::err(axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    super::audit(
        &state,
        &claims.sub,
        "UPSERT",
        &format!("ai/policies/{}", policy.id),
        "SUCCESS",
    );
    Ok(axum::Json(policy))
}
