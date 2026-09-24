// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{
    audit::AuditPhase,
    model::{
        ApprovalKind, ApprovalRecord, ApprovalStatus, CreateApprovalRequest, CreateSessionRequest,
        DecideApprovalRequest, DelegateRequest, DeployAgentRequest, EventsQuery,
        GuestEventsResponse, GuestStatusResponse, SessionRecord, SessionStartMode,
        SessionStartPolicy, SessionStatus, SessionView, SteerRequest, WarmPoolReconcileResult,
        WarmPoolView, MAX_EGRESS_APPROVAL_SECONDS, MIN_EGRESS_APPROVAL_SECONDS,
    },
    pool, AppState,
};
use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use reqwest::Method;
use serde_json::{json, Value};
use std::{collections::HashMap, convert::Infallible, sync::Arc, time::Duration};
use uuid::Uuid;

pub(crate) const WORKER: &[u8] = include_bytes!("worker.mjs");
pub(crate) const HARNESS: &[u8] = include_bytes!("harness.mjs");

/// Upper bound on how long a single FluxVM resume/create call may run while
/// holding a session's per-agent creation lock. Strictly less than the
/// FluxVm HTTP client's own 180s request timeout, so this fires first and
/// deterministically: a hung FluxVM call becomes a bounded, lock-releasing
/// error instead of blocking every future session creation for that agent
/// until the process is restarted.
const SANDBOX_START_TIMEOUT: Duration = Duration::from_secs(120);

/// Upper bound on a single guest_request() call inside provision_guest's
/// health-check retry loop (and the final /run call). Shorter than
/// FluxVmClient's own 180s reqwest timeout, for the same reason
/// SANDBOX_START_TIMEOUT is shorter than it: a single stuck call must not be
/// able to block the retry loop past its own guest_start_timeout_secs
/// deadline, which is only ever checked *between* attempts.
const HEALTH_CHECK_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(15);

/// Create a fresh sandbox for a session, attaching the agent's home volume if
/// it has one. A volume that is still attached elsewhere is a conflict (the
/// caller can retry once the other session ends), not a gateway failure.
/// A `user_id` must be well formed, and is mandatory when the agent's home
/// volume is per user (otherwise every user would share one volume).
pub(crate) fn check_session_user(
    agent: &crate::model::AgentRecord,
    user_id: Option<&str>,
) -> ApiResult<()> {
    if let Some(user) = user_id {
        crate::model::validate_user_id(user).map_err(ApiError::bad_request)?;
    }
    if agent
        .manifest
        .home_volume
        .as_ref()
        .is_some_and(|v| v.per_user)
        && user_id.is_none()
    {
        return Err(ApiError::bad_request(
            "this agent's home volume is per user: user_id is required",
        ));
    }
    Ok(())
}

async fn create_cold_sandbox(
    state: &AppState,
    agent: &crate::model::AgentRecord,
    session_id: Uuid,
    user_id: Option<&str>,
) -> ApiResult<crate::fluxvm::SandboxRecord> {
    let name = format!("agent-{}", &session_id.simple().to_string()[..12]);
    let volumes: Vec<crate::fluxvm::SandboxVolume> = agent
        .manifest
        .home_volume
        .iter()
        .filter_map(|v| {
            Some(crate::fluxvm::SandboxVolume {
                name: agent.manifest.home_volume_for(&agent.name, user_id)?,
                guest_path: v.guest_path.clone(),
            })
        })
        .collect();
    let sandbox = with_start_timeout(state.fluxvm.create_sandbox(
        name,
        &agent.manifest.template,
        None,
        agent.manifest.runtime_port,
        &crate::fluxvm::SandboxOptions {
            volumes: &volumes,
            resources: agent.manifest.resources,
            confidential: agent.manifest.confidential,
        },
    ))
    .await
    .map_err(|error| {
        if !volumes.is_empty() && error.to_string().contains("already attached") {
            ApiError::conflict("the agent's home volume is attached to another sandbox")
        } else {
            ApiError::bad_gateway(error)
        }
    })?;
    check_confidential(state, agent, &sandbox).await?;
    Ok(sandbox)
}

/// Enforce `confidential: required` on a freshly created sandbox. FluxVM refuses
/// a required launch it cannot do; this also refuses when an older FluxVM ignored
/// the request and reported nothing, and deletes the sandbox so it never runs
/// unprotected. `auto` accepts whatever happened and the outcome is recorded.
async fn check_confidential(
    state: &AppState,
    agent: &crate::model::AgentRecord,
    sandbox: &crate::fluxvm::SandboxRecord,
) -> ApiResult<()> {
    if agent.manifest.confidential != crate::model::Confidential::Required {
        return Ok(());
    }
    let active = sandbox.confidential.as_ref().is_some_and(|c| c.active);
    if active {
        return Ok(());
    }
    let reason = sandbox
        .confidential
        .as_ref()
        .map(|c| c.reason.clone())
        .unwrap_or_else(|| "FluxVM did not report a confidential status (too old?)".into());
    let _ = state.fluxvm.delete(sandbox.id).await;
    Err(ApiError::unavailable(format!(
        "confidential VM required but not active: {reason}"
    )))
}

async fn with_start_timeout<T>(
    fut: impl std::future::Future<Output = anyhow::Result<T>>,
) -> anyhow::Result<T> {
    with_timeout(SANDBOX_START_TIMEOUT, fut).await
}

async fn with_timeout<T>(
    duration: Duration,
    fut: impl std::future::Future<Output = anyhow::Result<T>>,
) -> anyhow::Result<T> {
    match tokio::time::timeout(duration, fut).await {
        Ok(result) => result,
        Err(_) => Err(anyhow::anyhow!(
            "FluxVM did not respond to a sandbox resume/create within {}s",
            duration.as_secs()
        )),
    }
}

#[derive(Debug)]
pub(crate) struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub(crate) fn message(&self) -> &str {
        &self.message
    }
    pub(crate) fn bad_request(e: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: e.to_string(),
        }
    }
    pub(crate) fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }
    pub(crate) fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }
    pub(crate) fn bad_gateway(e: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            message: e.to_string(),
        }
    }
    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: message.into(),
        }
    }
    pub(crate) fn too_many(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: message.into(),
        }
    }
    pub(crate) fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            message: message.into(),
        }
    }
    pub(crate) fn internal(e: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: e.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({"error": self.message}))).into_response()
    }
}

pub(crate) type ApiResult<T> = Result<T, ApiError>;

pub fn public_router(state: Arc<AppState>) -> Router {
    let protected = Router::new()
        .route("/v1/agents", get(list_agents).post(deploy_agent))
        .route("/v1/agents/{name}", get(get_agent))
        .route(
            "/v1/agents/{name}/warm-pool",
            get(get_warm_pool).post(reconcile_warm_pool),
        )
        .route("/v1/sessions", get(list_sessions).post(create_session))
        .route("/v1/sessions/{id}", get(get_session).delete(delete_session))
        .route("/v1/sessions/{id}/steer", post(steer_session))
        .route("/v1/sessions/{id}/cancel", post(cancel_session))
        .route("/v1/sessions/{id}/untaint", post(untaint_session))
        .route(
            "/v1/sessions/{id}/browser/{*path}",
            get(crate::browser::devtools),
        )
        .route(
            "/v1/workstations",
            get(crate::workstations::list_workstations),
        )
        .route(
            "/v1/workstations/{agent}/{user_id}",
            get(crate::workstations::get_workstation)
                .put(crate::workstations::put_workstation)
                .delete(crate::workstations::delete_workstation),
        )
        .route("/v1/sessions/{id}/hibernate", post(hibernate_session))
        .route("/v1/sessions/{id}/resume", post(resume_session))
        .route("/v1/sessions/{id}/events", get(stream_events))
        .route("/v1/sessions/{id}/delegate", post(delegate_session))
        .route(
            "/v1/schedules",
            get(crate::schedules::list_schedules).post(crate::schedules::create_schedule),
        )
        .route(
            "/v1/schedules/{id}",
            axum::routing::delete(crate::schedules::delete_schedule),
        )
        .route(
            "/v1/webhooks",
            get(crate::schedules::list_webhooks).post(crate::schedules::create_webhook),
        )
        .route(
            "/v1/webhooks/{id}",
            axum::routing::delete(crate::schedules::delete_webhook),
        )
        .route(
            "/v1/loops",
            get(crate::schedules::list_loops).post(crate::schedules::create_loop),
        )
        .route(
            "/v1/loops/{id}",
            axum::routing::delete(crate::schedules::delete_loop),
        )
        .route("/v1/approvals", get(list_approvals).post(create_approval))
        .route("/v1/approvals/{id}", post(decide_approval))
        .route("/v1/audit", get(list_audit))
        .route("/v1/skills", get(list_skills).post(publish_skill))
        .route("/v1/skills/{name}", get(get_skill).delete(delete_skill))
        .route("/mcp", post(crate::mcp::handle))
        .route_layer(middleware::from_fn_with_state(state.clone(), api_auth));

    Router::new()
        .route("/healthz", get(|| async { Json(json!({"ok": true})) }))
        .route("/v1/hooks/{id}", post(crate::schedules::webhook_ingress))
        .merge(protected)
        .with_state(state)
}

