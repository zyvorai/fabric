// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Two users and an operator against the real router: nothing may cross between users.

use crate::{
    app::public_router,
    audit::AuditPhase,
    egress::ask_tests::state_and_session_cfg,
    goals::ArtifactRecord,
    model::{ApprovalKind, ApprovalRecord, ApprovalStatus, SessionRecord},
    AppState,
};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    Router,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

const OP: &str = "operator-token";

struct World {
    app: Router,
    state: Arc<AppState>,
    ana: Fixture,
    ben: Fixture,
    orphan_artifact: Uuid,
}

struct Fixture {
    session: Uuid,
    approval: Uuid,
    artifact: Uuid,
    token: String,
}

async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut b = Request::builder().method(method).uri(path);
    if let Some(t) = token {
        b = b.header("authorization", format!("Bearer {t}"));
    }
    let req = match body {
        Some(v) => b
            .header("content-type", "application/json")
            .body(Body::from(v.to_string())),
        None => b.body(Body::empty()),
    }
    .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn fixture(state: &Arc<AppState>, base: &SessionRecord, app: &Router, user: &str) -> Fixture {
    let now = Utc::now();
    let mut s = base.clone();
    s.id = Uuid::new_v4();
    s.user_id = Some(user.into());
    state.store.save_session(s.clone()).await.unwrap();
    let approval = ApprovalRecord {
        id: Uuid::new_v4(),
        session_id: s.id,
        kind: ApprovalKind::Send,
        subject: Some(format!("{user}.example")),
        planned_action: Some(json!({"body_sha256": "abc"})),
        prompt: format!("{user} wants to send"),
        status: ApprovalStatus::Pending,
        comment: None,
        created_at: now,
        decided_at: None,
        source_seq: None,
        grant_scope: None,
        broker_held: true,
    };
    state.store.save_approval(approval.clone()).await.unwrap();
    let artifact = ArtifactRecord {
        id: Uuid::new_v4(),
        kind: "report".into(),
        title: format!("{user}-report"),
        body: format!("private notes of {user}\nline two"),
        content_type: None,
        goal_id: None,
        session_id: Some(s.id),
        agent: None,
        metadata: Value::Null,
        created_at: now,
        expires_at: None,
    };
    state.store.save_artifact(artifact.clone()).await.unwrap();
    state
        .store
        .audit
        .append(
            Some(s.id),
            AuditPhase::Performed,
            "demo.done",
            Some(user.into()),
            json!({"who": user}),
        )
        .await
        .unwrap();
    let (st, v) = call(
        app,
        "POST",
        "/v1/user-tokens",
        Some(OP),
        Some(json!({"user_id": user, "ttl_seconds": 600})),
    )
    .await;
    assert_eq!(st, StatusCode::CREATED, "{v}");
    Fixture {
        session: s.id,
        approval: approval.id,
        artifact: artifact.id,
        token: v["token"].as_str().unwrap().to_string(),
    }
}

async fn world() -> World {
    let (state, base) = state_and_session_cfg(|c| c.api_token = Some(OP.into())).await;
    let app = public_router(state.clone());
    let ana = fixture(&state, &base, &app, "ana").await;
    let ben = fixture(&state, &base, &app, "ben").await;
    // An artifact made outside any session belongs to no user.
    let orphan = ArtifactRecord {
        id: Uuid::new_v4(),
        kind: "note".into(),
        title: "operator-note".into(),
        body: "x".into(),
        content_type: None,
        goal_id: None,
        session_id: None,
        agent: None,
        metadata: Value::Null,
        created_at: Utc::now(),
        expires_at: None,
    };
    state.store.save_artifact(orphan.clone()).await.unwrap();
    World {
        app,
        state,
        ana,
        ben,
        orphan_artifact: orphan.id,
    }
}

