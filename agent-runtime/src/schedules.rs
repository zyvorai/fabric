// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Cron schedules, HMAC webhooks, and bounded loops.
//!
//! These sit beside the session API. They do not bring their own queue:
//! each fire admits a normal session through the existing path, so egress
//! allowlists and credential grants stay on the target agent.

use crate::{
    app::{self, ApiError},
    model::{
        CreateLoopRequest, CreateScheduleRequest, CreateSessionRequest, CreateWebhookRequest,
        CreateWebhookResponse, LoopRecord, ScheduleRecord, SessionEvent, SessionStatus,
        WebhookRecord, WebhookView,
    },
    store::Store,
    AppState,
};
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

const MAX_DELEGATION_DEPTH: usize = 3;
const MAX_CHILDREN: usize = 8;

pub async fn schedule_loop(state: Arc<AppState>) {
    loop {
        if let Err(error) = tick(&state).await {
            tracing::warn!(%error, "schedule tick failed");
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

async fn tick(state: &Arc<AppState>) -> anyhow::Result<()> {
    let now = Utc::now();
    for schedule in state.store.list_schedules().await {
        if let Err(error) = tick_schedule(state, schedule, now).await {
            tracing::warn!(%error, "schedule fire failed");
        }
    }
    for loop_record in state.store.list_loops().await {
        if let Err(error) = tick_loop(state, loop_record, now).await {
            tracing::warn!(%error, "bounded loop tick failed");
        }
    }
    Ok(())
}

async fn tick_schedule(
    state: &Arc<AppState>,
    mut schedule: ScheduleRecord,
    now: DateTime<Utc>,
) -> anyhow::Result<()> {
    if !schedule.enabled {
        return Ok(());
    }
    let accounted_before = schedule.accounted_session_id;
    account_finished(
        &state.store,
        schedule.active_session_id,
        &mut schedule.accounted_session_id,
        &mut schedule.consecutive_no_progress,
        &mut schedule.accumulated_cost,
        &mut schedule.last_result,
    )
    .await?;
    let elapsed = now
        .signed_duration_since(schedule.started_at)
        .num_seconds()
        .max(0) as u64;
    if let Some(reason) = schedule.bounds.stop_reason(
        schedule.runs,
        elapsed,
        schedule.accumulated_cost,
        schedule.consecutive_no_progress,
    ) {
        schedule.enabled = false;
        schedule.stopped_reason = Some(reason.to_string());
        state.store.save_schedule(schedule).await?;
        return Ok(());
    }
    if schedule.next_run_at > now {
        if schedule.accounted_session_id != accounted_before {
            state.store.save_schedule(schedule).await?;
        }
        return Ok(());
    }
    if session_still_running(&state.store, schedule.active_session_id).await {
        return Ok(());
    }
    let request_id = format!(
        "schedule:{}:{}",
        schedule.id,
        schedule.next_run_at.timestamp()
    );
    let agent = schedule.agent.clone();
    let input = schedule.input.clone();
    match admit(state, &agent, input, request_id, None).await {
        Ok(session_id) => {
            schedule.runs = schedule.runs.saturating_add(1);
            schedule.active_session_id = Some(session_id);
            schedule.next_run_at =
                next_cron(&schedule.cron, now).unwrap_or(now + Duration::hours(1));
        }
        Err(error) => {
            tracing::warn!(schedule = %schedule.id, %error, "schedule admission failed");
            schedule.next_run_at =
                next_cron(&schedule.cron, now).unwrap_or(now + Duration::minutes(1));
        }
    }
    state.store.save_schedule(schedule).await?;
    Ok(())
}

async fn tick_loop(
    state: &Arc<AppState>,
    mut record: LoopRecord,
    now: DateTime<Utc>,
) -> anyhow::Result<()> {
    if !record.enabled {
        return Ok(());
    }
    if record.next_attempt_at.is_some_and(|at| at > now) {
        return Ok(());
    }
    account_finished(
        &state.store,
        record.active_session_id,
        &mut record.accounted_session_id,
        &mut record.consecutive_no_progress,
        &mut record.accumulated_cost,
        &mut record.last_result,
    )
    .await?;
    let elapsed = now
        .signed_duration_since(record.started_at)
        .num_seconds()
        .max(0) as u64;
    if let Some(reason) = record.bounds.stop_reason(
        record.runs,
        elapsed,
        record.accumulated_cost,
        record.consecutive_no_progress,
    ) {
        record.enabled = false;
        record.stopped_reason = Some(reason.to_string());
        state.store.save_loop(record).await?;
        return Ok(());
    }
    if session_still_running(&state.store, record.active_session_id).await {
        return Ok(());
    }
    // The first run has no prior session. Later runs wait until the previous
    // one has been accounted for, which `account_finished` just did.
    if record.runs > 0 && record.accounted_session_id != record.active_session_id {
        state.store.save_loop(record).await?;
        return Ok(());
    }
    let request_id = format!("loop:{}:{}", record.id, record.runs);
    let agent = record.agent.clone();
    let input = record.input.clone();
    match admit(state, &agent, input, request_id, None).await {
        Ok(session_id) => {
            record.runs = record.runs.saturating_add(1);
            record.active_session_id = Some(session_id);
            record.next_attempt_at = None;
        }
        Err(error) => {
            tracing::warn!(loop_id = %record.id, %error, "loop admission failed");
            record.next_attempt_at = Some(now + Duration::seconds(30));
        }
    }
    state.store.save_loop(record).await?;
    Ok(())
}

async fn session_still_running(store: &Store, id: Option<Uuid>) -> bool {
    let Some(id) = id else {
        return false;
    };
    store
        .get_session(id)
        .await
        .is_some_and(|session| !session.status.is_terminal())
}

async fn account_finished(
    store: &Store,
    active: Option<Uuid>,
    accounted: &mut Option<Uuid>,
    no_progress: &mut u32,
    cost: &mut f64,
    last_result: &mut Option<Value>,
) -> anyhow::Result<()> {
    let Some(id) = active else {
        return Ok(());
    };
    if *accounted == Some(id) {
        return Ok(());
    }
    let Some(session) = store.get_session(id).await else {
        return Ok(());
    };
    if !session.status.is_terminal() {
        return Ok(());
    }
    let events = store.events_after(id, 0).await?;
    let (progressed, run_cost) = progress_of(&events, last_result.as_ref());
    if progressed {
        *no_progress = 0;
    } else if session.status == SessionStatus::Completed {
        *no_progress = no_progress.saturating_add(1);
    }
    *cost += run_cost;
    if let Some(result) = events
        .iter()
        .rev()
        .find(|event| event.kind == "session.result")
    {
        *last_result = Some(result.data.clone());
    }
    *accounted = Some(id);
    Ok(())
}

fn progress_of(events: &[SessionEvent], previous: Option<&Value>) -> (bool, f64) {
    let Some(result) = events
        .iter()
        .rev()
        .find(|event| event.kind == "session.result")
    else {
        return (false, 0.0);
    };
    if result.data.is_null() {
        return (false, 0.0);
    }
    let cost = result
        .data
        .get("cost")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    if result.data.get("progress") == Some(&Value::Bool(false)) {
        return (false, cost);
    }
    let progressed = previous != Some(&result.data);
    (progressed, cost)
}

async fn admit(
    state: &Arc<AppState>,
    agent: &str,
    input: Value,
    request_id: String,
    parent_session_id: Option<Uuid>,
) -> Result<Uuid, String> {
    let req = CreateSessionRequest {
        agent: agent.to_string(),
        input,
        ttl_seconds: None,
        request_id: Some(request_id),
        start_policy: Default::default(),
        parent_session_id,
    };
    match app::create_session(State(state.clone()), Json(req)).await {
        Ok((_, Json(view))) => Ok(view.id),
        Err(error) => Err(error.message().to_string()),
    }
}

pub(crate) async fn delegation_allowed(state: &AppState, parent: Uuid) -> Result<(), ApiError> {
    let mut depth = 0usize;
    let mut current = Some(parent);
    while let Some(id) = current {
        depth += 1;
        if depth >= MAX_DELEGATION_DEPTH {
            return Err(ApiError::bad_request("delegation depth exceeded"));
        }
        current = state
            .store
            .get_session(id)
            .await
            .and_then(|session| session.parent_session_id);
    }
    let children = state
        .store
        .list_sessions()
        .await
        .into_iter()
        .filter(|session| {
            session.parent_session_id == Some(parent) && !session.status.is_terminal()
        })
        .count();
    if children >= MAX_CHILDREN {
        return Err(ApiError::too_many(
            "parent session has too many active delegated sessions",
        ));
    }
    Ok(())
}

pub(crate) async fn list_schedules(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({"items": state.store.list_schedules().await}))
}

pub(crate) async fn create_schedule(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateScheduleRequest>,
) -> Result<(StatusCode, Json<ScheduleRecord>), ApiError> {
    if state.store.get_agent(&req.agent).await.is_none() {
        return Err(ApiError::not_found("agent not found"));
    }
    let now = Utc::now();
    let next_run_at = next_cron(&req.cron, now).map_err(ApiError::bad_request)?;
    let record = ScheduleRecord {
        id: Uuid::new_v4(),
        agent: req.agent,
        cron: req.cron,
        input: req.input,
        bounds: req.bounds,
        enabled: true,
        created_at: now,
        started_at: now,
        next_run_at,
        runs: 0,
        consecutive_no_progress: 0,
        accumulated_cost: 0.0,
        active_session_id: None,
        accounted_session_id: None,
        last_result: None,
        stopped_reason: None,
    };
    state
        .store
        .save_schedule(record.clone())
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(record)))
}

