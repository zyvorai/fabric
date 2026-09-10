// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::{
    model::{
        CreateSessionRequest, DeployAgentRequest, EventsQuery, GuestEventsResponse,
        GuestStatusResponse, SessionRecord, SessionStartMode, SessionStartPolicy, SessionStatus,
        SessionView, SteerRequest, WarmPoolReconcileResult, WarmPoolView,
    },
    pool, AppState,
};
use anyhow::Result;
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
use std::{convert::Infallible, sync::Arc, time::Duration};
use uuid::Uuid;

pub(crate) const WORKER: &[u8] = include_bytes!("worker.mjs");

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request(e: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: e.to_string(),
        }
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }
    fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            message: message.into(),
        }
    }
    fn bad_gateway(e: impl std::fmt::Display) -> Self {
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
    fn too_many(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            message: message.into(),
        }
    }
    fn internal(e: impl std::fmt::Display) -> Self {
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

type ApiResult<T> = Result<T, ApiError>;

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
        .route("/v1/sessions/{id}/hibernate", post(hibernate_session))
        .route("/v1/sessions/{id}/resume", post(resume_session))
        .route("/v1/sessions/{id}/events", get(stream_events))
        .route_layer(middleware::from_fn_with_state(state.clone(), api_auth));

    Router::new()
        .route("/healthz", get(|| async { Json(json!({"ok": true})) }))
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
    Json(req): Json<DeployAgentRequest>,
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

async fn create_session(
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

    // The lock protects idempotency, quota admission and single-use warm-pool
    // claims. Warm starts only perform a cheap resume while locked; cold starts
    // still preserve the existing duplicate-VM safety contract.
    let (record, input, prewarmed, _session_guard) = {
        let _guard = state.session_create_lock.lock().await;

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

        let id = Uuid::new_v4();
        // Reserve the per-session operation lock before the record becomes
        // visible. Sync/expiry/control requests can discover Creating state,
        // but cannot race provisioning or overwrite its terminal transition.
        let operation_guard = state.session_lock(id).lock_owned().await;
        let worker_digest = pool::worker_digest_sha256();
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

        let (sandbox_id, start_mode, prewarmed) = if let Some(warm) = warm {
            match state.fluxvm.resume(warm.sandbox_id).await {
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
                    let name = format!("agent-{}", &id.simple().to_string()[..12]);
                    let sandbox = state
                        .fluxvm
                        .create_sandbox(
                            name,
                            &agent.manifest.template,
                            None,
                            agent.manifest.runtime_port,
                        )
                        .await
                        .map_err(ApiError::bad_gateway)?;
                    (sandbox.id, SessionStartMode::Cold, false)
                }
            }
        } else {
            let name = format!("agent-{}", &id.simple().to_string()[..12]);
            let sandbox = state
                .fluxvm
                .create_sandbox(
                    name,
                    &agent.manifest.template,
                    None,
                    agent.manifest.runtime_port,
                )
                .await
                .map_err(ApiError::bad_gateway)?;
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
        return Err(ApiError::bad_gateway(
            "sandbox was created but agent runtime provisioning failed; inspect the session for details",
        ));
    }

    let startup_ms = u64::try_from(admission_started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let updated = state
        .store
        .update_session(record.id, |s| {
            s.status = SessionStatus::Running;
            s.startup_ms = Some(startup_ms);
        })
        .await
        .map_err(ApiError::internal)?;
    state
        .store
        .append_event(
            record.id,
            "session.running",
            json!({"start_mode": updated.start_mode, "startup_ms": startup_ms}),
        )
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(updated.into())))
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
        state
            .fluxvm
            .process(session.sandbox_id, "mkdir -p /opt/zyvor/agent", Some(10))
            .await?;
        state
            .fluxvm
            .fs_write(session.sandbox_id, "/opt/zyvor/worker.mjs", WORKER, 0o755)
            .await?;
    }
    state
        .fluxvm
        .fs_write(
            session.sandbox_id,
            "/opt/zyvor/agent/bundle.mjs",
            &bundle,
            0o644,
        )
        .await?;

    let host = match state.config.egress_advertise_host.as_deref() {
        Some(v) => v.to_string(),
        None => state.fluxvm.default_gateway(session.sandbox_id).await?,
    };
    let broker = format!(
        "http://{}:{}",
        format_host(&host),
        state.config.egress_listen.port()
    );
    let command = format!(
        "mkdir -p /opt/zyvor/agent; ZYVOR_SESSION_ID={} ZYVOR_EGRESS_CAPABILITY={} ZYVOR_EGRESS_BROKER={} ZYVOR_AGENT_PORT={} nohup node /opt/zyvor/worker.mjs >/tmp/zyvor-agent.log 2>&1 </dev/null &",
        shell_quote(&session.id.to_string()), shell_quote(&session.capability_token), shell_quote(&broker), agent.manifest.runtime_port
    );
    state
        .fluxvm
        .process(session.sandbox_id, &command, Some(10))
        .await?;

    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(state.config.guest_start_timeout_secs);
    loop {
        match state
            .fluxvm
            .guest_request(
                session.sandbox_id,
                agent.manifest.runtime_port,
                Method::GET,
                "health",
                None,
            )
            .await
        {
            Ok(v) if v.get("ok").and_then(Value::as_bool) == Some(true) => break,
            _ if tokio::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_millis(200)).await
            }
            _ => anyhow::bail!("guest agent worker did not become ready before timeout"),
        }
    }
    state
        .fluxvm
        .guest_request(
            session.sandbox_id,
            agent.manifest.runtime_port,
            Method::POST,
            "run",
            Some(&json!({"input": input})),
        )
        .await?;
    Ok(())
}

async fn list_sessions(State(state): State<Arc<AppState>>) -> Json<Value> {
    let items: Vec<SessionView> = state
        .store
        .list_sessions()
        .await
        .into_iter()
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

async fn steer_session(
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

async fn cancel_session(
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

async fn sync_session(state: &AppState, session: SessionRecord) -> Result<()> {
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
}