async fn api_auth(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let Some(expected) = state.config.api_token.as_deref() else {
        return next.run(request).await;
    };
    let presented = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    if presented.is_some_and(|v| constant_time_eq(v.as_bytes(), expected.as_bytes())) {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "missing or invalid bearer token"})),
        )
            .into_response()
    }
}

async fn deploy_agent(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<DeployAgentRequest>,
) -> ApiResult<(StatusCode, Json<crate::model::AgentRecord>)> {
    if req.manifest.template.trim().is_empty() {
        return Err(ApiError::bad_request("manifest.template is required"));
    }
    if req
        .manifest
        .egress_allow_hosts
        .iter()
        .any(|h| h.trim().is_empty())
    {
        return Err(ApiError::bad_request("egress allow hosts may not be empty"));
    }
    if req.manifest.max_concurrent_sessions == Some(0) {
        return Err(ApiError::bad_request(
            "max_concurrent_sessions must be greater than zero",
        ));
    }
    if let Some(seconds) = req.manifest.egress_approval_timeout_seconds {
        if !(MIN_EGRESS_APPROVAL_SECONDS..=MAX_EGRESS_APPROVAL_SECONDS).contains(&seconds) {
            return Err(ApiError::bad_request(format!(
                "egress_approval_timeout_seconds must be between {MIN_EGRESS_APPROVAL_SECONDS} and {MAX_EGRESS_APPROVAL_SECONDS}"
            )));
        }
    }
    if let Err(message) = req.manifest.validate_confidential() {
        return Err(ApiError::bad_request(message));
    }
    if let Err(message) = req.manifest.validate_egress_policy() {
        return Err(ApiError::bad_request(message));
    }
    if let Err(message) = req
        .manifest
        .validate_resources(state.config.max_vcpus, state.config.max_memory_mib)
    {
        return Err(ApiError::bad_request(message));
    }
    if let Err(message) = req.manifest.validate_home_volume(&req.name) {
        return Err(ApiError::bad_request(message));
    }
    if req.manifest.warm_pool_size > 64 {
        return Err(ApiError::bad_request("warm_pool_size may not exceed 64"));
    }
    for credential in &req.manifest.credentials {
        if state.credentials.descriptor(credential).is_none() {
            return Err(ApiError::bad_request(format!(
                "credential '{credential}' is not configured on this Fabric host"
            )));
        }
    }
    // Pin skills to exact versions now, so republishing a skill later never
    // changes what this immutable agent version mounts.
    req.manifest.skills = state
        .store
        .skills
        .pin(
            &req.manifest.skills,
            req.manifest.skill_scope.as_deref(),
            &state.skill_scopes,
        )
        .await
        .map_err(ApiError::bad_request)?;
    let record = state
        .store
        .deploy_agent(req)
        .await
        .map_err(ApiError::bad_request)?;
    if record.manifest.warm_pool_size > 0 {
        let pool_state = state.clone();
        let agent_name = record.name.clone();
        tokio::spawn(async move {
            if let Err(error) = pool::reconcile_agent(&pool_state, &agent_name).await {
                tracing::warn!(agent = %agent_name, %error, "initial warm-pool reconciliation failed");
            }
        });
    }
    Ok((StatusCode::CREATED, Json(record)))
}

async fn list_agents(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({"items": state.store.list_agents().await}))
}

async fn get_agent(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> ApiResult<Json<crate::model::AgentRecord>> {
    state
        .store
        .get_agent(&name)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found("agent not found"))
}

