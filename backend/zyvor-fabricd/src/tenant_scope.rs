// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! JWT tenant scoping for VM routes (mirrors FluxVM token-tenant enforcement).

use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use security::Claims;
use serde_json::json;
use std::sync::Arc;
use vm_model::VM;

use crate::server::AppState;

pub fn vm_tenant(vm: &VM) -> Option<String> {
    if let Some(ref labels) = vm.labels {
        if let Some(t) = labels.get("tenant") {
            return Some(t.clone());
        }
    }
    vm.tags.as_ref().and_then(|tags| {
        tags.iter()
            .find_map(|t| t.strip_prefix("tenant:").map(|s| s.to_string()))
    })
}

/// When the JWT carries `tenant`, `/api/vms/{name}…` is scoped to that tenant.
pub async fn tenant_guard_middleware(
    State(state): State<Arc<AppState>>,
    req: Request,
    next: Next,
) -> Response {
    let Some(claims) = req.extensions().get::<Claims>().cloned() else {
        return next.run(req).await;
    };
    let Some(tenant) = claims.tenant.clone() else {
        return next.run(req).await;
    };

    let path = req.uri().path();
    // Paths are nested under /api or /api/v1 — strip those prefixes.
    let rest = path
        .strip_prefix("/api/v1")
        .or_else(|| path.strip_prefix("/api"))
        .unwrap_or(path);
    if let Some(name) = extract_vm_name(rest) {
        match state.store.get_vm(&name) {
            Ok(Some(vm)) if vm_tenant(&vm).as_deref() == Some(tenant.as_str()) => {}
            _ => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error": "VM not found"})),
                )
                    .into_response();
            }
        }
    }
    next.run(req).await
}

fn extract_vm_name(path: &str) -> Option<String> {
    let rest = path.strip_prefix("/vms/")?;
    let name = rest.split('/').next()?;
    if name.is_empty() || name == "compare" {
        return None;
    }
    Some(name.to_string())
}

pub fn apply_create_tenant(
    claims: &Claims,
    mut tenant: Option<String>,
) -> Result<Option<String>, (StatusCode, String)> {
    if let Some(ref claim_tenant) = claims.tenant {
        if let Some(ref body) = tenant {
            if body != claim_tenant {
                return Err((
                    StatusCode::FORBIDDEN,
                    format!("token tenant '{claim_tenant}' cannot create VM for tenant '{body}'"),
                ));
            }
        }
        tenant = Some(claim_tenant.clone());
    }
    Ok(tenant)
}

pub fn apply_list_tenant_filter(
    claims: &Claims,
    query_tenant: Option<String>,
) -> Result<Option<String>, (StatusCode, String)> {
    if let Some(ref claim_tenant) = claims.tenant {
        if let Some(ref qt) = query_tenant {
            if qt != claim_tenant {
                return Err((
                    StatusCode::FORBIDDEN,
                    format!("token tenant '{claim_tenant}' cannot list tenant '{qt}'"),
                ));
            }
        }
        return Ok(Some(claim_tenant.clone()));
    }
    Ok(query_tenant)
}