pub(crate) async fn delete_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    if !state
        .store
        .delete_schedule(id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found("schedule not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn list_webhooks(State(state): State<Arc<AppState>>) -> Json<Value> {
    let items: Vec<WebhookView> = state
        .store
        .list_webhooks()
        .await
        .iter()
        .map(WebhookView::from)
        .collect();
    Json(json!({"items": items}))
}

pub(crate) async fn create_webhook(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateWebhookRequest>,
) -> Result<(StatusCode, Json<CreateWebhookResponse>), ApiError> {
    if state.store.get_agent(&req.agent).await.is_none() {
        return Err(ApiError::not_found("agent not found"));
    }
    let secret = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let record = WebhookRecord {
        id: Uuid::new_v4(),
        agent: req.agent,
        secret: secret.clone(),
        input: req.input,
        bounds: req.bounds,
        enabled: true,
        created_at: Utc::now(),
        runs: 0,
        stopped_reason: None,
    };
    state
        .store
        .save_webhook(record.clone())
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(CreateWebhookResponse {
            webhook: WebhookView::from(&record),
            secret,
        }),
    ))
}

pub(crate) async fn delete_webhook(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    if !state
        .store
        .delete_webhook(id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found("webhook not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn list_loops(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({"items": state.store.list_loops().await}))
}

pub(crate) async fn create_loop(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateLoopRequest>,
) -> Result<(StatusCode, Json<LoopRecord>), ApiError> {
    if state.store.get_agent(&req.agent).await.is_none() {
        return Err(ApiError::not_found("agent not found"));
    }
    if !req.bounds.is_bounded() {
        return Err(ApiError::bad_request(
            "a loop needs max_runs, max_duration_secs, max_cost, or max_no_progress",
        ));
    }
    let now = Utc::now();
    let record = LoopRecord {
        id: Uuid::new_v4(),
        agent: req.agent,
        input: req.input,
        bounds: req.bounds,
        enabled: true,
        created_at: now,
        started_at: now,
        runs: 0,
        consecutive_no_progress: 0,
        accumulated_cost: 0.0,
        active_session_id: None,
        accounted_session_id: None,
        last_result: None,
        stopped_reason: None,
        next_attempt_at: None,
    };
    state
        .store
        .save_loop(record.clone())
        .await
        .map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(record)))
}