async fn get_warm_pool(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> ApiResult<Json<WarmPoolView>> {
    if state.store.get_agent(&name).await.is_none() {
        return Err(ApiError::not_found("agent not found"));
    }
    pool::pool_view(&state, &name)
        .await
        .map(Json)
        .map_err(ApiError::internal)
}

async fn reconcile_warm_pool(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> ApiResult<Json<WarmPoolReconcileResult>> {
    if state.store.get_agent(&name).await.is_none() {
        return Err(ApiError::not_found("agent not found"));
    }
    pool::reconcile_agent(&state, &name)
        .await
        .map(Json)
        .map_err(ApiError::bad_gateway)
}

pub(crate) async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSessionRequest>,
) -> ApiResult<(StatusCode, Json<SessionView>)> {
    let admission_started = std::time::Instant::now();
    let admitted_at = Utc::now();
    let agent = state
        .store
        .get_agent(&req.agent)
        .await
        .ok_or_else(|| ApiError::not_found("agent not found"))?;

    let request_id = req
        .request_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    if let Some(value) = request_id.as_deref() {
        validate_request_id(value)?;
    }
    check_session_user(&agent, req.user_id.as_deref())?;
    let ttl = req.ttl_seconds.or(agent.manifest.ttl_seconds);
    let start_policy = req.start_policy;
    let expires_at = match ttl {
        Some(seconds) => {
            let seconds = i64::try_from(seconds)
                .map_err(|_| ApiError::bad_request("ttl_seconds is too large"))?;
            Some(
                admitted_at
                    .checked_add_signed(chrono::Duration::seconds(seconds))
                    .ok_or_else(|| ApiError::bad_request("ttl_seconds is too large"))?,
            )
        }
        None => None,
    };
    if let Some(parent_id) = req.parent_session_id {
        let parent = state
            .store
            .get_session(parent_id)
            .await
            .ok_or_else(|| ApiError::bad_request("parent session not found"))?;
        if parent.status.is_terminal() {
            return Err(ApiError::conflict("parent session is not active"));
        }
        crate::schedules::delegation_allowed(&state, parent_id).await?;
    }

    // The lock protects idempotency, quota admission and single-use warm-pool
    // claims. Warm starts only perform a cheap resume while locked; cold starts
    // still preserve the existing duplicate-VM safety contract. Scoped per
    // agent (not a single global lock) so a slow/hung FluxVM call for one
    // agent can't block session creation for every other agent, and bounded
    // by `with_start_timeout` so a hang can't hold this lock forever either.
    let (record, input, prewarmed, _session_guard) = {
        let agent_lock = state.session_create_lock(&agent.name);
        let _guard = agent_lock.lock().await;

        if let Some(value) = request_id.as_deref() {
            if let Some(existing) = state
                .store
                .find_session_by_request_id(&agent.name, value)
                .await
            {
                if existing.input != req.input {
                    return Err(ApiError::conflict(
                        "request_id was already used for this agent with different input",
                    ));
                }
                return Ok((StatusCode::OK, Json(existing.into())));
            }
        }

        if let Some(max) = agent.manifest.max_concurrent_sessions {
            let active = state.store.count_non_terminal_for_agent(&agent.name).await;
            if active >= max {
                return Err(ApiError::too_many(format!(
                    "agent '{}' reached max_concurrent_sessions ({max})",
                    agent.name
                )));
            }
        }

        if let Some(user) = req.user_id.as_deref() {
            if state
                .store
                .count_non_terminal_for_user(&agent.name, user)
                .await
                > 0
            {
                return Err(ApiError::conflict(format!(
                    "user '{user}' already has an active session for agent '{}'",
                    agent.name
                )));
            }
        }

        let id = Uuid::new_v4();
        // Reserve the per-session operation lock before the record becomes
        // visible. Sync/expiry/control requests can discover Creating state,
        // but cannot race provisioning or overwrite its terminal transition.
        let operation_guard = state.session_lock(id).lock_owned().await;
        let worker_digest = pool::worker_digest_sha256(agent.manifest.runtime);
        let warm =
            if agent.manifest.warm_pool_size > 0 && start_policy != SessionStartPolicy::ColdOnly {
                state
                    .store
                    .claim_warm_sandbox(
                        &agent.name,
                        &agent.version,
                        &worker_digest,
                        agent.manifest.runtime_port,
                        id,
                    )
                    .await
                    .map_err(ApiError::internal)?
            } else {
                None
            };

        if warm.is_none() && start_policy == SessionStartPolicy::RequireWarm {
            return Err(ApiError::too_many(format!(
                "agent '{}' warm pool is exhausted; retry after replenishment",
                agent.name
            )));
        }

        let mut confidential: Option<crate::model::ConfidentialStatus> = None;
        let (sandbox_id, start_mode, prewarmed) = if let Some(warm) = warm {
            match with_start_timeout(state.fluxvm.resume(warm.sandbox_id)).await {
                Ok(()) => (warm.sandbox_id, SessionStartMode::Warm, true),
                Err(error) => {
                    tracing::warn!(
                        sandbox = %warm.sandbox_id,
                        %error,
                        "warm sandbox resume failed; falling back to cold start"
                    );
                    if let Err(cleanup_error) = pool::discard_claimed(&state, warm.sandbox_id).await
                    {
                        tracing::warn!(
                            sandbox = %warm.sandbox_id,
                            error = %cleanup_error,
                            "failed to clean up unusable warm sandbox; durable claim retained"
                        );
                    }
                    if start_policy == SessionStartPolicy::RequireWarm {
                        return Err(ApiError::unavailable(
                            "claimed warm sandbox could not resume; retry after pool replenishment",
                        ));
                    }
                    let sandbox =
                        create_cold_sandbox(&state, &agent, id, req.user_id.as_deref()).await?;
                    confidential = sandbox.confidential.clone();
                    (sandbox.id, SessionStartMode::Cold, false)
                }
            }
        } else {
            let sandbox = create_cold_sandbox(&state, &agent, id, req.user_id.as_deref()).await?;
            confidential = sandbox.confidential.clone();
            (sandbox.id, SessionStartMode::Cold, false)
        };

        let record = SessionRecord {
            id,
            agent: agent.name.clone(),
            agent_version: agent.version.clone(),
            sandbox_id,
            status: SessionStatus::Creating,
            input: req.input.clone(),
            created_at: admitted_at,
            updated_at: Utc::now(),
            last_event_seq: 0,
            guest_event_cursor: 0,
            request_id: request_id.clone(),
            start_policy,
            start_mode,
            startup_ms: None,
            expires_at,
            sandbox_released: false,
            capability_token: random_capability(),
            error: None,
            parent_session_id: req.parent_session_id,
            user_id: req.user_id.clone(),
            tainted_by: vec![],
            confidential: confidential.clone(),
        };
        if let Err(error) = state.store.save_session(record.clone()).await {
            if prewarmed {
                let _ = pool::discard_claimed(&state, sandbox_id).await;
            } else {
                let _ = state.fluxvm.delete(sandbox_id).await;
            }
            return Err(ApiError::internal(error));
        }
        if prewarmed {
            // The session record is now the durable owner. Never return this VM
            // to the pool, even if subsequent agent provisioning fails. If the
            // pool-file write fails, continue: restart reconciliation can see
            // the persisted Claiming record and the matching durable session.
            if let Err(error) = state.store.forget_warm_sandbox(sandbox_id).await {
                tracing::warn!(
                    session = %id,
                    sandbox = %sandbox_id,
                    %error,
                    "session owns warm sandbox but pool record cleanup was deferred"
                );
            }
        }
        if let Err(error) = state
            .store
            .append_event(
                id,
                "session.created",
                json!({
                    "sandbox_id": sandbox_id,
                    "agent_version": agent.version.clone(),
                    "request_id": request_id.clone(),
                    "start_policy": start_policy,
                    "start_mode": start_mode,
                    "expires_at": record.expires_at.as_ref(),
                    "parent_session_id": record.parent_session_id,
                    "confidential": record.confidential,
                }),
            )
            .await
        {
            // Admission is not complete until its first durable journal record
            // exists. If persistence fails after VM allocation, fail closed and
            // reclaim the single-use sandbox rather than leaving an invisible
            // Creating session behind. State persistence itself is best effort
            // here because the original error may be a storage failure.
            let released = state.fluxvm.delete(sandbox_id).await.is_ok();
            let message = format!("persisting session.created: {error:#}");
            let _ = state
                .store
                .update_session(id, |s| {
                    s.status = SessionStatus::Failed;
                    s.sandbox_released = released;
                    s.error = Some(message.clone());
                })
                .await;
            return Err(ApiError::internal(error));
        }
        if prewarmed {
            // This event is observability-only: the durable session.created
            // record already contains start_mode=warm and owns the sandbox. A
            // secondary journal failure must not turn a valid admission into
            // an API error that the caller may retry and duplicate.
            if let Err(error) = state
                .store
                .append_event(
                    id,
                    "session.warm-pool.claimed",
                    json!({"sandbox_id": sandbox_id}),
                )
                .await
            {
                tracing::warn!(
                    session = %id,
                    sandbox = %sandbox_id,
                    %error,
                    "failed to journal warm-pool claim"
                );
            }
        }
        (record, req.input.clone(), prewarmed, operation_guard)
    };

    // Provisioning (guest boot, health-check retries, bundle push) can take up
    // to guest_start_timeout_secs, far longer than any upstream proxy or
    // browser is willing to hold a single request open. Awaiting it inline
    // here would mean: once the caller's connection is closed by an impatient
    // timeout, axum drops this handler's future mid-flight, and none of the
    // failure-handling below (marking the session Failed, releasing the
    // sandbox) ever runs -- the session is then stuck in Creating forever,
    // with no further writes to it, ever. So provisioning is detached into
    // its own task; the client observes the outcome via session.running /
    // session.failed events (or by polling), never by blocking this request.
    let response_record = record.clone();
    tokio::spawn(async move {
        let _session_guard = _session_guard;
        if let Err(error) = provision_guest(&state, &record, &agent, input, prewarmed).await {
            let message = format!("{error:#}");
            // Journal the terminal event before setting terminal=true so an SSE
            // consumer cannot observe the state transition and miss the reason.
            let _ = state
                .store
                .append_event(
                    record.id,
                    "session.failed",
                    json!({"error": message.clone()}),
                )
                .await;
            let _ = state
                .store
                .update_session(record.id, |s| {
                    s.status = SessionStatus::Failed;
                    s.error = Some(message.clone());
                })
                .await;
            if let Some(failed) = state.store.get_session(record.id).await {
                let _ = try_release_sandbox(&state, &failed).await;
            }
            return;
        }

        let startup_ms = u64::try_from(admission_started.elapsed().as_millis()).unwrap_or(u64::MAX);
        let updated = match state
            .store
            .update_session(record.id, |s| {
                s.status = SessionStatus::Running;
                s.startup_ms = Some(startup_ms);
            })
            .await
        {
            Ok(updated) => updated,
            Err(error) => {
                tracing::error!(session = %record.id, %error, "failed to mark session running after successful provisioning");
                return;
            }
        };
        if let Err(error) = state
            .store
            .append_event(
                record.id,
                "session.running",
                json!({"start_mode": updated.start_mode, "startup_ms": startup_ms}),
            )
            .await
        {
            tracing::warn!(session = %record.id, %error, "failed to journal session.running event");
        }
    });

    Ok((StatusCode::CREATED, Json(response_record.into())))
}

/// Blocks until the guest's vsock-based FluxVM guest agent accepts a
/// command, or `guest_start_timeout_secs` elapses. Only meaningful right
/// after a cold `create_sandbox()`; a resumed/prewarmed sandbox's channel is
/// already up.
async fn wait_for_guest_agent_ready(state: &AppState, sandbox_id: Uuid) -> Result<()> {
    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(state.config.guest_start_timeout_secs);
    loop {
        // See HEALTH_CHECK_ATTEMPT_TIMEOUT's doc comment: a single call here
        // has to be bounded independently of the retry loop's own deadline,
        // or a stuck call blocks the loop from ever reaching that deadline
        // check at all.
        let attempt = with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state
                .fluxvm
                .process(sandbox_id, "mkdir -p /opt/zyvor/agent", Some(10)),
        )
        .await;
        match attempt {
            Ok(_) => return Ok(()),
            Err(error) if tokio::time::Instant::now() < deadline => {
                tracing::debug!(sandbox = %sandbox_id, %error, "guest agent not ready yet, retrying");
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Err(error) => {
                return Err(error).context("guest agent did not become ready before timeout")
            }
        }
    }
}

/// Write the agent's pinned skills into the sandbox: base skills under
/// `/opt/zyvor/skills`, scoped ones under `/opt/zyvor/skills-scoped`, each root
/// with an `INDEX.json`. The scope policy is checked again here because the
/// operator may have tightened it since the agent was deployed; a skill the
/// agent may no longer use fails the session rather than being mounted.
async fn mount_skills(
    state: &AppState,
    session: &SessionRecord,
    agent: &crate::model::AgentRecord,
) -> Result<()> {
    use crate::skills::{index_json, mount_plan, split_ref, BASE_MOUNT, SCOPED_MOUNT};
    if agent.manifest.skills.is_empty() {
        return Ok(());
    }
    let mut bundles = Vec::new();
    for pin in &agent.manifest.skills {
        let (name, version) = split_ref(pin);
        let bundle = state
            .store
            .skills
            .get(name, version)
            .await
            .with_context(|| format!("loading pinned skill {pin}"))?;
        anyhow::ensure!(
            state
                .skill_scopes
                .allows(agent.manifest.skill_scope.as_deref(), bundle.record.scope.as_deref()),
            "skill {pin} is not permitted for this agent's skill_scope under the current scope policy"
        );
        bundles.push(bundle);
    }
    for bundle in &bundles {
        for (path, bytes, mode) in mount_plan(bundle)? {
            with_timeout(
                HEALTH_CHECK_ATTEMPT_TIMEOUT,
                state
                    .fluxvm
                    .fs_write(session.sandbox_id, &path, &bytes, mode),
            )
            .await
            .with_context(|| format!("writing skill file {path}"))?;
        }
    }
    for (root, scoped) in [(BASE_MOUNT, false), (SCOPED_MOUNT, true)] {
        let group: Vec<_> = bundles
            .iter()
            .filter(|b| b.record.scope.is_some() == scoped)
            .collect();
        if group.is_empty() {
            continue;
        }
        with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state.fluxvm.fs_write(
                session.sandbox_id,
                &format!("{root}/INDEX.json"),
                &index_json(&group),
                0o444,
            ),
        )
        .await
        .with_context(|| format!("writing {root}/INDEX.json"))?;
    }
    Ok(())
}

