// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Keep product loop: goals → plan steps → artifacts → approval for consequential actions.
//!
//! Sessions still do the work; goals orchestrate status and evidence. Mutating
//! Fabric calls stay behind the existing approvals / egress ask path.

use crate::{
    app::{ApiError, ApiResult},
    audit::AuditPhase,
    authz::{self, Principal},
    model::{ApprovalKind, ApprovalRecord, ApprovalStatus},
    AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GoalStatus {
    Open,
    Blocked,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepStatus {
    #[default]
    Pending,
    Running,
    Blocked,
    Done,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub status: PlanStepStatus,
    /// When true, completing this step opens an approval before marking done.
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalRecord {
    pub id: Uuid,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Pack / agent name this goal is for (e.g. `infra-ops`).
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<Uuid>,
    pub status: GoalStatus,
    #[serde(default)]
    pub plan: Vec<PlanStep>,
    #[serde(default)]
    pub artifact_ids: Vec<Uuid>,
    /// Goal-bound tabs: browser open must be ⊆ this list when non-empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow_hosts: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRecord {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    /// Markdown or plain text body (no secrets).
    pub body: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub goal_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default)]
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
    /// After this instant the artifact is hidden and swept. `None` keeps it until deleted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoalRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub agent: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub plan: Vec<CreatePlanStep>,
    #[serde(default)]
    pub allow_hosts: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlanStep {
    pub title: String,
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchGoalRequest {
    #[serde(default)]
    pub status: Option<GoalStatus>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub plan: Option<Vec<PlanStep>>,
    #[serde(default)]
    pub allow_hosts: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct AdvanceStepRequest {
    pub step_id: String,
    pub status: PlanStepStatus,
    #[serde(default)]
    pub artifact_id: Option<Uuid>,
    #[serde(default)]
    pub detail: Option<String>,
    /// Prompt used when opening an approval for `requires_approval` steps.
    #[serde(default)]
    pub approval_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateArtifactRequest {
    pub kind: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub goal_id: Option<Uuid>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
    /// Keep the artifact for this many seconds (1 s to 10 years).
    #[serde(default)]
    pub ttl_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub goal_id: Option<Uuid>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    /// Artifacts produced by this use case (matches `metadata.demo`).
    #[serde(default)]
    pub use_case: Option<String>,
    /// Only artifacts created at or after this instant (RFC 3339).
    #[serde(default)]
    pub since: Option<DateTime<Utc>>,
}

pub(crate) async fn list_goals(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListQuery>,
) -> Json<Value> {
    let mut items = state.store.list_goals().await;
    if let Some(agent) = q.agent.as_deref() {
        items.retain(|g| g.agent == agent);
    }
    if let Some(sid) = q.session_id {
        items.retain(|g| g.session_id == Some(sid));
    }
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    items.truncate(limit);
    Json(json!({ "items": items }))
}

pub(crate) async fn create_goal(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateGoalRequest>,
) -> ApiResult<(StatusCode, Json<GoalRecord>)> {
    if req.title.trim().is_empty() {
        return Err(ApiError::bad_request("title is required"));
    }
    if req.agent.trim().is_empty() {
        return Err(ApiError::bad_request("agent is required"));
    }
    let now = Utc::now();
    let plan: Vec<PlanStep> = req
        .plan
        .into_iter()
        .enumerate()
        .map(|(i, s)| PlanStep {
            id: format!("s{}", i + 1),
            title: s.title,
            status: PlanStepStatus::Pending,
            requires_approval: s.requires_approval,
            approval_id: None,
            artifact_id: None,
            detail: s.detail,
        })
        .collect();
    let record = GoalRecord {
        id: Uuid::new_v4(),
        title: req.title.trim().to_string(),
        description: req.description,
        agent: req.agent,
        user_id: req.user_id,
        session_id: req.session_id,
        status: GoalStatus::Open,
        plan,
        artifact_ids: vec![],
        allow_hosts: req.allow_hosts,
        created_at: now,
        updated_at: now,
    };
    state
        .store
        .save_goal(record.clone())
        .await
        .map_err(ApiError::internal)?;
    let _ = state
        .store
        .audit
        .append(
            None,
            AuditPhase::Performed,
            "keep.goal.created",
            Some(record.agent.clone()),
            json!({ "goal_id": record.id, "title": record.title }),
        )
        .await;
    Ok((StatusCode::CREATED, Json(record)))
}

pub(crate) async fn get_goal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<GoalRecord>> {
    state
        .store
        .get_goal(id)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found("goal not found"))
}

pub(crate) async fn patch_goal(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<PatchGoalRequest>,
) -> ApiResult<Json<GoalRecord>> {
    let mut goal = state
        .store
        .get_goal(id)
        .await
        .ok_or_else(|| ApiError::not_found("goal not found"))?;
    if let Some(status) = req.status {
        goal.status = status;
    }
    if let Some(session_id) = req.session_id {
        goal.session_id = Some(session_id);
    }
    if let Some(plan) = req.plan {
        goal.plan = plan;
    }
    if let Some(hosts) = req.allow_hosts {
        goal.allow_hosts = hosts;
    }
    goal.updated_at = Utc::now();
    state
        .store
        .save_goal(goal.clone())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(goal))
}

#[derive(Debug, Deserialize)]
pub struct GoalBrowseRequest {
    pub url: String,
}

/// Open a URL under this goal's allow_hosts (binds session.browse.goal_id).
pub(crate) async fn goal_browse(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<GoalBrowseRequest>,
) -> ApiResult<Json<Value>> {
    let goal = state
        .store
        .get_goal(id)
        .await
        .ok_or_else(|| ApiError::not_found("goal not found"))?;
    let session_id = goal
        .session_id
        .ok_or_else(|| ApiError::bad_request("goal needs session_id before browse"))?;
    if let Some(host) = crate::browse_ifc::host_from_url(&req.url) {
        if !goal.allow_hosts.is_empty()
            && !crate::policy::host_matches_list(&host, &goal.allow_hosts)
        {
            return Err(ApiError::forbidden("host outside goal.allow_hosts"));
        }
    }
    let _ = state
        .store
        .update_session(session_id, |s| {
            s.browse.goal_id = Some(id);
        })
        .await
        .map_err(ApiError::internal)?;
    let result = crate::browser::driver_call(
        &state,
        session_id,
        json!({ "tool": "open", "url": req.url }),
    )
    .await?;
    Ok(Json(json!({
        "goal_id": id,
        "session_id": session_id,
        "result": result,
    })))
}

/// Advance a plan step; opens an approval when moving a `requires_approval` step to done/blocked.
pub(crate) async fn advance_step(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(req): Json<AdvanceStepRequest>,
) -> ApiResult<Json<GoalRecord>> {
    let mut goal = state
        .store
        .get_goal(id)
        .await
        .ok_or_else(|| ApiError::not_found("goal not found"))?;
    let step = goal
        .plan
        .iter_mut()
        .find(|s| s.id == req.step_id)
        .ok_or_else(|| ApiError::not_found("plan step not found"))?;

    if step.requires_approval
        && matches!(req.status, PlanStepStatus::Done)
        && step.approval_id.is_none()
    {
        let session_id = goal
            .session_id
            .ok_or_else(|| ApiError::bad_request("goal needs session_id before approval steps"))?;
        let prompt = req
            .approval_prompt
            .clone()
            .unwrap_or_else(|| format!("Approve goal step: {}", step.title));
        let approval = ApprovalRecord {
            id: Uuid::new_v4(),
            session_id,
            kind: ApprovalKind::Send,
            subject: Some(format!("goal:{}:{}", goal.id, step.id)),
            planned_action: Some(json!({
                "goal_id": goal.id,
                "step_id": step.id,
                "title": step.title,
                "agent": goal.agent,
            })),
            prompt,
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
            .save_approval(approval.clone())
            .await
            .map_err(ApiError::internal)?;
        crate::notify::approval_requested(&state, &approval);
        step.approval_id = Some(approval.id);
        step.status = PlanStepStatus::Blocked;
        let step_id = step.id.clone();
        let approval_id = approval.id;
        goal.status = GoalStatus::Blocked;
        goal.updated_at = Utc::now();
        state
            .store
            .save_goal(goal.clone())
            .await
            .map_err(ApiError::internal)?;
        let _ = state
            .store
            .audit
            .append(
                Some(session_id),
                AuditPhase::Planned,
                "keep.goal.step.approval",
                Some(goal.agent.clone()),
                json!({ "goal_id": goal.id, "step_id": step_id, "approval_id": approval_id }),
            )
            .await;
        return Ok(Json(goal));
    }

    step.status = req.status;
    if let Some(aid) = req.artifact_id {
        step.artifact_id = Some(aid);
        if !goal.artifact_ids.contains(&aid) {
            goal.artifact_ids.push(aid);
        }
    }
    if let Some(detail) = req.detail {
        step.detail = Some(detail);
    }
    if goal
        .plan
        .iter()
        .all(|s| matches!(s.status, PlanStepStatus::Done | PlanStepStatus::Skipped))
    {
        goal.status = GoalStatus::Done;
    } else if goal
        .plan
        .iter()
        .any(|s| matches!(s.status, PlanStepStatus::Blocked))
    {
        goal.status = GoalStatus::Blocked;
    } else {
        goal.status = GoalStatus::Open;
    }
    goal.updated_at = Utc::now();
    state
        .store
        .save_goal(goal.clone())
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(goal))
}

pub(crate) async fn list_artifacts(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Query(q): Query<ListQuery>,
) -> Json<Value> {
    let mut items = state.store.list_artifacts().await;
    // A user sees only artifacts made in their own sessions.
    if let Some(uid) = principal.user() {
        let mine = authz::session_ids_of(&state, uid).await;
        items.retain(|a| a.session_id.is_some_and(|sid| mine.contains(&sid)));
    }
    if let Some(gid) = q.goal_id {
        items.retain(|a| a.goal_id == Some(gid));
    }
    if let Some(sid) = q.session_id {
        items.retain(|a| a.session_id == Some(sid));
    }
    if let Some(agent) = q.agent.as_deref() {
        items.retain(|a| a.agent.as_deref() == Some(agent));
    }
    if let Some(kind) = q.kind.as_deref() {
        items.retain(|a| a.kind == kind);
    }
    if let Some(uc) = q.use_case.as_deref() {
        items.retain(|a| a.metadata.get("demo").and_then(Value::as_str) == Some(uc));
    }
    if let Some(since) = q.since {
        items.retain(|a| a.created_at >= since);
    }
    let limit = q.limit.unwrap_or(100).clamp(1, 500);
    items.truncate(limit);
    Json(json!({ "items": items }))
}

pub(crate) async fn create_artifact(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateArtifactRequest>,
) -> ApiResult<(StatusCode, Json<ArtifactRecord>)> {
    if req.title.trim().is_empty() || req.kind.trim().is_empty() {
        return Err(ApiError::bad_request("kind and title are required"));
    }
    if req.body.len() > 512 * 1024 {
        return Err(ApiError::bad_request("artifact body exceeds 512 KiB"));
    }
    // Soft secret scan — refuse obvious key material in artifacts.
    let lower = req.body.to_ascii_lowercase();
    for needle in [
        "api_key=",
        "begin private key",
        "password=",
        "authorization: bearer ",
    ] {
        if lower.contains(needle) {
            return Err(ApiError::bad_request(
                "artifact body looks like it contains a secret",
            ));
        }
    }
    let expires_at = match req.ttl_seconds {
        None => None,
        Some(s) if (1..=315_360_000).contains(&s) => {
            Some(Utc::now() + chrono::Duration::seconds(s))
        }
        Some(_) => {
            return Err(ApiError::bad_request(
                "ttl_seconds must be between 1 and 315360000",
            ))
        }
    };
    let record = ArtifactRecord {
        id: Uuid::new_v4(),
        kind: req.kind,
        title: req.title.trim().to_string(),
        body: req.body,
        content_type: req.content_type.or_else(|| Some("text/markdown".into())),
        goal_id: req.goal_id,
        session_id: req.session_id,
        agent: req.agent,
        metadata: req.metadata.unwrap_or(Value::Null),
        created_at: Utc::now(),
        expires_at,
    };
    state
        .store
        .save_artifact(record.clone())
        .await
        .map_err(ApiError::internal)?;
    if let Some(gid) = record.goal_id {
        if let Some(mut goal) = state.store.get_goal(gid).await {
            if !goal.artifact_ids.contains(&record.id) {
                goal.artifact_ids.push(record.id);
                goal.updated_at = Utc::now();
                let _ = state.store.save_goal(goal).await;
            }
        }
    }
    let _ = state
        .store
        .audit
        .append(
            record.session_id,
            AuditPhase::Performed,
            "keep.artifact.created",
            record.agent.clone(),
            json!({ "artifact_id": record.id, "kind": record.kind, "title": record.title }),
        )
        .await;
    Ok((StatusCode::CREATED, Json(record)))
}

pub(crate) async fn get_artifact(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ArtifactRecord>> {
    state
        .store
        .get_artifact(id)
        .await
        .map(Json)
        .ok_or_else(|| ApiError::not_found("artifact not found"))
}

/// Line diff of two artifacts' bodies: `a` is treated as the older side.
pub(crate) async fn diff_artifacts(
    State(state): State<Arc<AppState>>,
    Path((a, b)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Value>> {
    let left = state
        .store
        .get_artifact(a)
        .await
        .ok_or_else(|| ApiError::not_found("artifact not found"))?;
    let right = state
        .store
        .get_artifact(b)
        .await
        .ok_or_else(|| ApiError::not_found("artifact not found"))?;
    let lines = crate::artifact_diff::diff_lines(&left.body, &right.body).ok_or_else(|| {
        ApiError::bad_request(format!(
            "artifact too large to diff (over {} lines)",
            crate::artifact_diff::MAX_DIFF_LINES
        ))
    })?;
    let summary = crate::artifact_diff::summarize(&lines);
    Ok(Json(json!({
        "a": { "id": left.id, "title": left.title, "created_at": left.created_at },
        "b": { "id": right.id, "title": right.title, "created_at": right.created_at },
        "summary": summary,
        "lines": lines,
    })))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::{config::Config, AppState};
    use axum::extract::{Path, Query, State};

    pub(crate) async fn test_state() -> Arc<AppState> {
        let root = std::env::temp_dir().join(format!("zyvor-goals-{}", Uuid::new_v4()));
        let config = Config {
            listen: "127.0.0.1:0".parse().unwrap(),
            egress_listen: "127.0.0.1:0".parse().unwrap(),
            state_dir: root.join("state"),
            snapshot_dir: root.join("snap"),
            fluxvm_url: "http://127.0.0.1:1".into(),
            fluxvm_token: None,
            api_token: None,
            credentials_file: None,
            skill_scopes_file: None,
            sentinel: None,
            approval_webhook: None,
            proxy_listen: None,
            proxy_connect_ports: vec![443],
            mitm_ca_dir: None,
            extra_ca_files: vec![],
            confine_all: false,
            security_profile: None,
            recover_key_a: None,
            recover_key_b: None,
            max_vcpus: None,
            max_memory_mib: None,
            egress_advertise_host: None,
            sync_interval_ms: 300,
            guest_start_timeout_secs: 30,
            idle_scan_interval_ms: 1000,
            warm_pool_reconcile_interval_ms: 2000,
            warm_pool_max_create_per_tick: 2,
            warm_pool_claim_stale_secs: 300,
            expiry_scan_interval_ms: 1000,
        };
        AppState::from_config(config).await.unwrap()
    }

    #[test]
    fn plan_step_defaults_pending() {
        let s: PlanStep = serde_json::from_value(json!({
            "id": "s1", "title": "Investigate"
        }))
        .unwrap();
        assert_eq!(s.status, PlanStepStatus::Pending);
        assert!(!s.requires_approval);
    }

    #[tokio::test]
    async fn create_goal_and_artifact_roundtrip() {
        let state = test_state().await;
        let (status, Json(goal)) = create_goal(
            State(state.clone()),
            Json(CreateGoalRequest {
                title: "Investigate alerts".into(),
                description: "infra-ops demo".into(),
                agent: "infra-ops".into(),
                user_id: None,
                session_id: None,
                plan: vec![
                    CreatePlanStep {
                        title: "Read alerts".into(),
                        requires_approval: false,
                        detail: None,
                    },
                    CreatePlanStep {
                        title: "Restart VM".into(),
                        requires_approval: true,
                        detail: None,
                    },
                ],
                allow_hosts: vec![],
            }),
        )
        .await
        .unwrap();
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(goal.plan.len(), 2);
        assert!(goal.plan[1].requires_approval);

        let (st, Json(art)) = create_artifact(
            State(state.clone()),
            Json(CreateArtifactRequest {
                kind: "incident-timeline".into(),
                title: "Timeline".into(),
                body: "# Alerts\n\nNo secrets here.\n".into(),
                content_type: None,
                goal_id: Some(goal.id),
                session_id: None,
                agent: Some("infra-ops".into()),
                metadata: None,
                ttl_seconds: None,
            }),
        )
        .await
        .unwrap();
        assert_eq!(st, StatusCode::CREATED);

        let Json(listed) = list_artifacts(
            State(state.clone()),
            Extension(Principal::Operator),
            Query(ListQuery {
                agent: None,
                goal_id: Some(goal.id),
                session_id: None,
                kind: None,
                limit: None,
                use_case: None,
                since: None,
            }),
        )
        .await;
        let items = listed["items"].as_array().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], json!(art.id));

        let Json(g2) = get_goal(State(state.clone()), Path(goal.id)).await.unwrap();
        assert!(g2.artifact_ids.contains(&art.id));
    }

    #[tokio::test]
    async fn requires_approval_step_opens_approval() {
        let state = test_state().await;
        let session_id = Uuid::new_v4();
        // Minimal session so advance can bind approval.
        use crate::model::{SessionRecord, SessionStartMode, SessionStartPolicy, SessionStatus};
        let now = Utc::now();
        state
            .store
            .save_session(SessionRecord {
                id: session_id,
                agent: "infra-ops".into(),
                agent_version: "v".into(),
                sandbox_id: Uuid::new_v4(),
                status: SessionStatus::Running,
                input: json!({}),
                created_at: now,
                updated_at: now,
                last_event_seq: 0,
                guest_event_cursor: 0,
                request_id: None,
                start_policy: SessionStartPolicy::PreferWarm,
                start_mode: SessionStartMode::Cold,
                startup_ms: None,
                expires_at: None,
                sandbox_released: false,
                capability_token: "cap".into(),
                error: None,
                parent_session_id: None,
                user_id: None,
                tainted_by: vec![],
                confidential: None,
                agent_paused_reason: None,
                browse: Default::default(),
            })
            .await
            .unwrap();

        let (_, Json(goal)) = create_goal(
            State(state.clone()),
            Json(CreateGoalRequest {
                title: "Remediate".into(),
                description: String::new(),
                agent: "infra-ops".into(),
                user_id: None,
                session_id: Some(session_id),
                plan: vec![CreatePlanStep {
                    title: "Restart".into(),
                    requires_approval: true,
                    detail: None,
                }],
                allow_hosts: vec![],
            }),
        )
        .await
        .unwrap();

        let Json(blocked) = advance_step(
            State(state.clone()),
            Path(goal.id),
            Json(AdvanceStepRequest {
                step_id: "s1".into(),
                status: PlanStepStatus::Done,
                artifact_id: None,
                detail: None,
                approval_prompt: Some("Restart vm-1?".into()),
            }),
        )
        .await
        .unwrap();
        assert_eq!(blocked.status, GoalStatus::Blocked);
        assert_eq!(blocked.plan[0].status, PlanStepStatus::Blocked);
        assert!(blocked.plan[0].approval_id.is_some());
        assert_eq!(state.store.list_approvals().await.len(), 1);
    }

    #[tokio::test]
    async fn artifact_rejects_secret_looking_body() {
        let state = test_state().await;
        let err = create_artifact(
            State(state),
            Json(CreateArtifactRequest {
                kind: "report".into(),
                title: "Bad".into(),
                body: "api_key=sk-live-xxx".into(),
                content_type: None,
                goal_id: None,
                session_id: None,
                agent: None,
                metadata: None,
                ttl_seconds: None,
            }),
        )
        .await
        .unwrap_err();
        assert!(err.message().contains("secret"));
    }

    fn artifact_req(
        title: &str,
        body: &str,
        demo: &str,
        ttl: Option<i64>,
    ) -> CreateArtifactRequest {
        CreateArtifactRequest {
            kind: "report".into(),
            title: title.into(),
            body: body.into(),
            content_type: None,
            goal_id: None,
            session_id: None,
            agent: None,
            metadata: Some(json!({ "demo": demo })),
            ttl_seconds: ttl,
        }
    }

    #[tokio::test]
    async fn artifact_ttl_out_of_range_is_refused() {
        let state = test_state().await;
        for bad in [0, -5, 315_360_001] {
            let err = create_artifact(
                State(state.clone()),
                Json(artifact_req("t", "b", "d", Some(bad))),
            )
            .await
            .unwrap_err();
            assert!(err.message().contains("ttl_seconds"), "{bad}");
        }
    }

    #[tokio::test]
    async fn expired_artifact_is_hidden_and_swept() {
        let state = test_state().await;
        let (_, Json(live)) = create_artifact(
            State(state.clone()),
            Json(artifact_req("live", "x", "d", Some(3600))),
        )
        .await
        .unwrap();
        let (_, Json(mut gone)) = create_artifact(
            State(state.clone()),
            Json(artifact_req("gone", "y", "d", None)),
        )
        .await
        .unwrap();
        gone.expires_at = Some(Utc::now() - chrono::Duration::seconds(1));
        state.store.save_artifact(gone.clone()).await.unwrap();

        assert!(state.store.get_artifact(gone.id).await.is_none());
        let ids: Vec<_> = state
            .store
            .list_artifacts()
            .await
            .iter()
            .map(|a| a.id)
            .collect();
        assert_eq!(ids, vec![live.id]);
    }

    #[tokio::test]
    async fn list_filters_by_use_case_and_since() {
        let state = test_state().await;
        let _ = create_artifact(
            State(state.clone()),
            Json(artifact_req("a", "1", "pdf-brief", None)),
        )
        .await
        .unwrap();
        let _ = create_artifact(
            State(state.clone()),
            Json(artifact_req("b", "2", "log-triage", None)),
        )
        .await
        .unwrap();
        let q = |use_case: Option<&str>, since| ListQuery {
            agent: None,
            goal_id: None,
            session_id: None,
            kind: None,
            limit: None,
            use_case: use_case.map(String::from),
            since,
        };
        let Json(l) = list_artifacts(
            State(state.clone()),
            Extension(Principal::Operator),
            Query(q(Some("log-triage"), None)),
        )
        .await;
        assert_eq!(l["items"].as_array().unwrap().len(), 1);
        assert_eq!(l["items"][0]["title"], "b");
        let future = Utc::now() + chrono::Duration::seconds(60);
        let Json(l) = list_artifacts(
            State(state),
            Extension(Principal::Operator),
            Query(q(None, Some(future))),
        )
        .await;
        assert!(l["items"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn diff_endpoint_compares_two_runs() {
        let state = test_state().await;
        let (_, Json(a)) = create_artifact(
            State(state.clone()),
            Json(artifact_req("r1", "a\nb", "d", None)),
        )
        .await
        .unwrap();
        let (_, Json(b)) = create_artifact(
            State(state.clone()),
            Json(artifact_req("r2", "a\nc", "d", None)),
        )
        .await
        .unwrap();
        let Json(d) = diff_artifacts(State(state.clone()), Path((a.id, b.id)))
            .await
            .unwrap();
        assert_eq!(d["summary"]["added"], 1);
        assert_eq!(d["summary"]["removed"], 1);
        assert_eq!(d["summary"]["unchanged"], 1);
        let err = diff_artifacts(State(state), Path((a.id, Uuid::new_v4())))
            .await
            .unwrap_err();
        assert!(err.message().contains("not found"));
    }
}
