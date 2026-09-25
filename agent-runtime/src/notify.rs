// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Out-of-band approval notifications.
//!
//! An approval is only useful if a human sees it, and it must reach them by a
//! path the agent cannot touch. When `ZYVOR_AGENT_APPROVAL_WEBHOOK` is set, each
//! new approval is POSTed there (a push service, or the user's phone app). The
//! body is signed with `ZYVOR_AGENT_APPROVAL_WEBHOOK_SECRET`, the same way
//! webhooks ingress is verified: `x-zyvor-signature: sha256=<hex HMAC-SHA256>`.
//! The receiver answers through the operator API (`POST /v1/approvals/{id}`),
//! which the agent's own credential cannot reach.
//!
//! Delivery is best effort and never blocks the request that opened the
//! approval; a delivery that finally fails is journaled.

use crate::{audit::AuditPhase, model::ApprovalRecord, schedules::hmac_sha256, AppState};
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct ApprovalWebhook {
    pub url: String,
    pub secret: String,
}

const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(10);
const RETRY_DELAYS: [Duration; 2] = [Duration::from_secs(1), Duration::from_secs(4)];

/// Tell the operator's device about a new approval, in the background.
pub fn approval_requested(state: &AppState, record: &ApprovalRecord) {
    let Some(webhook) = state.config.approval_webhook.clone() else {
        return;
    };
    let http = state.egress_http.clone();
    let store = state.store.clone();
    let record = record.clone();
    tokio::spawn(async move {
        let session = store.get_session(record.session_id).await;
        let body = payload(
            &record,
            session.as_ref().map(|s| s.agent.as_str()),
            session.as_ref().and_then(|s| s.user_id.as_deref()),
        );
        if let Err(error) = deliver(&http, &webhook, &body, &RETRY_DELAYS).await {
            tracing::warn!(%error, approval_id = %record.id, "approval notification failed");
            let _ = store
                .audit
                .append(
                    Some(record.session_id),
                    AuditPhase::Failed,
                    "approval.notify",
                    record.subject.clone(),
                    json!({"approval_id": record.id, "error": error.to_string()}),
                )
                .await;
        }
    });
}

/// The notification body. It carries what a person needs to decide and route
/// the prompt (which user's device), and never a request body or header.
pub fn payload(record: &ApprovalRecord, agent: Option<&str>, user_id: Option<&str>) -> Vec<u8> {
    let value: Value = json!({
        "event": "approval.requested",
        "channel": "out_of_band",
        "ui": {
            "title": format!("{} needs approval", record.kind.as_str()),
            "subtitle": record.subject.clone().unwrap_or_default(),
            "body": record.prompt,
            "actions": [
                {"id": "approve", "label": "Allow", "method": "POST", "path": format!("/v1/approvals/{}", record.id), "body": {"decision": "approved"}},
                {"id": "deny", "label": "Deny", "method": "POST", "path": format!("/v1/approvals/{}", record.id), "body": {"decision": "denied"}}
            ]
        },
        "approval": {
            "id": record.id,
            "session_id": record.session_id,
            "agent": agent,
            "user_id": user_id,
            "kind": record.kind.as_str(),
            "subject": record.subject,
            "prompt": record.prompt,
            "planned_action": record.planned_action,
            "created_at": record.created_at,
        },
        "decide": {"method": "POST", "path": format!("/v1/approvals/{}", record.id)},
        "note": "Never confirm this inside the agent chat — the guest cannot reach this webhook.",
    });
    serde_json::to_vec(&value).unwrap_or_default()
}

/// Tell the operator's device that a use case run finished or failed, in the
/// background. Same channel, signature and retry rules as approvals.
pub fn run_finished(state: &AppState, run: RunNotice) {
    let Some(webhook) = state.config.approval_webhook.clone() else {
        return;
    };
    let http = state.egress_http.clone();
    let store = state.store.clone();
    tokio::spawn(async move {
        let event = run.event();
        let body = run_payload(&run);
        if let Err(error) = deliver_event(&http, &webhook, event, &body, &RETRY_DELAYS).await {
            tracing::warn!(%error, demo = %run.demo, "run notification failed");
            let _ = store
                .audit
                .append(
                    run.session_id,
                    AuditPhase::Failed,
                    "run.notify",
                    Some(run.demo.clone()),
                    json!({"event": event, "error": error.to_string()}),
                )
                .await;
        }
    });
}