async fn provision_guest(
    state: &AppState,
    session: &SessionRecord,
    agent: &crate::model::AgentRecord,
    input: Value,
    prewarmed: bool,
) -> Result<()> {
    let bundle = state
        .store
        .agent_bundle(&agent.name, &agent.version)
        .await?;
    if !prewarmed {
        // create_sandbox() returns as soon as the VM process is launched, not
        // once the guest has finished booting -- the in-guest fluxvm-guest-agent
        // only starts listening on its vsock channel partway through boot. The
        // very first guest-agent call after a cold create therefore routinely
        // races that boot and fails with "connecting to vsock proxy socket ...
        // No such file or directory" on a real (non-mocked) FluxVM backend.
        // Retry until the channel comes up rather than failing the session for
        // a timing issue that resolves itself within a few seconds.
        wait_for_guest_agent_ready(state, session.sandbox_id).await?;
        with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state.fluxvm.fs_write(
                session.sandbox_id,
                "/opt/zyvor/worker.mjs",
                pool::entrypoint_bytes(agent.manifest.runtime),
                0o755,
            ),
        )
        .await?;
    }
    let host = match state.config.egress_advertise_host.as_deref() {
        Some(v) => v.to_string(),
        None => {
            with_timeout(
                HEALTH_CHECK_ATTEMPT_TIMEOUT,
                state.fluxvm.default_gateway(session.sandbox_id),
            )
            .await?
        }
    };
    // Confine before any agent code is written to or run in the guest, and fail
    // the session rather than run it unconfined.
    if state.config.confine_all || agent.manifest.confinement == crate::model::Confinement::Strict {
        let gateway = crate::confine::parse_gateway(&host)?;
        let policy = crate::confine::strict_policy(
            gateway,
            state.config.egress_listen.port(),
            state.config.proxy_listen.map(|addr| addr.port()),
        );
        with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state.fluxvm.set_network_policy(session.sandbox_id, &policy),
        )
        .await
        .context("applying sandbox network confinement")?;
    }
    with_timeout(
        HEALTH_CHECK_ATTEMPT_TIMEOUT,
        state.fluxvm.fs_write(
            session.sandbox_id,
            "/opt/zyvor/agent/bundle.mjs",
            &bundle,
            0o644,
        ),
    )
    .await?;

    if agent.manifest.inner_container == crate::model::InnerContainer::Strict {
        with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state.fluxvm.fs_write(
                session.sandbox_id,
                crate::contain::GUEST_PATH,
                crate::contain::SCRIPT.as_bytes(),
                0o755,
            ),
        )
        .await?;
    }
    mount_skills(state, session, agent).await?;

    let broker = format!(
        "http://{}:{}",
        format_host(&host),
        state.config.egress_listen.port()
    );
    // Basic credentials for the CONNECT proxy: the same session id and
    // capability the JSON broker takes, so the guest gains no new secret.
    let proxy = state.config.proxy_listen.map(|addr| {
        format!(
            "http://{}:{}@{}:{}",
            session.id,
            session.capability_token,
            format_host(&host),
            addr.port()
        )
    });
    let proxy_env = proxy
        .map(|url| format!("ZYVOR_EGRESS_PROXY={} ", shell_quote(&url)))
        .unwrap_or_default();
    let credentials =
        serde_json::to_string(&agent.manifest.credentials).unwrap_or_else(|_| "[]".into());
    let launcher = crate::contain::launcher_prefix(agent.manifest.inner_container);
    let command = format!(
        "mkdir -p /opt/zyvor/agent; {proxy_env}ZYVOR_SESSION_ID={} ZYVOR_EGRESS_CAPABILITY={} ZYVOR_EGRESS_BROKER={} ZYVOR_AGENT_PORT={} ZYVOR_AGENT_RUNTIME={} ZYVOR_HARNESS_CREDENTIALS={} nohup {launcher}node /opt/zyvor/worker.mjs >/tmp/zyvor-agent.log 2>&1 </dev/null &",
        shell_quote(&session.id.to_string()),
        shell_quote(&session.capability_token),
        shell_quote(&broker),
        agent.manifest.runtime_port,
        shell_quote(agent.manifest.runtime.as_str()),
        shell_quote(&credentials),
    );
    with_timeout(
        HEALTH_CHECK_ATTEMPT_TIMEOUT,
        state.fluxvm.process(session.sandbox_id, &command, Some(10)),
    )
    .await?;

    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(state.config.guest_start_timeout_secs);
    loop {
        // A single guest_request() has been observed to hang well past even
        // FluxVmClient's own 180s reqwest timeout (root cause not fully
        // understood -- reqwest connection-pool/keep-alive interaction is
        // the leading suspect, see fluxvm-api's sandbox_proxy_inner). Bound
        // every individual attempt here too, defensively: without this, one
        // stuck call blocks the loop from ever reaching the deadline check
        // below, no matter how short guest_start_timeout_secs is.
        let attempt = with_timeout(
            HEALTH_CHECK_ATTEMPT_TIMEOUT,
            state.fluxvm.guest_request(
                session.sandbox_id,
                agent.manifest.runtime_port,
                Method::GET,
                "health",
                None,
            ),
        )
        .await;
        match attempt {
            Ok(v) if v.get("ok").and_then(Value::as_bool) == Some(true) => break,
            _ if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(200)).await
            }
            _ => anyhow::bail!("guest agent worker did not become ready before timeout"),
        }
    }
    with_timeout(
        HEALTH_CHECK_ATTEMPT_TIMEOUT,
        state.fluxvm.guest_request(
            session.sandbox_id,
            agent.manifest.runtime_port,
            Method::POST,
            "run",
            Some(&json!({"input": input})),
        ),
    )
    .await?;
    Ok(())
}