pub(crate) async fn delete_loop(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    if !state
        .store
        .delete_loop(id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found("loop not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Signed ingress. The HMAC is the credential; this route is not behind the
/// bearer token. The body is the session input, merged with the webhook's
/// static input under `webhook`.
pub(crate) async fn webhook_ingress(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if body.len() > 1024 * 1024 {
        return Err(ApiError::bad_request("webhook body exceeds 1 MiB"));
    }
    let Some(mut webhook) = state.store.get_webhook(id).await else {
        return Err(ApiError::not_found("webhook not found"));
    };
    if !webhook.enabled {
        return Err(ApiError::conflict(
            webhook
                .stopped_reason
                .clone()
                .unwrap_or_else(|| "webhook is disabled".into()),
        ));
    }
    let presented = headers
        .get("x-zyvor-signature")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    if !signature_matches(&webhook.secret, &body, presented) {
        return Err(ApiError::unauthorized("invalid webhook signature"));
    }
    let elapsed = Utc::now()
        .signed_duration_since(webhook.created_at)
        .num_seconds()
        .max(0) as u64;
    if let Some(reason) = webhook.bounds.stop_reason(webhook.runs, elapsed, 0.0, 0) {
        webhook.enabled = false;
        webhook.stopped_reason = Some(reason.to_string());
        state
            .store
            .save_webhook(webhook)
            .await
            .map_err(ApiError::internal)?;
        return Err(ApiError::too_many(format!("webhook stopped: {reason}")));
    }
    let parsed: Value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body)
            .map_err(|e| ApiError::bad_request(format!("webhook body: {e}")))?
    };
    let mut input = webhook.input.clone();
    if input.is_null() {
        input = json!({});
    }
    if let Some(object) = input.as_object_mut() {
        object.insert("body".into(), parsed);
    } else {
        input = json!({"webhook": input, "body": parsed});
    }
    let idem = headers
        .get("x-zyvor-idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let request_id = match idem {
        Some(value) => format!("hook:{id}:{value}"),
        None => format!("hook:{id}:{}", Uuid::new_v4().simple()),
    };
    let session_id = admit(&state, &webhook.agent, input, request_id, None)
        .await
        .map_err(ApiError::bad_gateway)?;
    webhook.runs = webhook.runs.saturating_add(1);
    state
        .store
        .save_webhook(webhook)
        .await
        .map_err(ApiError::internal)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"session_id": session_id})),
    ))
}