fn ids(v: &Value, key: &str) -> Vec<String> {
    v["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|i| i[key].as_str().unwrap_or_default().to_string())
        .collect()
}

#[tokio::test]
async fn a_user_sees_only_their_own_sessions_approvals_artifacts_and_audit() {
    let w = world().await;
    let t = Some(w.ana.token.as_str());

    let (_, v) = call(&w.app, "GET", "/v1/sessions", t, None).await;
    assert_eq!(ids(&v, "id"), vec![w.ana.session.to_string()]);
    // Asking for someone else's list by parameter changes nothing.
    let (_, v) = call(&w.app, "GET", "/v1/sessions?user_id=ben", t, None).await;
    assert_eq!(ids(&v, "id"), vec![w.ana.session.to_string()]);

    let (_, v) = call(&w.app, "GET", "/v1/approvals", t, None).await;
    assert_eq!(ids(&v, "id"), vec![w.ana.approval.to_string()]);

    let (_, v) = call(&w.app, "GET", "/v1/artifacts", t, None).await;
    assert_eq!(
        ids(&v, "id"),
        vec![w.ana.artifact.to_string()],
        "no other user's and no session-less artifact"
    );

    let (_, v) = call(&w.app, "GET", "/v1/audit", t, None).await;
    let rows = v["items"].as_array().unwrap();
    assert!(
        !rows.is_empty()
            && rows
                .iter()
                .all(|r| r["session_id"] == w.ana.session.to_string())
    );
    assert!(
        !v.to_string().contains("\"ben\""),
        "another user's rows leaked: {v}"
    );
    assert!(
        v["chain"].get("entries").is_none(),
        "the journal size is not shown to users"
    );
    assert_eq!(v["chain"]["chain_ok"], true);
}

#[tokio::test]
async fn a_user_cannot_read_or_touch_anything_of_another_user() {
    let w = world().await;
    let t = Some(w.ana.token.as_str());
    for path in [
        format!("/v1/sessions/{}", w.ben.session),
        format!("/v1/sessions/{}/cockpit", w.ben.session),
        format!("/v1/sessions/{}/events", w.ben.session),
        format!("/v1/sessions/{}/browser/view", w.ben.session),
        format!("/v1/artifacts/{}", w.ben.artifact),
        format!("/v1/artifacts/{}", w.orphan_artifact),
        format!("/v1/artifacts/{}/diff/{}", w.ana.artifact, w.ben.artifact),
        format!("/v1/artifacts/{}/diff/{}", w.ben.artifact, w.ana.artifact),
    ] {
        let (st, _) = call(&w.app, "GET", &path, t, None).await;
        assert_eq!(st, StatusCode::NOT_FOUND, "GET {path}");
    }
    for path in [
        format!("/v1/sessions/{}/cancel", w.ben.session),
        format!("/v1/sessions/{}/steer", w.ben.session),
    ] {
        let (st, _) = call(&w.app, "POST", &path, t, Some(json!({}))).await;
        assert_eq!(st, StatusCode::NOT_FOUND, "POST {path}");
    }
    let (st, _) = call(
        &w.app,
        "DELETE",
        &format!("/v1/sessions/{}", w.ben.session),
        t,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    // Deciding another user's approval is refused and the approval is untouched.
    let path = format!("/v1/approvals/{}", w.ben.approval);
    let (st, _) = call(
        &w.app,
        "POST",
        &path,
        t,
        Some(json!({"decision": "approved"})),
    )
    .await;
    assert_eq!(st, StatusCode::NOT_FOUND);
    assert_eq!(
        w.state
            .store
            .get_approval(w.ben.approval)
            .await
            .unwrap()
            .status,
        ApprovalStatus::Pending
    );
    // Their own works.
    let (st, _) = call(
        &w.app,
        "POST",
        &format!("/v1/approvals/{}", w.ana.approval),
        t,
        Some(json!({"decision": "denied"})),
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        w.state
            .store
            .get_approval(w.ana.approval)
            .await
            .unwrap()
            .status,
        ApprovalStatus::Denied
    );
}

#[tokio::test]
async fn operator_routes_are_closed_to_user_tokens() {
    let w = world().await;
    let t = Some(w.ana.token.as_str());
    for (m, p) in [
        ("GET", "/v1/keep/status"),
        ("GET", "/v1/agents"),
        ("POST", "/v1/agents"),
        ("POST", "/v1/user-tokens"),
        ("POST", "/v1/users/ben/revoke-tokens"),
        ("GET", "/v1/triggers"),
        ("POST", "/v1/triggers"),
        ("GET", "/v1/model-grants"),
        ("GET", "/v1/export/audit"),
        ("POST", "/v1/export-tokens"),
        ("GET", "/v1/vault/status"),
        ("GET", "/v1/goals"),
        ("POST", "/v1/artifacts"),
        ("POST", "/v1/approvals"),
        ("POST", "/v1/demos"),
        ("DELETE", "/v1/demos/csv-clean"),
        ("GET", "/v1/workstations/a/b"),
        ("POST", "/mcp"),
    ] {
        let (st, _) = call(&w.app, m, p, t, Some(json!({}))).await;
        assert_eq!(st, StatusCode::FORBIDDEN, "{m} {p}");
    }
}

#[tokio::test]
async fn tokens_are_header_only_scoped_and_revocable() {
    let w = world().await;
    // Never in a query string.
    let (st, _) = call(
        &w.app,
        "GET",
        &format!("/v1/sessions?token={}", w.ana.token),
        None,
        None,
    )
    .await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    // No token, a garbage token, and a token from another shard's key.
    for bad in [None, Some("kut1.garbage.00"), Some("nope")] {
        let (st, _) = call(&w.app, "GET", "/v1/sessions", bad, None).await;
        assert_eq!(st, StatusCode::UNAUTHORIZED, "{bad:?}");
    }
    // A read-only token cannot decide an approval or start a run.
    let (_, v) = call(
        &w.app,
        "POST",
        "/v1/user-tokens",
        Some(OP),
        Some(json!({"user_id": "ana", "scopes": ["read"]})),
    )
    .await;
    let ro = v["token"].as_str().unwrap().to_string();
    let (st, v) = call(
        &w.app,
        "POST",
        &format!("/v1/approvals/{}", w.ana.approval),
        Some(&ro),
        Some(json!({"decision": "approved"})),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN, "{v}");
    let (st, _) = call(
        &w.app,
        "POST",
        "/v1/sessions",
        Some(&ro),
        Some(json!({"agent": "x"})),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    let (st, _) = call(&w.app, "GET", "/v1/sessions", Some(&ro), None).await;
    assert_eq!(st, StatusCode::OK);
    // A user token cannot start a session for someone else.
    let (st, _) = call(
        &w.app,
        "POST",
        "/v1/sessions",
        Some(&w.ana.token),
        Some(json!({"agent": "x", "user_id": "ben"})),
    )
    .await;
    assert_eq!(st, StatusCode::FORBIDDEN);
    // Unknown scope and bad user are refused at mint time.
    let (st, _) = call(
        &w.app,
        "POST",
        "/v1/user-tokens",
        Some(OP),
        Some(json!({"user_id": "ana", "scopes": ["root"]})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (st, _) = call(
        &w.app,
        "POST",
        "/v1/user-tokens",
        Some(OP),
        Some(json!({"user_id": "Ana Silva"})),
    )
    .await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Revoking cuts off ana, not ben.
    let (st, _) = call(
        &w.app,
        "POST",
        "/v1/users/ana/revoke-tokens",
        Some(OP),
        None,
    )
    .await;
    assert_eq!(st, StatusCode::OK);
    let (st, _) = call(&w.app, "GET", "/v1/sessions", Some(&w.ana.token), None).await;
    assert_eq!(
        st,
        StatusCode::UNAUTHORIZED,
        "the old token must stop working"
    );
    let (st, _) = call(&w.app, "GET", "/v1/sessions", Some(&w.ben.token), None).await;
    assert_eq!(st, StatusCode::OK);
    tokio::time::sleep(std::time::Duration::from_millis(2100)).await;
    let (_, v) = call(
        &w.app,
        "POST",
        "/v1/user-tokens",
        Some(OP),
        Some(json!({"user_id": "ana"})),
    )
    .await;
    let fresh = v["token"].as_str().unwrap().to_string();
    let (st, _) = call(&w.app, "GET", "/v1/sessions", Some(&fresh), None).await;
    assert_eq!(
        st,
        StatusCode::OK,
        "a token minted after the revocation works"
    );
}

#[tokio::test]
async fn the_operator_still_sees_everything() {
    let w = world().await;
    let t = Some(OP);
    let (_, v) = call(&w.app, "GET", "/v1/approvals", t, None).await;
    assert_eq!(ids(&v, "id").len(), 2);
    let (_, v) = call(&w.app, "GET", "/v1/artifacts", t, None).await;
    assert_eq!(ids(&v, "id").len(), 3);
    let (_, v) = call(
        &w.app,
        "GET",
        &format!("/v1/artifacts/{}", w.orphan_artifact),
        t,
        None,
    )
    .await;
    assert_eq!(v["title"], "operator-note");
    let (_, v) = call(&w.app, "GET", "/v1/audit", t, None).await;
    assert!(v["chain"]["entries"].as_u64().unwrap() >= 2);
}

#[tokio::test]
async fn usage_and_inbox_are_per_user() {
    let w = world().await;
    let t = Some(w.ana.token.as_str());
    let (st, v) = call(&w.app, "GET", "/v1/usage?user_id=ben", t, None).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        v["usage"]["user_id"], "ana",
        "a user always reads their own usage"
    );
    assert_eq!(v["usage"]["runs"], 1);
    assert_eq!(v["usage"]["artifacts"], 1);
    assert!(v["usage"]["artifact_bytes"].as_u64().unwrap() > 0);

    let (_, v) = call(&w.app, "GET", "/v1/inbox", t, None).await;
    assert_eq!(v["user_id"], "ana");
    assert_eq!(v["pending_approvals"].as_array().unwrap().len(), 1);
    assert_eq!(v["pending_approvals"][0]["id"], w.ana.approval.to_string());
    assert_eq!(v["recent_runs"].as_array().unwrap().len(), 1);
    assert_eq!(v["recent_runs"][0]["artifacts"][0]["title"], "ana-report");
    assert!(!v.to_string().contains("ben"));

    // The operator names the user; without one it is a 400.
    let (st, _) = call(&w.app, "GET", "/v1/usage", Some(OP), None).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    let (_, v) = call(&w.app, "GET", "/v1/usage?user_id=ben", Some(OP), None).await;
    assert_eq!(v["usage"]["user_id"], "ben");
}

#[tokio::test]
async fn quotas_return_429_when_the_operator_sets_them() {
    let w = world().await;
    // ana already has 1 session and 1 artifact. Limits are read from the environment, so this
    // test uses `check_run_quota` directly with explicit limits (no process-wide env changes).
    let limits = crate::usage::Limits {
        max_runs_per_day: Some(1),
        ..Default::default()
    };
    let err = crate::usage::check_run_quota(&w.state, "ana", limits)
        .await
        .unwrap_err();
    assert_eq!(err.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(err.message().contains("1 of 1 runs"), "{}", err.message());
    let roomy = crate::usage::Limits {
        max_runs_per_day: Some(5),
        max_artifacts: Some(5),
        ..Default::default()
    };
    assert!(crate::usage::check_run_quota(&w.state, "ana", roomy)
        .await
        .is_ok());
    let art = crate::usage::Limits {
        max_artifacts: Some(1),
        ..Default::default()
    };
    assert!(crate::usage::check_run_quota(&w.state, "ben", art)
        .await
        .is_err());
    assert!(crate::usage::check_run_quota(&w.state, "cy-no-data", art)
        .await
        .is_ok());
    let none = crate::usage::Limits::default();
    assert!(crate::usage::check_run_quota(&w.state, "ana", none)
        .await
        .is_ok());
    let model = crate::usage::Limits {
        max_model_calls_per_day: Some(1),
        ..Default::default()
    };
    assert!(
        crate::usage::check_model_quota(&w.state, "ana", model)
            .await
            .is_ok(),
        "no model calls yet"
    );
}
