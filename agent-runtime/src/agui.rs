// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! An AG-UI endpoint over Keep sessions: `POST /v1/agui`.
//!
//! Chat frameworks that speak the AG-UI protocol post a `RunAgentInput` and read a stream of events. This maps one run onto a Keep session
//! and its events, so such a client can talk to an agent that runs in a sealed cell. It adds no new authority:
//!
//! * a session is started (or, for a thread that already has one, steered) through the same functions as `POST /v1/sessions` and
//!   `POST /v1/sessions/{id}/steer`, so scopes, quotas, tenancy and the agent's own policy all apply unchanged;
//! * a user token needs the `run` scope, like starting a session;
//! * an approval the agent asks for appears as a `CUSTOM` event carrying the prompt. **There is no way to approve or deny from this
//!   endpoint**: an approval is decided on the user's device, through `/v1/approvals`, and nothing a chat client sends can do it.

use crate::{
    app::{self, ApiError, ApiResult},
    authz::Principal,
    model::{CreateSessionRequest, SessionEvent, SessionStatus, SteerRequest},
    AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    Extension, Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{convert::Infallible, sync::Arc, time::Duration};

/// The longest user message accepted from a chat client.
const MAX_MESSAGE_BYTES: usize = 16 * 1024;

/// The AG-UI `RunAgentInput` fields Keep uses; the rest (`tools`, `context`, ...) are accepted and ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentInput {
    pub thread_id: String,
    pub run_id: String,
    #[serde(default)]
    pub messages: Vec<InMessage>,
    #[serde(default)]
    pub state: Value,
    /// `forwardedProps.agent` names the deployed Keep agent to talk to.
    #[serde(default)]
    pub forwarded_props: Value,
}

#[derive(Debug, Deserialize)]
pub struct InMessage {
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub content: Value,
}

/// The text of the latest user message: a string, or the text parts of a content array.
pub fn last_user_text(messages: &[InMessage]) -> Option<String> {
    let m = messages.iter().rev().find(|m| m.role == "user")?;
    let text = match &m.content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => return None,
    };
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// A thread's session is found again by a request id that depends on the caller, so two users who pick the same thread id never share a session.
pub fn thread_request_id(user: Option<&str>, thread_id: &str) -> String {
    let mut h = Sha256::new();
    h.update(user.unwrap_or("operator").as_bytes());
    h.update([0]);
    h.update(thread_id.as_bytes());
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    format!("agui-{}", &hex[..40])
}