async fn list_sessions(
    State(state): State<Arc<AppState>>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<Value> {
    let user = query.get("user_id");
    let items: Vec<SessionView> = state
        .store
        .list_sessions()
        .await
        .into_iter()
        .filter(|s| user.is_none_or(|u| s.user_id.as_deref() == Some(u.as_str())))
        .map(Into::into)
        .collect();
    Json(json!({"items": items}))
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SessionView>> {
    state
        .store
        .get_session(id)
        .await
        .map(|v| Json(v.into()))
        .ok_or_else(|| ApiError::not_found("session not found"))
}

pub(crate) async fn steer_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<SteerRequest>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let lock = state.session_lock(id);
    let _guard = lock.lock().await;
    let session = require_session(&state, id).await?;
    if session.status != SessionStatus::Running {
        return Err(ApiError::conflict("session is not running"));
    }
    let agent = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await
        .map_err(ApiError::internal)?;
    let message = req.message;
    let value = state
        .fluxvm
        .guest_request(
            session.sandbox_id,
            agent.manifest.runtime_port,
            Method::POST,
            "steer",
            Some(&json!({"message": message.clone()})),
        )
        .await
        .map_err(ApiError::bad_gateway)?;
    state
        .store
        .append_event(id, "session.steer.requested", message)
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::ACCEPTED, Json(value)))
}

/// Clear a session's taint after an operator has looked at what it read. The
/// agent cannot call this: it sits behind the operator token, on the public
/// router only.
async fn untaint_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SessionView>> {
    require_session(&state, id).await?;
    let hosts = state
        .store
        .untaint_session(id)
        .await
        .map_err(ApiError::internal)?;
    if !hosts.is_empty() {
        if let Err(error) = state
            .store
            .audit
            .append(
                Some(id),
                AuditPhase::Approved,
                "session.untainted",
                None,
                json!({"was_tainted_by": hosts}),
            )
            .await
        {
            tracing::error!(%error, "failed to write audit entry");
        }
    }
    let session = require_session(&state, id).await?;
    Ok(Json(session.into()))
}

pub(crate) async fn cancel_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<SessionView>)> {
    let lock = state.session_lock(id);
    let _guard = lock.lock().await;
    let session = require_session(&state, id).await?;
    if session.status.is_terminal() {
        return Err(ApiError::conflict("session is already terminal"));
    }
    if let Ok(agent) = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await
    {
        let _ = state
            .fluxvm
            .guest_request(
                session.sandbox_id,
                agent.manifest.runtime_port,
                Method::POST,
                "cancel",
                Some(&json!({})),
            )
            .await;
    }
    // Persist the terminal event before the terminal state so an SSE client can
    // never observe terminal=true and exit before the event reaches the journal.
    state
        .store
        .append_event(id, "session.cancelled", json!({}))
        .await
        .map_err(ApiError::internal)?;
    let updated = state
        .store
        .update_session(id, |s| s.status = SessionStatus::Cancelled)
        .await
        .map_err(ApiError::internal)?;
    let _ = try_release_sandbox(&state, &updated).await;
    let latest = state.store.get_session(id).await.unwrap_or(updated);
    Ok((StatusCode::ACCEPTED, Json(latest.into())))
}

async fn hibernate_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SessionView>> {
    hibernate_session_inner(&state, id).await.map(Json)
}

async fn hibernate_session_inner(state: &AppState, id: Uuid) -> ApiResult<SessionView> {
    let lock = state.session_lock(id);
    let _guard = lock.lock().await;
    let session = require_session(state, id).await?;
    if session.status != SessionStatus::Running {
        return Err(ApiError::conflict("only running sessions can hibernate"));
    }
    let agent = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await
        .map_err(ApiError::internal)?;

    let transitioned = state
        .store
        .compare_and_set_status(id, SessionStatus::Running, SessionStatus::Hibernating)
        .await
        .map_err(ApiError::internal)?;
    if transitioned.is_none() {
        return Err(ApiError::conflict(
            "session state changed while hibernating",
        ));
    }

    let operation = async {
        state
            .fluxvm
            .guest_request(
                session.sandbox_id,
                agent.manifest.runtime_port,
                Method::POST,
                "checkpoint",
                Some(&json!({})),
            )
            .await
            .map_err(ApiError::bad_gateway)?;
        tokio::fs::create_dir_all(&state.config.snapshot_dir)
            .await
            .map_err(ApiError::internal)?;
        let snapshot = state.config.snapshot_dir.join(format!("{id}.snapshot"));
        let snapshot_string = snapshot.to_string_lossy().into_owned();
        state
            .fluxvm
            .snapshot(session.sandbox_id, &snapshot_string)
            .await
            .map_err(ApiError::bad_gateway)?;
        state
            .fluxvm
            .pause(session.sandbox_id)
            .await
            .map_err(ApiError::bad_gateway)?;
        Ok::<_, ApiError>(snapshot)
    }
    .await;

    let snapshot = match operation {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let _ = state
                .store
                .update_session(id, |s| s.status = SessionStatus::Running)
                .await;
            let _ = state
                .store
                .append_event(
                    id,
                    "session.hibernate.failed",
                    json!({"error": error.message.clone()}),
                )
                .await;
            return Err(error);
        }
    };

    let updated = state
        .store
        .update_session(id, |s| s.status = SessionStatus::Hibernated)
        .await
        .map_err(ApiError::internal)?;
    state
        .store
        .append_event(
            id,
            "session.hibernated",
            json!({"snapshot": snapshot.file_name().and_then(|s| s.to_str())}),
        )
        .await
        .map_err(ApiError::internal)?;
    Ok(updated.into())
}

async fn resume_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SessionView>> {
    let lock = state.session_lock(id);
    let _guard = lock.lock().await;
    let session = require_session(&state, id).await?;
    if session.status != SessionStatus::Hibernated {
        return Err(ApiError::conflict("session is not hibernated"));
    }
    state
        .fluxvm
        .resume(session.sandbox_id)
        .await
        .map_err(ApiError::bad_gateway)?;
    let updated = state
        .store
        .update_session(id, |s| s.status = SessionStatus::Running)
        .await
        .map_err(ApiError::internal)?;
    state
        .store
        .append_event(id, "session.resumed", json!({}))
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(updated.into()))
}

