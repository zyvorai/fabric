// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! One-click Keep demos. PDF brief never opens a browser and never CONNECTs.

use crate::{
    app::{ApiError, ApiResult},
    audit::AuditPhase,
    goals::{ArtifactRecord, GoalRecord, GoalStatus},
    model::{
        SessionRecord, SessionStartMode, SessionStartPolicy, SessionStatus,
    },
    AppState,
};
use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

/// `POST /v1/demos/pdf-brief` (multipart field `pdf` optional — lab sample otherwise).
pub(crate) async fn demo_pdf_brief(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Value>)> {
    if let Err(e) = state.fluxvm.security_capabilities().await {
        return Err(ApiError::bad_gateway(format!(
            "Cell engine not ready (/readyz): {e:#}"
        )));
    }

    let mut pdf_bytes: Option<Vec<u8>> = None;
    let mut filename = "input.pdf".to_string();
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "pdf" || name == "file" {
            if let Some(n) = field.file_name().map(str::to_string) {
                filename = n;
            }
            pdf_bytes = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(e.to_string()))?
                    .to_vec(),
            );
        }
    }
    let pdf = pdf_bytes.unwrap_or_else(lab_sample_pdf);
    if pdf.is_empty() {
        return Err(ApiError::bad_request("empty PDF"));
    }

    let template = std::env::var("ZYVOR_DEMO_TEMPLATE")
        .unwrap_or_else(|_| "node22-agent".into());
    let id = Uuid::new_v4();
    let sandbox = state
        .fluxvm
        .create_sandbox(
            format!("pdf-brief-{id}"),
            &template,
            Some(1800),
            state.config.egress_listen.port(),
            &crate::fluxvm::SandboxOptions {
                volumes: &[],
                resources: None,
                confidential: crate::model::Confidential::Off,
                security_profile: state.config.security_profile.as_deref(),
            },
        )
        .await
        .map_err(|e| ApiError::bad_gateway(format!("sandbox create: {e:#}")))?;

    // Proxy-or-die on the host before any guest work.
    if let Ok(gw) = state.fluxvm.default_gateway(sandbox.id).await {
        if let Ok(gateway) = crate::confine::parse_gateway(&gw) {
            let policy = crate::confine::strict_policy(
                gateway,
                state.config.egress_listen.port(),
                state.config.proxy_listen.map(|a| a.port()),
                &[],
                Some(&id.to_string()),
                Some("pdf-brief"),
            );
            let _ = state
                .fluxvm
                .set_network_policy(sandbox.id, &policy)
                .await;
        }
    }

    let now = Utc::now();
    let session = SessionRecord {
        id,
        agent: "pdf-brief".into(),
        agent_version: "demo".into(),
        sandbox_id: sandbox.id,
        status: SessionStatus::Running,
        input: json!({ "demo": "pdf-brief", "filename": filename }),
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
        capability_token: format!("demo-{}", Uuid::new_v4()),
        error: None,
        parent_session_id: None,
        user_id: None,
        tainted_by: vec![],
        confidential: sandbox.confidential.clone(),
        agent_paused_reason: None,
        browse: Default::default(),
    };
    state
        .store
        .save_session(session.clone())
        .await
        .map_err(ApiError::internal)?;

    let goal = GoalRecord {
        id: Uuid::new_v4(),
        title: "Brief this PDF".into(),
        description:
            "Read /home/agent/work/input.pdf only. Write artifact brief.md. No browser. No hosts."
                .into(),
        agent: "pdf-brief".into(),
        user_id: None,
        session_id: Some(id),
        status: GoalStatus::Open,
        plan: vec![],
        artifact_ids: vec![],
        allow_hosts: vec![],
        created_at: now,
        updated_at: now,
    };
    state
        .store
        .save_goal(goal.clone())
        .await
        .map_err(ApiError::internal)?;

    state
        .fluxvm
        .process(sandbox.id, "mkdir -p /home/agent/work", Some(30))
        .await
        .map_err(|e| ApiError::bad_gateway(format!("mkdir: {e:#}")))?;
    state
        .fluxvm
        .fs_write(sandbox.id, "/home/agent/work/input.pdf", &pdf, 0o644)
        .await
        .map_err(|e| ApiError::bad_gateway(format!("put-file: {e:#}")))?;

    let extract = match state
        .fluxvm
        .process(
            sandbox.id,
            "pdftotext -layout /home/agent/work/input.pdf - 2>/dev/null | head -c 24000",
            Some(60),
        )
        .await
    {
        Ok(v) => {
            let stdout = v
                .get("stdout")
                .and_then(Value::as_str)
                .or_else(|| {
                    v.get("data")
                        .and_then(|d| d.get("stdout"))
                        .and_then(Value::as_str)
                })
                .unwrap_or("")
                .trim()
                .to_string();
            if stdout.is_empty() {
                return Err(ApiError::bad_request(
                    "No text layer — host OCR, don't send pixels to the model",
                ));
            }
            stdout
        }
        Err(e) => {
            let msg = format!("{e:#}");
            if msg.contains("pdftotext") || msg.contains("127") || msg.contains("not found") {
                return Err(ApiError::bad_request(
                    "Image missing poppler — bake node22-agent with pdftotext",
                ));
            }
            return Err(ApiError::bad_gateway(format!("extract failed: {msg}")));
        }
    };

    let brief = build_brief(&filename, &extract);
    let art = ArtifactRecord {
        id: Uuid::new_v4(),
        kind: "brief".into(),
        title: "brief.md".into(),
        body: brief.clone(),
        content_type: Some("text/markdown".into()),
        goal_id: Some(goal.id),
        session_id: Some(id),
        agent: Some("pdf-brief".into()),
        metadata: json!({
            "filename": filename,
            "extract_chars": extract.chars().count(),
            "demo": "pdf-brief",
        }),
        created_at: Utc::now(),
    };
    state
        .store
        .save_artifact(art.clone())
        .await
        .map_err(ApiError::internal)?;
    let mut goal = goal;
    goal.artifact_ids.push(art.id);
    goal.status = GoalStatus::Done;
    goal.updated_at = Utc::now();
    let _ = state.store.save_goal(goal.clone()).await;

    let connects = session_egress_connects(&state, id).await;
    if connects > 0 {
        let _ = state
            .store
            .update_session(id, |s| {
                s.agent_paused_reason = Some(crate::model::AgentPausedReason::EbpfDeny);
            })
            .await;
        let _ = state.fluxvm.freeze(sandbox.id).await;
        return Err(ApiError::conflict(format!(
            "demo FAIL: {connects} CONNECT/ebpf events — session frozen"
        )));
    }

    let _ = state
        .store
        .audit
        .append(
            Some(id),
            AuditPhase::Performed,
            "demo.pdf_brief.done",
            Some("pdf-brief".into()),
            json!({
                "filename": filename,
                "extract_chars": extract.chars().count(),
                "artifact_id": art.id,
                "egress_connects": connects,
            }),
        )
        .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "session_id": id,
            "agent": "pdf-brief",
            "goal_id": goal.id,
            "filename": filename,
            "bytes": pdf.len(),
            "extract_chars": extract.chars().count(),
            "artifact_id": art.id,
            "artifact_title": "brief.md",
            "egress_connects": connects,
            "cockpit_url": format!("/app/keep/{id}"),
            "badge": {
                "evidence": "software-test",
                "operator_can_read": true,
                "proxy": "strict",
                "browser": "none",
            },
            "honesty": "software-test · operator can read · 0 CONNECT",
        })),
    ))
}