/// The same shape as a pack name: `^[a-z0-9][a-z0-9-]{0,39}$`.
fn valid_agent_name(name: &str) -> bool {
    let b = name.as_bytes();
    !b.is_empty()
        && b.len() <= 40
        && b[0] != b'-'
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

/// What the stream is doing between events: whether an assistant text message is open.
#[derive(Debug, Default)]
pub struct Mapper {
    open: bool,
}

const MESSAGE_ID: &str = "keep-assistant";

impl Mapper {
    fn close(&mut self, out: &mut Vec<Value>) {
        if self.open {
            out.push(json!({"type": "TEXT_MESSAGE_END", "messageId": MESSAGE_ID}));
            self.open = false;
        }
    }

    fn text(&mut self, out: &mut Vec<Value>, delta: &str) {
        if !self.open {
            out.push(
                json!({"type": "TEXT_MESSAGE_START", "messageId": MESSAGE_ID, "role": "assistant"}),
            );
            self.open = true;
        }
        out.push(json!({"type": "TEXT_MESSAGE_CONTENT", "messageId": MESSAGE_ID, "delta": delta}));
    }

    /// The AG-UI events for one Keep session event, and whether the run is over.
    pub fn map(&mut self, ev: &SessionEvent, thread_id: &str, run_id: &str) -> (Vec<Value>, bool) {
        let mut out = Vec::new();
        let d = &ev.data;
        match ev.kind.as_str() {
            "session.log" => {
                let line = d.get("line").and_then(Value::as_str).unwrap_or_default();
                if d.get("stream").and_then(Value::as_str) == Some("stderr") {
                    out.push(json!({"type": "CUSTOM", "name": "keep.log", "value": {"stream": "stderr", "line": line}}));
                } else {
                    self.text(&mut out, &format!("{line}\n"));
                }
            }
            "approval.requested" => {
                self.close(&mut out);
                let prompt = d.get("prompt").cloned().unwrap_or(Value::Null);
                out.push(json!({"type": "CUSTOM", "name": "keep.approval_requested",
                    "value": {"prompt": prompt, "decide": "on your device: this endpoint cannot approve or deny"}}));
            }
            "session.waiting" | "session.running" => {
                out.push(json!({"type": "CUSTOM", "name": format!("keep.{}", &ev.kind["session.".len()..]), "value": d}));
            }
            "session.result" => {
                self.close(&mut out);
                if let Some(text) = d.as_str() {
                    self.text(&mut out, text);
                    self.close(&mut out);
                }
                out.push(json!({"type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id, "result": d}));
                return (out, true);
            }
            "session.failed" | "session.cancelled" | "session.expired" | "session.deleted" => {
                self.close(&mut out);
                let code = &ev.kind["session.".len()..];
                let message = d
                    .get("error")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("the session ended: {code}"));
                out.push(json!({"type": "RUN_ERROR", "message": message, "code": code}));
                return (out, true);
            }
            // events the agent itself emitted (`ctx.emit`), for a UI that wants progress; the runtime's own lifecycle events are not passed on
            k if !k.starts_with("session.")
                && !k.starts_with("runtime.")
                && !k.starts_with("approval.") =>
            {
                out.push(json!({"type": "CUSTOM", "name": "keep.event", "value": {"kind": k, "data": d}}));
            }
            _ => {}
        }
        (out, false)
    }
}

fn sse(v: &Value) -> Event {
    Event::default().data(v.to_string())
}

/// `POST /v1/agui`
pub(crate) async fn agui_run(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Json(input): Json<RunAgentInput>,
) -> ApiResult<Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>>> {
    let agent = input
        .forwarded_props
        .get("agent")
        .and_then(Value::as_str)
        .filter(|a| valid_agent_name(a))
        .ok_or_else(|| {
            ApiError::bad_request("forwardedProps.agent must name a deployed Keep agent (lowercase letters, digits, '-')")
        })?
        .to_string();
    if input.thread_id.is_empty()
        || input.thread_id.len() > 200
        || input.run_id.is_empty()
        || input.run_id.len() > 200
    {
        return Err(ApiError::bad_request(
            "threadId and runId are required and at most 200 characters",
        ));
    }
    let text = last_user_text(&input.messages)
        .ok_or_else(|| ApiError::bad_request("the run needs a user message with text"))?;
    if text.len() > MAX_MESSAGE_BYTES {
        return Err(ApiError::bad_request(format!(
            "the message is over {MAX_MESSAGE_BYTES} bytes"
        )));
    }
    let request_id = thread_request_id(principal.user(), &input.thread_id);

    // A thread keeps one session: the first message starts it, later messages steer it while it runs.
    let (session_id, mut cursor) = match state
        .store
        .find_session_by_request_id(&agent, &request_id)
        .await
    {
        Some(existing) if existing.status.is_terminal() => {
            return Err(ApiError::conflict(
                "this thread's session has ended; start a new thread",
            ));
        }
        Some(existing) => {
            let id = existing.id;
            // the reply of a steer is not needed; an error (the session is not running) ends this run with a clear message
            let _ = app::steer_session(
                State(state.clone()),
                Path(id),
                Json(SteerRequest {
                    message: Value::String(text),
                }),
            )
            .await?;
            (id, existing.last_event_seq)
        }
        None => {
            let req = CreateSessionRequest {
                agent,
                input: json!({"message": text, "threadId": input.thread_id, "state": input.state}),
                ttl_seconds: None,
                request_id: Some(request_id),
                start_policy: Default::default(),
                parent_session_id: None,
                user_id: None,
            };
            let (status, Json(view)) =
                app::create_session_route(State(state.clone()), Extension(principal), Json(req))
                    .await?;
            if status != StatusCode::CREATED && status != StatusCode::OK {
                return Err(ApiError::internal(format!(
                    "unexpected status {status} creating the session"
                )));
            }
            (view.id, 0)
        }
    };

    let (thread_id, run_id) = (input.thread_id, input.run_id);
    let stream = async_stream::stream! {
        yield Ok(sse(&json!({"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id})));
        let mut mapper = Mapper::default();
        loop {
            match state.store.events_after(session_id, cursor).await {
                Ok(events) => {
                    for ev in events {
                        cursor = ev.seq;
                        let (out, done) = mapper.map(&ev, &thread_id, &run_id);
                        for v in out { yield Ok(sse(&v)); }
                        if done { return; }
                    }
                }
                Err(e) => {
                    yield Ok(sse(&json!({"type": "RUN_ERROR", "message": e.to_string(), "code": "events"})));
                    return;
                }
            }
            let terminal = state.store.get_session(session_id).await.map(|s| s.status.is_terminal() || matches!(s.status, SessionStatus::Hibernated)).unwrap_or(true);
            if terminal {
                // drain what arrived between the last read and the status change, then stop
                if let Ok(events) = state.store.events_after(session_id, cursor).await {
                    for ev in events {
                        let (out, _) = mapper.map(&ev, &thread_id, &run_id);
                        for v in out { yield Ok(sse(&v)); }
                    }
                }
                yield Ok(sse(&json!({"type": "RUN_ERROR", "message": "the session ended without a result", "code": "ended"})));
                return;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn ev(kind: &str, data: Value) -> SessionEvent {
        SessionEvent {
            session_id: Uuid::nil(),
            seq: 1,
            kind: kind.into(),
            data,
            timestamp: Utc::now(),
        }
    }
    fn msg(role: &str, content: Value) -> InMessage {
        InMessage {
            role: role.into(),
            content,
        }
    }

    #[test]
    fn the_last_user_message_is_the_input() {
        let ms = vec![
            msg("user", json!("first")),
            msg("assistant", json!("hi")),
            msg("user", json!("  second  ")),
        ];
        assert_eq!(last_user_text(&ms).as_deref(), Some("second"));
        let parts = vec![msg(
            "user",
            json!([{"type": "text", "text": "a"}, {"type": "image", "url": "x"}, {"type": "text", "text": "b"}]),
        )];
        assert_eq!(last_user_text(&parts).as_deref(), Some("a\nb"));
        assert_eq!(last_user_text(&[msg("assistant", json!("x"))]), None);
        assert_eq!(last_user_text(&[msg("user", json!("   "))]), None);
        assert_eq!(last_user_text(&[msg("user", json!({"not": "text"}))]), None);
    }

    #[test]
    fn a_thread_never_shares_a_session_across_users() {
        let a = thread_request_id(Some("ana"), "t1");
        let b = thread_request_id(Some("ben"), "t1");
        let op = thread_request_id(None, "t1");
        assert_ne!(a, b);
        assert_ne!(a, op);
        assert_eq!(
            a,
            thread_request_id(Some("ana"), "t1"),
            "stable for the same user and thread"
        );
        assert!(a.starts_with("agui-") && a.len() == 45);
        // a valid request id for the runtime: letters, digits and '-' only
        assert!(a.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'));
    }

    #[test]
    fn agent_names_are_the_pack_name_shape() {
        for ok in ["csv-clean", "a", "model-agent2", "0day"] {
            assert!(valid_agent_name(ok), "{ok}");
        }
        for bad in ["", "Upper", "has space", "../x", "-lead", &"a".repeat(41)] {
            assert!(!valid_agent_name(bad), "{bad}");
        }
    }

    #[test]
    fn stdout_becomes_one_assistant_message_and_the_result_finishes_the_run() {
        let mut m = Mapper::default();
        let (a, done) = m.map(
            &ev("session.log", json!({"stream": "stdout", "line": "hello"})),
            "t",
            "r",
        );
        assert!(!done);
        assert_eq!(a[0]["type"], "TEXT_MESSAGE_START");
        assert_eq!(a[0]["role"], "assistant");
        assert_eq!(a[1]["type"], "TEXT_MESSAGE_CONTENT");
        assert_eq!(a[1]["delta"], "hello\n");
        // a second line continues the same message
        let (b, _) = m.map(
            &ev("session.log", json!({"stream": "stdout", "line": "world"})),
            "t",
            "r",
        );
        assert_eq!(b.len(), 1);
        assert_eq!(b[0]["messageId"], a[0]["messageId"]);
        let (c, done) = m.map(&ev("session.result", json!({"ok": true})), "t", "r");
        assert!(done);
        assert_eq!(c[0]["type"], "TEXT_MESSAGE_END");
        assert_eq!(c[1]["type"], "RUN_FINISHED");
        assert_eq!(c[1]["threadId"], "t");
        assert_eq!(c[1]["runId"], "r");
        assert_eq!(c[1]["result"]["ok"], true);
    }

    #[test]
    fn stderr_is_not_assistant_text_and_a_string_result_is_a_message() {
        let mut m = Mapper::default();
        let (a, _) = m.map(
            &ev("session.log", json!({"stream": "stderr", "line": "warn"})),
            "t",
            "r",
        );
        assert_eq!(a.len(), 1);
        assert_eq!(a[0]["type"], "CUSTOM");
        assert_eq!(a[0]["name"], "keep.log");
        let (b, done) = m.map(&ev("session.result", json!("the answer")), "t", "r");
        assert!(done);
        let kinds: Vec<&str> = b.iter().map(|v| v["type"].as_str().unwrap()).collect();
        assert_eq!(
            kinds,
            [
                "TEXT_MESSAGE_START",
                "TEXT_MESSAGE_CONTENT",
                "TEXT_MESSAGE_END",
                "RUN_FINISHED"
            ]
        );
        assert_eq!(b[1]["delta"], "the answer");
    }

    #[test]
    fn an_approval_request_is_shown_but_can_only_be_decided_elsewhere() {
        let mut m = Mapper::default();
        m.map(
            &ev("session.log", json!({"stream": "stdout", "line": "x"})),
            "t",
            "r",
        );
        let (a, done) = m.map(
            &ev("approval.requested", json!({"prompt": "send the email?"})),
            "t",
            "r",
        );
        assert!(!done);
        assert_eq!(
            a[0]["type"], "TEXT_MESSAGE_END",
            "an open message is closed first"
        );
        assert_eq!(a[1]["type"], "CUSTOM");
        assert_eq!(a[1]["name"], "keep.approval_requested");
        assert_eq!(a[1]["value"]["prompt"], "send the email?");
        assert!(a[1]["value"]["decide"]
            .as_str()
            .unwrap()
            .contains("cannot approve or deny"));
    }

    #[test]
    fn failures_and_cancellations_end_the_run_with_an_error() {
        for (kind, code) in [
            ("session.failed", "failed"),
            ("session.cancelled", "cancelled"),
            ("session.expired", "expired"),
        ] {
            let mut m = Mapper::default();
            let (a, done) = m.map(&ev(kind, json!({"error": "boom"})), "t", "r");
            assert!(done, "{kind}");
            assert_eq!(a.last().unwrap()["type"], "RUN_ERROR");
            assert_eq!(a.last().unwrap()["code"], code);
        }
        let mut m = Mapper::default();
        let (a, _) = m.map(&ev("session.cancelled", Value::Null), "t", "r");
        assert_eq!(a[0]["message"], "the session ended: cancelled");
    }

    #[test]
    fn lifecycle_noise_is_dropped_and_waiting_is_a_custom_event() {
        let mut m = Mapper::default();
        for quiet in [
            "session.created",
            "session.started",
            "runtime.ready",
            "session.checkpoint",
            "session.steer",
        ] {
            assert!(
                m.map(&ev(quiet, Value::Null), "t", "r").0.is_empty(),
                "{quiet}"
            );
        }
        // an event the agent emitted with ctx.emit is passed on as a CUSTOM event
        let (e, done) = m.map(&ev("echo.received", json!({"chars": 3})), "t", "r");
        assert!(!done);
        assert_eq!(e[0]["type"], "CUSTOM");
        assert_eq!(e[0]["name"], "keep.event");
        assert_eq!(e[0]["value"]["kind"], "echo.received");
        let (a, done) = m.map(&ev("session.waiting", json!({"timeout_ms": 5})), "t", "r");
        assert!(!done);
        assert_eq!(a[0]["name"], "keep.waiting");
    }
}