async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let lock = state.session_lock(id);
    let _guard = lock.lock().await;
    let session = require_session(&state, id).await?;
    state
        .fluxvm
        .delete(session.sandbox_id)
        .await
        .map_err(ApiError::bad_gateway)?;
    state
        .store
        .append_event(id, "session.deleted", json!({}))
        .await
        .map_err(ApiError::internal)?;
    state
        .store
        .update_session(id, |s| {
            if !s.status.is_terminal() {
                s.status = SessionStatus::Cancelled;
            }
            s.sandbox_released = true;
        })
        .await
        .map_err(ApiError::internal)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn stream_events(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Query(query): Query<EventsQuery>,
) -> ApiResult<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>> {
    require_session(&state, id).await?;
    let stream = async_stream::stream! {
        let mut cursor = query.after;
        loop {
            match state.store.events_after(id, cursor).await {
                Ok(events) => {
                    for item in events {
                        cursor = item.seq;
                        let data = serde_json::to_string(&item).unwrap_or_else(|_| "{}".into());
                        yield Ok(Event::default().id(item.seq.to_string()).event(item.kind.clone()).data(data));
                    }
                }
                Err(error) => {
                    yield Ok(Event::default().event("error").data(json!({"error": error.to_string()}).to_string()));
                    break;
                }
            }
            let terminal = state.store.get_session(id).await.map(|s| s.status.is_terminal()).unwrap_or(true);
            if terminal { break; }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

async fn require_session(state: &AppState, id: Uuid) -> ApiResult<SessionRecord> {
    state
        .store
        .get_session(id)
        .await
        .ok_or_else(|| ApiError::not_found("session not found"))
}

pub async fn sync_loop(state: Arc<AppState>) {
    let interval = Duration::from_millis(state.config.sync_interval_ms.max(50));
    loop {
        let sessions = state.store.active_sessions().await;
        for candidate in sessions {
            let lock = state.session_lock(candidate.id);
            let _guard = lock.lock().await;
            let Some(session) = state.store.get_session(candidate.id).await else {
                continue;
            };
            if !matches!(
                session.status,
                SessionStatus::Creating | SessionStatus::Running
            ) {
                continue;
            }
            let session_id = session.id;
            if let Err(error) = sync_session(&state, session).await {
                tracing::debug!(session = %session_id, %error, "agent session sync skipped");
                continue;
            }
            if let Some(updated) = state.store.get_session(session_id).await {
                if updated.status.is_terminal() && !updated.sandbox_released {
                    if let Err(error) = try_release_sandbox(&state, &updated).await {
                        tracing::debug!(session = %updated.id, %error, "terminal sandbox cleanup deferred");
                    }
                }
            }
        }
        tokio::time::sleep(interval).await;
    }
}

async fn sync_session(state: &Arc<AppState>, session: SessionRecord) -> Result<()> {
    let agent = state
        .store
        .get_agent_version(&session.agent, &session.agent_version)
        .await?;
    let path = format!("events?after={}", session.guest_event_cursor);
    let value = state
        .fluxvm
        .guest_request(
            session.sandbox_id,
            agent.manifest.runtime_port,
            Method::GET,
            &path,
            None,
        )
        .await?;
    let events: GuestEventsResponse = serde_json::from_value(value)?;
    let mut cursor = session.guest_event_cursor;
    for event in events.items {
        if event.seq <= cursor {
            continue;
        }
        cursor = event.seq;
        state
            .store
            .append_event(session.id, event.kind.clone(), event.data.clone())
            .await?;
        match event.kind.as_str() {
            "session.result" => {
                state
                    .store
                    .update_session(session.id, |s| s.status = SessionStatus::Completed)
                    .await?;
            }
            "session.failed" => {
                let error = event
                    .data
                    .get("error")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                state
                    .store
                    .update_session(session.id, |s| {
                        s.status = SessionStatus::Failed;
                        s.error = error.clone();
                    })
                    .await?;
            }
            "session.cancelled" => {
                state
                    .store
                    .update_session(session.id, |s| s.status = SessionStatus::Cancelled)
                    .await?;
            }
            "delegate.request" => {
                spawn_delegation(state, session.id, &event.data);
            }
            "approval.requested" => {
                record_approval_request(state, session.id, event.seq, &event.data).await?;
            }
            _ => {}
        }
        state
            .store
            .update_session(session.id, |s| s.guest_event_cursor = cursor)
            .await?;
    }
    if !state
        .store
        .get_session(session.id)
        .await
        .is_some_and(|s| s.status.is_terminal())
    {
        let value = state
            .fluxvm
            .guest_request(
                session.sandbox_id,
                agent.manifest.runtime_port,
                Method::GET,
                "status",
                None,
            )
            .await?;
        let guest: GuestStatusResponse = serde_json::from_value(value)?;
        if guest.status == "failed" {
            let message = guest
                .error
                .clone()
                .unwrap_or_else(|| "guest worker reported failure".to_string());
            state
                .store
                .append_event(session.id, "session.failed", json!({"error": message}))
                .await?;
            state
                .store
                .update_session(session.id, |s| {
                    s.status = SessionStatus::Failed;
                    s.error = guest.error.clone();
                })
                .await?;
        }
    }
    Ok(())
}

pub async fn auto_hibernate_loop(state: Arc<AppState>) {
    let interval = Duration::from_millis(state.config.idle_scan_interval_ms.max(250));
    loop {
        tokio::time::sleep(interval).await;
        for session in state.store.list_sessions().await {
            if session.status != SessionStatus::Running {
                continue;
            }
            let agent = match state
                .store
                .get_agent_version(&session.agent, &session.agent_version)
                .await
            {
                Ok(agent) => agent,
                Err(error) => {
                    tracing::warn!(session = %session.id, %error, "auto-hibernate skipped: agent version missing");
                    continue;
                }
            };
            let Some(idle_secs) = agent.manifest.idle_hibernate_seconds.filter(|v| *v > 0) else {
                continue;
            };
            let idle_for = Utc::now()
                .signed_duration_since(session.updated_at)
                .num_seconds();
            if idle_for < idle_secs as i64 {
                continue;
            }

            // Never freeze an agent merely because it has been quiet. The guest
            // explicitly reports `waiting` only while blocked in ctx.nextSteer().
            let guest = match state
                .fluxvm
                .guest_request(
                    session.sandbox_id,
                    agent.manifest.runtime_port,
                    Method::GET,
                    "status",
                    None,
                )
                .await
                .and_then(|value| {
                    serde_json::from_value::<GuestStatusResponse>(value)
                        .map_err(anyhow::Error::from)
                }) {
                Ok(guest) => guest,
                Err(_) => continue,
            };
            if guest.status != "waiting" {
                continue;
            }

            match hibernate_session_inner(&state, session.id).await {
                Ok(_) => {
                    tracing::info!(session = %session.id, idle_secs, "auto-hibernated waiting agent session")
                }
                Err(error) if error.status == StatusCode::CONFLICT => {}
                Err(error) => {
                    tracing::warn!(session = %session.id, error = %error.message, "auto-hibernate failed")
                }
            }
        }
    }
}

pub async fn expiry_loop(state: Arc<AppState>) {
    let interval = Duration::from_millis(state.config.expiry_scan_interval_ms.max(250));
    loop {
        tokio::time::sleep(interval).await;
        let now = Utc::now();
        for candidate in state.store.list_sessions().await {
            if candidate.status.is_terminal()
                || candidate
                    .expires_at
                    .as_ref()
                    .is_none_or(|deadline| deadline > &now)
            {
                continue;
            }
            let lock = state.session_lock(candidate.id);
            let _guard = lock.lock().await;
            let session = match state.store.get_session(candidate.id).await {
                Some(session) => session,
                None => continue,
            };
            if session.status.is_terminal()
                || session
                    .expires_at
                    .as_ref()
                    .is_none_or(|deadline| deadline > &Utc::now())
            {
                continue;
            }
            if let Err(error) = state.fluxvm.delete(session.sandbox_id).await {
                tracing::warn!(
                    session = %session.id,
                    sandbox = %session.sandbox_id,
                    %error,
                    "expired session sandbox delete failed; will retry"
                );
                continue;
            }
            if let Err(error) = state
                .store
                .append_event(
                    session.id,
                    "session.expired",
                    json!({"expires_at": session.expires_at.as_ref()}),
                )
                .await
            {
                tracing::warn!(session = %session.id, %error, "failed to journal session expiry");
                continue;
            }
            if let Err(error) = state
                .store
                .update_session(session.id, |s| {
                    s.status = SessionStatus::Expired;
                    s.sandbox_released = true;
                })
                .await
            {
                tracing::warn!(session = %session.id, %error, "failed to persist session expiry");
                continue;
            }
            tracing::info!(session = %session.id, "expired agent session");
        }
    }
}

async fn try_release_sandbox(state: &AppState, session: &SessionRecord) -> Result<()> {
    if session.sandbox_released {
        return Ok(());
    }
    state.fluxvm.delete(session.sandbox_id).await?;
    state
        .store
        .update_session(session.id, |s| s.sandbox_released = true)
        .await?;
    tracing::info!(
        session = %session.id,
        sandbox = %session.sandbox_id,
        "released terminal agent sandbox"
    );
    Ok(())
}

pub async fn terminal_cleanup_loop(state: Arc<AppState>) {
    let interval = Duration::from_millis(state.config.sync_interval_ms.max(250));
    loop {
        tokio::time::sleep(interval).await;
        for candidate in state.store.list_sessions().await {
            if !candidate.status.is_terminal() || candidate.sandbox_released {
                continue;
            }
            let lock = state.session_lock(candidate.id);
            let _guard = lock.lock().await;
            let Some(session) = state.store.get_session(candidate.id).await else {
                continue;
            };
            if !session.status.is_terminal() || session.sandbox_released {
                continue;
            }
            if let Err(error) = try_release_sandbox(&state, &session).await {
                tracing::warn!(
                    session = %session.id,
                    sandbox = %session.sandbox_id,
                    %error,
                    "terminal agent sandbox cleanup failed; will retry"
                );
            }
        }
    }
}

fn spawn_delegation(state: &Arc<AppState>, parent: Uuid, data: &Value) {
    let target = data
        .get("agent")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if target.is_empty() {
        return;
    }
    let input = data.get("input").cloned().unwrap_or(Value::Null);
    let state = Arc::clone(state);
    tokio::spawn(async move {
        let user_id = state
            .store
            .get_session(parent)
            .await
            .and_then(|p| p.user_id);
        let request = CreateSessionRequest {
            agent: target.clone(),
            input,
            ttl_seconds: None,
            request_id: Some(format!("delegate:{parent}:{}", Uuid::new_v4().simple())),
            start_policy: SessionStartPolicy::PreferWarm,
            parent_session_id: Some(parent),
            user_id,
        };
        match create_session(State(state.clone()), Json(request)).await {
            Ok((_, Json(view))) => {
                let _ = state
                    .store
                    .append_event(
                        parent,
                        "session.delegated",
                        json!({"session_id": view.id, "agent": view.agent}),
                    )
                    .await;
            }
            Err(error) => {
                let _ = state
                    .store
                    .append_event(
                        parent,
                        "session.delegate.failed",
                        json!({"agent": target, "error": error.message()}),
                    )
                    .await;
            }
        }
    });
}

async fn record_approval_request(
    state: &AppState,
    session_id: Uuid,
    seq: u64,
    data: &Value,
) -> Result<()> {
    if state
        .store
        .approval_for_event(session_id, seq)
        .await
        .is_some()
    {
        return Ok(());
    }
    let prompt = data
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if prompt.is_empty() {
        return Ok(());
    }
    let record = ApprovalRecord {
        id: Uuid::new_v4(),
        session_id,
        kind: ApprovalKind::Custom,
        subject: None,
        planned_action: None,
        prompt,
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: Utc::now(),
        decided_at: None,
        source_seq: Some(seq),
        grant_scope: None,
        broker_held: false,
    };
    state.store.save_approval(record.clone()).await?;
    audit_approval_planned(state, &record).await;
    Ok(())
}

/// Append the "planned" journal entry for a freshly opened approval. Audit
/// failures are logged, not propagated: an unwritable journal must not wedge
/// a session, and the failure is itself visible in the logs.
pub(crate) async fn audit_approval_planned(state: &AppState, record: &ApprovalRecord) {
    let result = state
        .store
        .audit
        .append(
            Some(record.session_id),
            AuditPhase::Planned,
            format!("approval.{}", record.kind.as_str()),
            record.subject.clone(),
            json!({
                "approval_id": record.id,
                "prompt": record.prompt,
                "planned_action": record.planned_action,
            }),
        )
        .await;
    if let Err(error) = result {
        tracing::error!(%error, approval_id = %record.id, "failed to write audit entry");
    }
    crate::notify::approval_requested(state, record);
}

async fn delegate_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<DelegateRequest>,
) -> ApiResult<(StatusCode, Json<SessionView>)> {
    let parent = require_session(&state, id).await?;
    if parent.status != SessionStatus::Running {
        return Err(ApiError::conflict("session is not running"));
    }
    let (status, Json(view)) = create_session(
        State(state.clone()),
        Json(CreateSessionRequest {
            agent: req.agent,
            input: req.input,
            ttl_seconds: None,
            request_id: Some(format!("delegate:{id}:{}", Uuid::new_v4().simple())),
            start_policy: SessionStartPolicy::PreferWarm,
            parent_session_id: Some(id),
            user_id: parent.user_id.clone(),
        }),
    )
    .await?;
    let _ = state
        .store
        .append_event(
            id,
            "session.delegated",
            json!({"session_id": view.id, "agent": view.agent}),
        )
        .await;
    Ok((status, Json(view)))
}

#[derive(Debug, serde::Deserialize)]
struct AuditQuery {
    #[serde(default)]
    session_id: Option<Uuid>,
    #[serde(default)]
    limit: Option<usize>,
}

/// Default and maximum page size for `GET /v1/audit`.
const AUDIT_DEFAULT_LIMIT: usize = 200;
const AUDIT_MAX_LIMIT: usize = 5000;

async fn list_audit(
    State(state): State<Arc<AppState>>,
    Query(query): Query<AuditQuery>,
) -> ApiResult<Json<Value>> {
    let limit = query
        .limit
        .unwrap_or(AUDIT_DEFAULT_LIMIT)
        .clamp(1, AUDIT_MAX_LIMIT);
    let items = state
        .store
        .audit
        .list(query.session_id, limit)
        .await
        .map_err(ApiError::internal)?;
    let chain = state
        .store
        .audit
        .verify()
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({"items": items, "chain": chain})))
}