fn build_brief(filename: &str, extract: &str) -> String {
    let preview: String = extract.chars().take(1200).collect();
    let important: Vec<&str> = extract
        .lines()
        .map(str::trim)
        .filter(|l| l.len() > 40)
        .take(5)
        .collect();
    format!(
        r#"# brief.md

## Summary
Local extract of `{filename}` inside a Keep cell with `egress_mode: deny` and
FluxVM `deny_udp` + gateway-only L4 pin. No browser. No CONNECT.

## Important
{important}

## Quotes
```
{preview}
```

## Missing
Model socket optional for stage demos — this brief is extractive so a 502
never forces a browser fallback.
"#,
        important = if important.is_empty() {
            "- (short document)".into()
        } else {
            important
                .iter()
                .map(|l| format!("- {l}"))
                .collect::<Vec<_>>()
                .join("\n")
        }
    )
}

pub async fn session_egress_connects(state: &AppState, session_id: Uuid) -> u64 {
    let entries = state
        .store
        .audit
        .list(Some(session_id), 500)
        .await
        .unwrap_or_default();
    entries
        .iter()
        .filter(|e| e.action == "egress.connect" || e.action.starts_with("ebpf."))
        .count() as u64
}

fn lab_sample_pdf() -> Vec<u8> {
    br#"%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 24 Tf 72 720 Td (Keep lab sample PDF) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000384 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
461
%%EOF
"#
    .to_vec()
}