/// What a run notification says. Never carries the extracted text or file name.
#[derive(Clone, Debug)]
pub struct RunNotice {
    pub demo: String,
    pub session_id: Option<uuid::Uuid>,
    /// `Ok((artifact ids and titles, egress connects))` or `Err(reason)`.
    pub outcome: Result<(Vec<(uuid::Uuid, String)>, u64), String>,
}

impl RunNotice {
    pub fn event(&self) -> &'static str {
        if self.outcome.is_ok() {
            "run.finished"
        } else {
            "run.failed"
        }
    }
}

pub fn run_payload(run: &RunNotice) -> Vec<u8> {
    let (title, body, detail) = match &run.outcome {
        Ok((artifacts, connects)) => (
            format!("{} finished", run.demo),
            format!(
                "{} artifact(s), {connects} outbound connection(s)",
                artifacts.len()
            ),
            json!({
                "artifacts": artifacts.iter().map(|(id, title)| json!({"id": id, "title": title})).collect::<Vec<_>>(),
                "egress_connects": connects,
            }),
        ),
        Err(reason) => (
            format!("{} failed", run.demo),
            reason.clone(),
            json!({ "error": reason }),
        ),
    };
    let value: Value = json!({
        "event": run.event(),
        "channel": "out_of_band",
        "ui": { "title": title, "body": body },
        "run": { "demo": run.demo, "session_id": run.session_id, "detail": detail },
    });
    serde_json::to_vec(&value).unwrap_or_default()
}

/// POST `body`, retrying after each delay in `retry_delays` on any failure.
pub async fn deliver(
    http: &reqwest::Client,
    webhook: &ApprovalWebhook,
    body: &[u8],
    retry_delays: &[Duration],
) -> Result<()> {
    deliver_event(http, webhook, "approval.requested", body, retry_delays).await
}