pub fn signature_matches(secret: &str, body: &[u8], presented: &str) -> bool {
    let presented = presented
        .strip_prefix("sha256=")
        .unwrap_or(presented)
        .trim();
    let expected = hex::encode(hmac_sha256(secret.as_bytes(), body));
    constant_time_eq(expected.as_bytes(), presented.as_bytes())
}

pub fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut padded = [0u8; 64];
    if key.len() > 64 {
        let digested = Sha256::digest(key);
        padded[..32].copy_from_slice(&digested);
    } else {
        padded[..key.len()].copy_from_slice(key);
    }
    let mut inner = [0x36u8; 64];
    let mut outer = [0x5cu8; 64];
    for i in 0..64 {
        inner[i] ^= padded[i];
        outer[i] ^= padded[i];
    }
    let mut inner_hash = Sha256::new();
    inner_hash.update(inner);
    inner_hash.update(message);
    let inner_digest = inner_hash.finalize();
    let mut outer_hash = Sha256::new();
    outer_hash.update(outer);
    outer_hash.update(inner_digest);
    outer_hash.finalize().into()
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

#[derive(Clone, Debug)]
struct CronField {
    bits: u64,
}

pub fn next_cron(expr: &str, after: DateTime<Utc>) -> Result<DateTime<Utc>, String> {
    let fields = parse_cron(expr)?;
    let mut cursor = (after + Duration::minutes(1))
        .with_second(0)
        .and_then(|t| t.with_nanosecond(0))
        .ok_or_else(|| "could not truncate timestamp".to_string())?;
    for _ in 0..(60 * 24 * 366) {
        if cron_matches(&fields, cursor) {
            return Ok(cursor);
        }
        cursor += Duration::minutes(1);
    }
    Err("cron expression has no match in the next year".into())
}

fn parse_cron(expr: &str) -> Result<[CronField; 5], String> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() != 5 {
        return Err("cron must have 5 UTC fields: minute hour day month weekday".into());
    }
    let ranges = [(0u32, 59u32), (0, 23), (1, 31), (1, 12), (0, 7)];
    let mut fields = Vec::with_capacity(5);
    for (spec, (min, max)) in parts.iter().zip(ranges) {
        fields.push(CronField {
            bits: field_bits(spec, min, max)?,
        });
    }
    Ok(fields.try_into().expect("five cron fields"))
}