async fn list_skills(State(state): State<Arc<AppState>>) -> ApiResult<Json<Value>> {
    let items = state
        .store
        .skills
        .list()
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({"items": items})))
}

async fn publish_skill(
    State(state): State<Arc<AppState>>,
    Json(req): Json<crate::skills::PublishSkillRequest>,
) -> ApiResult<(StatusCode, Json<crate::skills::SkillRecord>)> {
    let record = state
        .store
        .skills
        .publish(req)
        .await
        .map_err(ApiError::bad_request)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn get_skill(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> ApiResult<Json<Value>> {
    let current = state
        .store
        .skills
        .get(&name, None)
        .await
        .map_err(|e| ApiError::not_found(e.to_string()))?;
    let versions = state
        .store
        .skills
        .versions(&name)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(
        json!({"current": current.record, "versions": versions}),
    ))
}

/// Refuses while a deployed agent still lists the skill: its pinned version
/// would vanish and every new session would fail at provisioning.
async fn delete_skill(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> ApiResult<StatusCode> {
    if let Some(agent) = state.store.list_agents().await.into_iter().find(|a| {
        a.manifest
            .skills
            .iter()
            .any(|pin| crate::skills::split_ref(pin).0 == name)
    }) {
        return Err(ApiError::conflict(format!(
            "skill '{name}' is used by agent '{}'; redeploy the agent without it first",
            agent.name
        )));
    }
    match state.store.skills.delete(&name).await {
        Ok(true) => Ok(StatusCode::NO_CONTENT),
        Ok(false) => Err(ApiError::not_found("skill not found")),
        Err(e) => Err(ApiError::bad_request(e)),
    }
}

async fn list_approvals(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({"items": state.store.list_approvals().await}))
}

async fn create_approval(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateApprovalRequest>,
) -> ApiResult<(StatusCode, Json<ApprovalRecord>)> {
    let session = require_session(&state, req.session_id).await?;
    if session.status.is_terminal() {
        return Err(ApiError::conflict("session is not active"));
    }
    if req.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("prompt is required"));
    }
    let record = ApprovalRecord {
        id: Uuid::new_v4(),
        session_id: req.session_id,
        kind: req.kind,
        subject: req.subject,
        planned_action: req.planned_action,
        prompt: req.prompt,
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: Utc::now(),
        decided_at: None,
        source_seq: None,
        grant_scope: None,
        broker_held: false,
    };
    state
        .store
        .save_approval(record.clone())
        .await
        .map_err(ApiError::internal)?;
    audit_approval_planned(&state, &record).await;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn decide_approval(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<DecideApprovalRequest>,
) -> ApiResult<Json<ApprovalRecord>> {
    if !matches!(
        req.decision,
        ApprovalStatus::Approved | ApprovalStatus::Denied
    ) {
        return Err(ApiError::bad_request("decision must be approved or denied"));
    }
    let Some(record) = state.store.get_approval(id).await else {
        return Err(ApiError::not_found("approval not found"));
    };
    if record.status != ApprovalStatus::Pending {
        return Err(ApiError::conflict("approval is already decided"));
    }
    let session = require_session(&state, record.session_id).await?;
    if session.status != SessionStatus::Running {
        return Err(ApiError::conflict("session is not running"));
    }
    let scope = (record.kind == ApprovalKind::Egress).then(|| req.scope.unwrap_or_default());
    let Some(record) = state
        .store
        .transition_approval(id, req.decision, req.comment.clone(), scope)
        .await
        .map_err(ApiError::internal)?
    else {
        // Decided, or expired, between the read above and now.
        return Err(ApiError::conflict("approval is already decided"));
    };
    let phase = if record.status == ApprovalStatus::Approved {
        AuditPhase::Approved
    } else {
        AuditPhase::Denied
    };
    if let Err(error) = state
        .store
        .audit
        .append(
            Some(record.session_id),
            phase,
            format!("approval.{}", record.kind.as_str()),
            record.subject.clone(),
            json!({"approval_id": record.id, "comment": record.comment}),
        )
        .await
    {
        tracing::error!(%error, approval_id = %record.id, "failed to write audit entry");
    }
    let message = json!({
        "approval_id": record.id,
        "decision": record.status,
        "comment": record.comment,
    });
    // An approval the broker is holding (egress, or a send/purchase/DLP/taint hold)
    // unblocks a request already in flight; the agent is not waiting for steering,
    // so there is nothing to send it.
    if record.kind != ApprovalKind::Egress && !record.broker_held {
        let _ = steer_session(
            State(state),
            Path(record.session_id),
            Json(SteerRequest { message }),
        )
        .await?;
    }
    Ok(Json(record))
}