/// [`deliver`] with an explicit `x-zyvor-event` name.
pub async fn deliver_event(
    http: &reqwest::Client,
    webhook: &ApprovalWebhook,
    event: &str,
    body: &[u8],
    retry_delays: &[Duration],
) -> Result<()> {
    let signature = hex::encode(hmac_sha256(webhook.secret.as_bytes(), body));
    let mut last = String::new();
    for attempt in 0..=retry_delays.len() {
        if attempt > 0 {
            tokio::time::sleep(retry_delays[attempt - 1]).await;
        }
        let result = http
            .post(&webhook.url)
            .timeout(ATTEMPT_TIMEOUT)
            .header("content-type", "application/json")
            .header("x-zyvor-event", event)
            .header("x-zyvor-signature", format!("sha256={signature}"))
            .body(body.to_vec())
            .send()
            .await;
        match result {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) => last = format!("receiver returned HTTP {}", response.status()),
            Err(error) => last = error.to_string(),
        }
    }
    bail!("{last}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedules::signature_matches;
    use axum::{body::Bytes, http::HeaderMap, routing::post, Router};
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    };

    type Seen = Arc<Mutex<Vec<(String, Vec<u8>)>>>;

    async fn receiver(fail_first: usize) -> (String, Seen) {
        let seen: Seen = Arc::default();
        let calls = Arc::new(AtomicUsize::new(0));
        let sink = seen.clone();
        let app = Router::new().route(
            "/hook",
            post(move |headers: HeaderMap, body: Bytes| {
                let (sink, calls) = (sink.clone(), calls.clone());
                async move {
                    let signature = headers
                        .get("x-zyvor-signature")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    sink.lock().unwrap().push((signature, body.to_vec()));
                    if calls.fetch_add(1, Ordering::SeqCst) < fail_first {
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR
                    } else {
                        axum::http::StatusCode::OK
                    }
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{addr}/hook"), seen)
    }

    fn record() -> ApprovalRecord {
        ApprovalRecord {
            id: uuid::Uuid::new_v4(),
            session_id: uuid::Uuid::new_v4(),
            kind: crate::model::ApprovalKind::Send,
            subject: Some("mail.example".into()),
            planned_action: Some(json!({"method": "POST", "body_sha256": "abc"})),
            prompt: "send it".into(),
            status: crate::model::ApprovalStatus::Pending,
            comment: None,
            created_at: chrono::Utc::now(),
            decided_at: None,
            source_seq: None,
            grant_scope: None,
            broker_held: false,
        }
    }

    #[test]
    fn payload_routes_by_user_and_says_how_to_decide() {
        let r = record();
        let value: Value =
            serde_json::from_slice(&payload(&r, Some("mailer"), Some("alice"))).unwrap();
        assert_eq!(value["event"], "approval.requested");
        assert_eq!(value["approval"]["user_id"], "alice");
        assert_eq!(value["approval"]["kind"], "send");
        assert_eq!(value["decide"]["path"], format!("/v1/approvals/{}", r.id));
    }

    #[test]
    fn run_payload_names_the_event_and_omits_file_names() {
        let id = uuid::Uuid::new_v4();
        let ok = RunNotice {
            demo: "pdf-brief".into(),
            session_id: Some(id),
            outcome: Ok((vec![(id, "brief.md".into())], 0)),
        };
        let v: Value = serde_json::from_slice(&run_payload(&ok)).unwrap();
        assert_eq!(v["event"], "run.finished");
        assert_eq!(v["run"]["detail"]["egress_connects"], 0);
        assert_eq!(v["run"]["detail"]["artifacts"][0]["title"], "brief.md");

        let bad = RunNotice {
            demo: "pdf-brief".into(),
            session_id: None,
            outcome: Err("session frozen".into()),
        };
        let v: Value = serde_json::from_slice(&run_payload(&bad)).unwrap();
        assert_eq!(v["event"], "run.failed");
        assert_eq!(v["ui"]["body"], "session frozen");
    }

    #[tokio::test]
    async fn delivery_sends_the_named_event_header() {
        let (url, seen) = receiver(0).await;
        let webhook = ApprovalWebhook {
            url,
            secret: "k".into(),
        };
        deliver_event(
            &reqwest::Client::new(),
            &webhook,
            "run.finished",
            b"{}",
            &[],
        )
        .await
        .unwrap();
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn delivery_is_signed_with_the_shared_secret() {
        let (url, seen) = receiver(0).await;
        let webhook = ApprovalWebhook {
            url,
            secret: "s3cret".into(),
        };
        let body = payload(&record(), None, None);
        deliver(&reqwest::Client::new(), &webhook, &body, &[])
            .await
            .unwrap();
        let (signature, received) = seen.lock().unwrap()[0].clone();
        assert_eq!(received, body);
        assert!(signature_matches("s3cret", &received, &signature));
        assert!(!signature_matches("other", &received, &signature));
    }

    #[tokio::test]
    async fn delivery_retries_then_succeeds() {
        let (url, seen) = receiver(2).await;
        let webhook = ApprovalWebhook {
            url,
            secret: "k".into(),
        };
        let delays = [Duration::from_millis(5), Duration::from_millis(5)];
        deliver(&reqwest::Client::new(), &webhook, b"{}", &delays)
            .await
            .unwrap();
        assert_eq!(seen.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn delivery_gives_up_with_the_last_error() {
        let (url, seen) = receiver(usize::MAX).await;
        let webhook = ApprovalWebhook {
            url,
            secret: "k".into(),
        };
        let error = deliver(
            &reqwest::Client::new(),
            &webhook,
            b"{}",
            &[Duration::from_millis(1)],
        )
        .await
        .unwrap_err()
        .to_string();
        assert!(error.contains("500"), "{error}");
        assert_eq!(seen.lock().unwrap().len(), 2);
    }
}