fn field_bits(spec: &str, min: u32, max: u32) -> Result<u64, String> {
    if spec.is_empty() || spec.len() > 64 {
        return Err(format!("invalid cron field '{spec}'"));
    }
    let mut bits = 0u64;
    for part in spec.split(',') {
        let (range, step) = part.split_once('/').unwrap_or((part, "1"));
        let step: u32 = step
            .parse()
            .map_err(|_| format!("invalid cron step in '{spec}'"))?;
        if step == 0 {
            return Err(format!("cron step in '{spec}' must be at least 1"));
        }
        let (start, end) = if range == "*" {
            (min, max)
        } else if let Some((start, end)) = range.split_once('-') {
            (
                parse_bound(start, min, max, spec)?,
                parse_bound(end, min, max, spec)?,
            )
        } else {
            let value = parse_bound(range, min, max, spec)?;
            (value, value)
        };
        if start > end {
            return Err(format!("invalid cron range in '{spec}'"));
        }
        let mut value = start;
        while value <= end {
            bits |= 1u64 << value;
            value = value.saturating_add(step);
        }
    }
    if bits == 0 {
        return Err(format!("cron field '{spec}' matches nothing"));
    }
    Ok(bits)
}

fn parse_bound(raw: &str, min: u32, max: u32, spec: &str) -> Result<u32, String> {
    let value: u32 = raw
        .parse()
        .map_err(|_| format!("invalid cron field '{spec}'"))?;
    if value < min || value > max {
        return Err(format!("cron value {value} is outside {min}-{max}"));
    }
    Ok(value)
}

fn cron_matches(fields: &[CronField; 5], when: DateTime<Utc>) -> bool {
    let minute = when.minute();
    let hour = when.hour();
    let day = when.day();
    let month = when.month();
    let dow = when.weekday().num_days_from_sunday();
    bit(fields[0].bits, minute)
        && bit(fields[1].bits, hour)
        && bit(fields[2].bits, day)
        && bit(fields[3].bits, month)
        && (bit(fields[4].bits, dow) || (dow == 0 && bit(fields[4].bits, 7)))
}

fn bit(bits: u64, value: u32) -> bool {
    value < 64 && bits & (1u64 << value) != 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::LoopBounds;

    #[test]
    fn hmac_matches_rfc_4231_case_1() {
        let key = [0x0bu8; 20];
        let mac = hmac_sha256(&key, b"Hi There");
        assert_eq!(
            hex::encode(mac),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn signature_requires_the_body_mac() {
        let body = br#"{"hello":"world"}"#;
        let mac = hex::encode(hmac_sha256(b"secret", body));
        assert!(signature_matches("secret", body, &format!("sha256={mac}")));
        assert!(!signature_matches("secret", body, "sha256=00"));
        assert!(!signature_matches("other", body, &format!("sha256={mac}")));
    }

    #[test]
    fn cron_next_is_the_following_hour() {
        let after = DateTime::parse_from_rfc3339("2026-01-01T00:30:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let next = next_cron("0 * * * *", after).unwrap();
        assert_eq!(next.to_rfc3339(), "2026-01-01T01:00:00+00:00");
    }

    #[test]
    fn cron_rejects_a_short_expression() {
        assert!(next_cron("* * *", Utc::now()).is_err());
    }

    #[test]
    fn bounds_stop_on_runs_and_cost() {
        let bounds = LoopBounds {
            max_runs: Some(2),
            max_duration_secs: None,
            max_cost: Some(1.5),
            max_no_progress: Some(3),
        };
        assert_eq!(bounds.stop_reason(2, 0, 0.0, 0), Some("max_runs"));
        assert_eq!(bounds.stop_reason(1, 0, 1.5, 0), Some("max_cost"));
        assert_eq!(bounds.stop_reason(1, 0, 0.0, 3), Some("no_progress"));
        assert_eq!(bounds.stop_reason(1, 0, 0.0, 0), None);
        assert!(bounds.is_bounded());
        assert!(!LoopBounds::default().is_bounded());
    }
}