fn validate_request_id(value: &str) -> ApiResult<()> {
    if value.len() > 128 {
        return Err(ApiError::bad_request(
            "request_id must be at most 128 bytes",
        ));
    }
    if !value
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
    {
        return Err(ApiError::bad_request(
            "request_id may contain only ASCII letters, digits, '-', '_', '.', and ':'",
        ));
    }
    Ok(())
}

fn random_capability() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn format_host(host: &str) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_shell_values() {
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }

    #[test]
    fn brackets_ipv6_host() {
        assert_eq!(format_host("fd00::1"), "[fd00::1]");
        assert_eq!(format_host("10.0.0.1"), "10.0.0.1");
    }

    #[test]
    fn validates_idempotency_keys() {
        assert!(validate_request_id("ticket:INC-1042").is_ok());
        assert!(validate_request_id("bad key").is_err());
        assert!(validate_request_id(&"x".repeat(129)).is_err());
    }

    // Regression test for the bug this session's investigation found: a
    // hung FluxVM resume/create call held the per-agent creation lock
    // forever, permanently blocking that agent's session creation until
    // the whole process was restarted. `with_timeout` must convert a
    // never-resolving future into a bounded error instead of hanging.
    #[tokio::test(start_paused = true)]
    async fn with_timeout_bounds_a_call_that_never_resolves() {
        let never = std::future::pending::<anyhow::Result<()>>();
        let result = with_timeout(Duration::from_secs(5), never);
        tokio::time::advance(Duration::from_secs(6)).await;
        assert!(result.await.is_err());
    }

    #[tokio::test(start_paused = true)]
    async fn with_timeout_passes_through_a_call_that_resolves_in_time() {
        let fast = async { Ok::<_, anyhow::Error>(42) };
        let result = with_timeout(Duration::from_secs(5), fast).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test(start_paused = true)]
    async fn with_timeout_passes_through_the_inner_error_when_it_resolves_in_time() {
        let failing = async { Err::<(), _>(anyhow::anyhow!("boom")) };
        let result = with_timeout(Duration::from_secs(5), failing).await;
        assert_eq!(result.unwrap_err().to_string(), "boom");
    }

    // ---- confidential: auto / required ----

    async fn fluxvm_that_counts_deletes() -> (String, Arc<std::sync::atomic::AtomicUsize>) {
        let deleted = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = deleted.clone();
        let app = Router::new().route(
            "/v1/vms/{id}",
            axum::routing::delete(move || {
                let counter = counter.clone();
                async move {
                    counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    StatusCode::NO_CONTENT
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (url, deleted)
    }

    fn agent_with(mode: crate::model::Confidential) -> crate::model::AgentRecord {
        let mut manifest = crate::egress::ask_tests::manifest(crate::model::EgressMode::Deny, None);
        manifest.confidential = mode;
        crate::model::AgentRecord {
            name: "a".into(),
            version: "v".into(),
            digest_sha256: String::new(),
            manifest,
            created_at: Utc::now(),
        }
    }

    fn sandbox(status: Option<crate::model::ConfidentialStatus>) -> crate::fluxvm::SandboxRecord {
        crate::fluxvm::SandboxRecord {
            id: Uuid::new_v4(),
            guest_ip: None,
            status: None,
            confidential: status,
        }
    }

    fn status(active: bool, reason: &str) -> Option<crate::model::ConfidentialStatus> {
        Some(crate::model::ConfidentialStatus {
            active,
            tech: active.then(|| "sev-snp".to_string()),
            reason: reason.into(),
        })
    }

    #[tokio::test]
    async fn required_confidential_refuses_and_deletes_a_sandbox_that_is_not_confidential() {
        let (url, deleted) = fluxvm_that_counts_deletes().await;
        let (state, _session) =
            crate::egress::ask_tests::state_and_session_cfg(|c| c.fluxvm_url = url).await;
        let agent = agent_with(crate::model::Confidential::Required);
        let count = || deleted.load(std::sync::atomic::Ordering::SeqCst);

        let inactive = check_confidential(
            &state,
            &agent,
            &sandbox(status(false, "no SEV-SNP or TDX on this host")),
        )
        .await;
        let message = inactive.unwrap_err().message().to_string();
        assert!(message.contains("no SEV-SNP or TDX"), "{message}");
        assert_eq!(count(), 1);

        // An older FluxVM that ignores the request reports nothing: also refused.
        let silent = check_confidential(&state, &agent, &sandbox(None)).await;
        assert!(silent.unwrap_err().message().contains("did not report"));
        assert_eq!(count(), 2);

        // An active confidential sandbox is kept.
        check_confidential(&state, &agent, &sandbox(status(true, "")))
            .await
            .unwrap();
        assert_eq!(count(), 2);
    }

    #[tokio::test]
    async fn auto_confidential_falls_back_to_a_normal_vm() {
        let (url, deleted) = fluxvm_that_counts_deletes().await;
        let (state, _session) =
            crate::egress::ask_tests::state_and_session_cfg(|c| c.fluxvm_url = url).await;
        for mode in [
            crate::model::Confidential::Auto,
            crate::model::Confidential::Off,
        ] {
            let agent = agent_with(mode);
            check_confidential(&state, &agent, &sandbox(status(false, "no hardware")))
                .await
                .unwrap();
            check_confidential(&state, &agent, &sandbox(None))
                .await
                .unwrap();
        }
        assert_eq!(deleted.load(std::sync::atomic::Ordering::SeqCst), 0);
    }
}
