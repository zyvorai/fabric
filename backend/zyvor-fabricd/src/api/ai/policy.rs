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
    #[serde(default)]
    pub allowed_sites: Vec<String>,
    /// `0` means no GPU cap.
    #[serde(default)]
    pub max_gpus: u32,
    #[serde(default)]
    pub require_signature: bool,
    /// `0` means no context cap.
    #[serde(default)]
    pub max_context_tokens: u32,
    /// Prompts are not stored. This flag must stay false.
    #[serde(default)]
    pub prompt_logging: bool,
}

pub struct DeployCheck<'a> {
    pub model: &'a str,
    pub source: &'a str,
    pub site: &'a str,
    pub gpus: u32,
    pub has_signature: bool,
    pub context_tokens: u32,
}

pub fn evaluate(policy: &TenantAiPolicy, check: &DeployCheck<'_>) -> Result<(), String> {
    if policy.prompt_logging {
        return Err("prompt logging is not permitted".into());
    }
    if !allows(policy, check.model, check.source) {
        return Err(format!(
            "tenant '{}' is not allowed to deploy model '{}'",
            policy.id, check.model
        ));
    }
    if !policy.allowed_sites.is_empty()
        && !check.site.is_empty()
        && !policy.allowed_sites.iter().any(|site| site == check.site)
    {
        return Err(format!("site '{}' is outside tenant policy", check.site));
    }
    if policy.max_gpus > 0 && check.gpus > policy.max_gpus {
        return Err(format!(
            "requested {} GPUs exceeds tenant cap {}",
            check.gpus, policy.max_gpus
        ));
    }
    if policy.require_signature && !check.has_signature {
        return Err("tenant policy requires a model signature".into());
    }
    if policy.max_context_tokens > 0 && check.context_tokens > policy.max_context_tokens {
        return Err("context length exceeds tenant policy".into());
    }
    Ok(())
}

pub fn rbac_allows(granted: &[&str], action: &str) -> bool {
    const ACTIONS: &[&str] = &[
        "create",
        "read",
        "update",
        "delete",
        "deploy",
        "scale",
        "infer",
        "promote",
        "rollback",
        "administer",
    ];
    if !ACTIONS.contains(&action) {
        return false;
    }
    granted
        .iter()
        .any(|grant| *grant == action || *grant == "administer")
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
    if evaluate(
        &policy,
        &DeployCheck {
            model,
            source,
            site: "",
            gpus: 0,
            has_signature: true,
            context_tokens: 0,
        },
    )
    .is_ok()
    {
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
            allowed_sites: vec!["pune-1".into()],
            max_gpus: 2,
            require_signature: true,
            max_context_tokens: 8192,
            prompt_logging: false,
        };
        assert!(allows(&policy, "qwen", "hf://Qwen/Qwen3-8B"));
        assert!(!allows(&policy, "other", "hf://Qwen/Qwen3-8B"));
        assert!(!allows(&policy, "qwen", "hf://secret/weights"));
        assert!(evaluate(
            &policy,
            &DeployCheck {
                model: "qwen",
                source: "hf://Qwen/Qwen3-8B",
                site: "pune-1",
                gpus: 2,
                has_signature: true,
                context_tokens: 1024,
            }
        )
        .is_ok());
        assert!(evaluate(
            &policy,
            &DeployCheck {
                model: "qwen",
                source: "hf://Qwen/Qwen3-8B",
                site: "pune-1",
                gpus: 4,
                has_signature: false,
                context_tokens: 1024,
            }
        )
        .is_err());
        assert!(rbac_allows(&["scale"], "scale"));
        assert!(!rbac_allows(&["read"], "rollback"));
        assert!(rbac_allows(&["administer"], "promote"));
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
