// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! One-click Keep demos: drop an untrusted file into a sealed cell, get an
//! artifact back. Every demo never opens a browser and never CONNECTs; the run
//! fails closed (session frozen, 409) if the audit journal shows an outbound
//! connection.
//!
//! Demos are table-driven. A [`DemoSpec`] names the accepted file types, the
//! fixed guest command that extracts text, and the pure builder in
//! [`crate::demo_builders`] that turns that text into artifacts. Adding a use
//! case means adding a spec and a builder, not a route.

use crate::{
    app::{ApiError, ApiResult},
    audit::AuditPhase,
    demo_builders::{self as b, BuildResult},
    goals::{ArtifactRecord, GoalRecord, GoalStatus},
    model::{SessionRecord, SessionStartMode, SessionStartPolicy, SessionStatus},
    AppState,
};
use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

/// Everything that differs between demos.
pub(crate) struct DemoSpec {
    pub id: &'static str,
    pub title: &'static str,
    pub blurb: &'static str,
    /// Lower-case file extensions (no dot) an upload may have.
    pub accepts: &'static [&'static str],
    /// Fixed name of the file inside the guest. Never derived from the upload.
    pub guest_file: &'static str,
    /// Fixed guest command; `{path}` is replaced with the guest file path.
    pub extract_cmd: &'static str,
    /// Largest upload accepted, in bytes.
    pub max_bytes: usize,
    /// Shown when the guest extracts nothing.
    pub empty_msg: &'static str,
    pub goal_title: &'static str,
    pub goal_description: &'static str,
    pub build: fn(&str, &str) -> BuildResult,
    /// Built-in input used when no file is uploaded: (filename, bytes).
    pub sample: fn() -> (&'static str, Vec<u8>),
}

const PDF_CMD: &str = "pdftotext -layout {path} - 2>/dev/null | head -c 24000";
const PDF_EMPTY: &str = "No text layer — host OCR, don't send pixels to the model";
const TEXT_LIMIT: usize = 200_000;
const JSON_LIMIT: usize = 300_000;
const PDF_LIMIT: usize = 32 * 1024 * 1024;

pub(crate) const DEMOS: &[DemoSpec] = &[
    DemoSpec {
        id: "pdf-brief",
        title: "PDF brief",
        blurb: "Drop a PDF, get a one-page brief.md.",
        accepts: &["pdf"],
        guest_file: "input.pdf",
        extract_cmd: PDF_CMD,
        max_bytes: PDF_LIMIT,
        empty_msg: PDF_EMPTY,
        goal_title: "Brief this PDF",
        goal_description:
            "Read /home/agent/work/input.pdf only. Write artifact brief.md. No browser. No hosts.",
        build: b::pdf_brief,
        sample: || ("lab-sample.pdf", lab_sample_pdf()),
    },
    DemoSpec {
        id: "contract-clauses",
        title: "Contract clauses",
        blurb: "Drop a contract PDF, get the term, renewal, payment, liability and governing-law lines.",
        accepts: &["pdf"],
        guest_file: "input.pdf",
        extract_cmd: PDF_CMD,
        max_bytes: PDF_LIMIT,
        empty_msg: PDF_EMPTY,
        goal_title: "Pull the key clauses",
        goal_description:
            "Read /home/agent/work/input.pdf only. Write artifact clauses.md. No browser. No hosts.",
        build: b::contract_clauses,
        sample: || {
            (
                "sample-contract.pdf",
                simple_pdf(&[
                    "MASTER SERVICES AGREEMENT",
                    "1. Term. The initial term of this Agreement is twelve (12) months from the Effective Date.",
                    "2. Renewal. This Agreement automatically renews for successive one-year terms.",
                    "3. Fees and payment. Invoices are due net 30 from receipt of invoice.",
                    "4. Termination. Either party may terminate for material breach on 30 days notice.",
                    "5. Limitation of liability. Neither party is liable for consequential damages.",
                    "6. Confidentiality. Each party keeps the other's confidential information private.",
                    "7. Governing law. This Agreement is governed by the laws of the State of Delaware.",
                ]),
            )
        },
    },
    DemoSpec {
        id: "security-questionnaire",
        title: "Security questionnaire",
        blurb: "Drop a vendor questionnaire PDF, get each question paired with the answer as written.",
        accepts: &["pdf"],
        guest_file: "input.pdf",
        extract_cmd: PDF_CMD,
        max_bytes: PDF_LIMIT,
        empty_msg: PDF_EMPTY,
        goal_title: "Pair questions with answers",
        goal_description:
            "Read /home/agent/work/input.pdf only. Write artifact answers.md. No browser. No hosts.",
        build: b::security_questionnaire,
        sample: || {
            (
                "sample-questionnaire.pdf",
                simple_pdf(&[
                    "VENDOR SECURITY QUESTIONNAIRE",
                    "1. Do you encrypt customer data at rest?",
                    "Yes. AES-256 on all volumes.",
                    "2. Do you run annual penetration tests?",
                    "3. Describe your incident response process.",
                    "A 24 hour on-call rota with a written runbook.",
                ]),
            )
        },
    },
    DemoSpec {
        id: "meeting-actions",
        title: "Meeting actions",
        blurb: "Drop a transcript (.txt or .vtt), get action items with owners and decisions.",
        accepts: &["txt", "vtt"],
        guest_file: "input.txt",
        extract_cmd: "head -c 200000 {path}",
        max_bytes: TEXT_LIMIT,
        empty_msg: "The transcript is empty",
        goal_title: "Find the action items",
        goal_description:
            "Read /home/agent/work/input.txt only. Write artifact actions.md. No browser. No hosts.",
        build: b::meeting_actions,
        sample: || {
            (
                "sample-meeting.vtt",
                b"WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nDana: I will send the revised quote by Friday.\n\n\
2\n00:00:06.000 --> 00:00:09.000\nSam: We agreed to go ahead with the pilot.\n\n\
3\n00:00:10.000 --> 00:00:13.000\nLee: Action item: review the security questionnaire before next week.\n"
                    .to_vec(),
            )
        },
    },
    DemoSpec {
        id: "log-triage",
        title: "Log triage",
        blurb: "Drop a log file, get error counts, the most repeated errors and error bursts.",
        accepts: &["log", "txt"],
        guest_file: "input.log",
        extract_cmd: "head -c 200000 {path}",
        max_bytes: TEXT_LIMIT,
        empty_msg: "The log file is empty",
        goal_title: "Triage this log",
        goal_description:
            "Read /home/agent/work/input.log only. Write artifact triage.md. No browser. No hosts.",
        build: b::log_triage,
        sample: || {
            (
                "sample.log",
                b"2026-09-25T10:00:01 INFO service started\n\
2026-09-25T10:00:05 ERROR timeout after 30s calling db-1\n\
2026-09-25T10:00:09 ERROR timeout after 45s calling db-2\n\
2026-09-25T10:01:00 WARN slow query 1200ms\n\
2026-09-25T10:02:10 ERROR connection reset by peer\n"
                    .to_vec(),
            )
        },
    },
    DemoSpec {
        id: "sbom-summary",
        title: "SBOM summary",
        blurb: "Drop a CycloneDX, SPDX or SARIF JSON file, get component, license and severity counts.",
        accepts: &["json"],
        guest_file: "input.json",
        extract_cmd: "head -c 300000 {path}",
        max_bytes: JSON_LIMIT,
        empty_msg: "The JSON file is empty",
        goal_title: "Summarise this SBOM",
        goal_description:
            "Read /home/agent/work/input.json only. Write artifact summary.md. No browser. No hosts.",
        build: b::sbom_summary,
        sample: || {
            (
                "sample-bom.json",
                br#"{"bomFormat":"CycloneDX","specVersion":"1.5","components":[
{"name":"left-pad","version":"1.3.0","licenses":[{"license":{"id":"MIT"}}]},
{"name":"internal-lib","version":"0.4.1"}],
"vulnerabilities":[{"id":"CVE-2026-0001","ratings":[{"severity":"high"}]}]}"#
                    .to_vec(),
            )
        },
    },
    DemoSpec {
        id: "csv-clean",
        title: "CSV cleanup",
        blurb: "Drop a CSV, get clean.csv plus a report: blanks and duplicates removed, formula cells neutralised.",
        accepts: &["csv"],
        guest_file: "input.csv",
        extract_cmd: "head -c 300000 {path}",
        max_bytes: JSON_LIMIT,
        empty_msg: "The CSV file is empty",
        goal_title: "Clean this CSV",
        goal_description:
            "Read /home/agent/work/input.csv only. Write artifacts clean.csv and report.md. No browser. No hosts.",
        build: b::csv_clean,
        sample: || {
            (
                "sample.csv",
                b"name,amount,note\nAnn,5,ok\n Ann ,5,ok\n,,\nBob,-3.5,=HYPERLINK(\"http://example.com\")\n"
                    .to_vec(),
            )
        },
    },
];

fn spec_by_id(id: &str) -> Option<&'static DemoSpec> {
    DEMOS.iter().find(|d| d.id == id)
}

/// `GET /v1/demos` — what the console can offer.
pub(crate) async fn demo_list() -> Json<Value> {
    Json(json!({
        "demos": DEMOS.iter().map(|d| json!({
            "id": d.id,
            "title": d.title,
            "description": d.blurb,
            "accepts": d.accepts,
            "max_bytes": d.max_bytes,
            "browser": "none",
            "egress": "deny",
        })).collect::<Vec<_>>(),
    }))
}

fn extension(filename: &str) -> String {
    filename
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default()
}

/// `POST /v1/demos/{id}` (multipart field `file`, or `pdf` for the original
/// PDF brief; optional — a built-in sample is used otherwise).
pub(crate) async fn demo_run(
    State(state): State<Arc<AppState>>,
    Path(demo_id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let spec = spec_by_id(&demo_id)
        .ok_or_else(|| ApiError::not_found(format!("no demo named {demo_id:?}")))?;

    let mut upload: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::bad_request(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" || name == "pdf" {
            filename = field.file_name().map(str::to_string);
            upload = Some(
                field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::bad_request(e.to_string()))?
                    .to_vec(),
            );
        }
    }
    let (filename, input) = match upload {
        Some(bytes) => (
            filename.unwrap_or_else(|| spec.guest_file.to_string()),
            bytes,
        ),
        None => {
            let (n, bytes) = (spec.sample)();
            (n.to_string(), bytes)
        }
    };
    if input.is_empty() {
        return Err(ApiError::bad_request("empty file"));
    }
    if input.len() > spec.max_bytes {
        return Err(ApiError::bad_request(format!(
            "file is {} bytes; the {} demo accepts up to {}",
            input.len(),
            spec.id,
            spec.max_bytes
        )));
    }
    let ext = extension(&filename);
    if !spec.accepts.contains(&ext.as_str()) {
        return Err(ApiError::bad_request(format!(
            "the {} demo accepts .{} files, not .{}",
            spec.id,
            spec.accepts.join(" / ."),
            if ext.is_empty() { "(none)" } else { &ext }
        )));
    }

    // Validate the input before touching FluxVM: bad uploads fail fast and cheap.
    if let Err(e) = state.fluxvm.security_capabilities().await {
        return Err(ApiError::bad_gateway(format!(
            "Cell engine not ready (/readyz): {e:#}"
        )));
    }

    let template = std::env::var("ZYVOR_DEMO_TEMPLATE").unwrap_or_else(|_| "node22-agent".into());
    let id = Uuid::new_v4();
    let sandbox = state
        .fluxvm
        .create_sandbox(
            format!("{}-{id}", spec.id),
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
                Some(spec.id),
            );
            let _ = state.fluxvm.set_network_policy(sandbox.id, &policy).await;
        }
    }

    let now = Utc::now();
    let session = SessionRecord {
        id,
        agent: spec.id.into(),
        agent_version: "demo".into(),
        sandbox_id: sandbox.id,
        status: SessionStatus::Running,
        input: json!({ "demo": spec.id, "filename": filename }),
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
        title: spec.goal_title.into(),
        description: spec.goal_description.into(),
        agent: spec.id.into(),
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

    let guest_path = format!("/home/agent/work/{}", spec.guest_file);
    state
        .fluxvm
        .process(sandbox.id, "mkdir -p /home/agent/work", Some(30))
        .await
        .map_err(|e| ApiError::bad_gateway(format!("mkdir: {e:#}")))?;
    state
        .fluxvm
        .fs_write(sandbox.id, &guest_path, &input, 0o644)
        .await
        .map_err(|e| ApiError::bad_gateway(format!("put-file: {e:#}")))?;

    let extract = match state
        .fluxvm
        .process(
            sandbox.id,
            &spec.extract_cmd.replace("{path}", &guest_path),
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
                return Err(ApiError::bad_request(spec.empty_msg));
            }
            stdout
        }
        Err(e) => {
            let msg = format!("{e:#}");
            if spec.extract_cmd.starts_with("pdftotext")
                && (msg.contains("pdftotext") || msg.contains("127") || msg.contains("not found"))
            {
                return Err(ApiError::bad_request(
                    "Image missing poppler — bake node22-agent with pdftotext",
                ));
            }
            return Err(ApiError::bad_gateway(format!("extract failed: {msg}")));
        }
    };

    let built = (spec.build)(&filename, &extract).map_err(ApiError::bad_request)?;
    let mut goal = goal;
    let mut saved: Vec<ArtifactRecord> = Vec::new();
    for a in &built {
        let art = ArtifactRecord {
            id: Uuid::new_v4(),
            kind: a.kind.into(),
            title: a.title.into(),
            body: a.body.clone(),
            content_type: Some(a.content_type.into()),
            goal_id: Some(goal.id),
            session_id: Some(id),
            agent: Some(spec.id.into()),
            metadata: json!({
                "filename": filename,
                "extract_chars": extract.chars().count(),
                "demo": spec.id,
            }),
            created_at: Utc::now(),
        };
        state
            .store
            .save_artifact(art.clone())
            .await
            .map_err(ApiError::internal)?;
        goal.artifact_ids.push(art.id);
        saved.push(art);
    }
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

    let first = &saved[0];
    let _ = state
        .store
        .audit
        .append(
            Some(id),
            AuditPhase::Performed,
            &format!("demo.{}.done", spec.id.replace('-', "_")),
            Some(spec.id.into()),
            json!({
                "filename": filename,
                "extract_chars": extract.chars().count(),
                "artifact_id": first.id,
                "egress_connects": connects,
            }),
        )
        .await;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "demo": spec.id,
            "session_id": id,
            "agent": spec.id,
            "goal_id": goal.id,
            "filename": filename,
            "bytes": input.len(),
            "extract_chars": extract.chars().count(),
            "artifact_id": first.id,
            "artifact_title": first.title,
            "artifacts": saved.iter().map(|a| json!({
                "id": a.id,
                "title": a.title,
                "kind": a.kind,
            })).collect::<Vec<_>>(),
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

/// Minimal single-page text PDF (Helvetica, one line per entry) with a correct
/// xref table, so `pdftotext` reads it without repair.
fn simple_pdf(lines: &[&str]) -> Vec<u8> {
    let mut stream = String::from("BT /F1 10 Tf 40 760 Td 13 TL\n");
    for line in lines.iter().take(50) {
        let esc = line
            .replace('\\', "\\\\")
            .replace('(', "\\(")
            .replace(')', "\\)");
        stream.push_str(&format!("({esc}) Tj T*\n"));
    }
    stream.push_str("ET");
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R \
         /Resources << /Font << /F1 5 0 R >> >> >>"
            .to_string(),
        format!(
            "<< /Length {} >>\nstream\n{stream}\nendstream",
            stream.len()
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ];
    let mut out = String::from("%PDF-1.4\n");
    let mut offsets = Vec::new();
    for (i, body) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.push_str(&format!("{} 0 obj\n{body}\nendobj\n", i + 1));
    }
    let xref_at = out.len();
    out.push_str(&format!(
        "xref\n0 {}\n0000000000 65535 f \n",
        objects.len() + 1
    ));
    for off in &offsets {
        out.push_str(&format!("{off:010} 00000 n \n"));
    }
    out.push_str(&format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n",
        objects.len() + 1
    ));
    out.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_ids_are_unique_and_well_formed() {
        let mut seen = std::collections::HashSet::new();
        for d in DEMOS {
            assert!(seen.insert(d.id), "duplicate demo id {}", d.id);
            assert!(!d.accepts.is_empty());
            assert!(d.extract_cmd.contains("{path}"));
            assert!(d.goal_description.contains("No browser"));
            // Guest file name is fixed and safe: never taken from the upload.
            assert!(d
                .guest_file
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.'));
        }
        assert!(
            spec_by_id("pdf-brief").is_some(),
            "original demo id must stay"
        );
        assert!(spec_by_id("nope").is_none());
    }

    #[test]
    fn every_sample_has_an_accepted_extension_and_builds() {
        for d in DEMOS {
            let (name, bytes) = (d.sample)();
            assert!(!bytes.is_empty(), "{} sample empty", d.id);
            assert!(bytes.len() <= d.max_bytes, "{} sample too big", d.id);
            let ext = extension(name);
            assert!(d.accepts.contains(&ext.as_str()), "{} sample .{ext}", d.id);
            // Text samples are what the guest would extract, so the builder must accept them.
            if ext != "pdf" {
                let text = String::from_utf8(bytes).unwrap();
                let out = (d.build)(name, &text).unwrap_or_else(|e| panic!("{}: {e}", d.id));
                assert!(!out.is_empty() && !out[0].body.is_empty());
            }
        }
    }

    #[test]
    fn simple_pdf_has_a_consistent_xref() {
        let pdf = String::from_utf8(simple_pdf(&["Term (initial) \\ test"])).unwrap();
        assert!(pdf.starts_with("%PDF-1.4"));
        let start: usize = pdf
            .rsplit("startxref\n")
            .next()
            .unwrap()
            .lines()
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert!(pdf[start..].starts_with("xref"));
        assert!(pdf.contains("\\(initial\\)") && pdf.contains("\\\\ test"));
    }

    async fn multipart(file: Option<(&str, &[u8])>) -> Multipart {
        use axum::extract::FromRequest;
        let boundary = "XBOUNDARYX";
        let mut body: Vec<u8> = Vec::new();
        if let Some((name, bytes)) = file {
            body.extend_from_slice(
                format!(
                    "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; \
                     filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
                )
                .as_bytes(),
            );
            body.extend_from_slice(bytes);
            body.extend_from_slice(b"\r\n");
        }
        body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
        let req = axum::http::Request::builder()
            .method("POST")
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(axum::body::Body::from(body))
            .unwrap();
        Multipart::from_request(req, &()).await.unwrap()
    }

    async fn run(
        id: &str,
        file: Option<(&str, &[u8])>,
    ) -> Result<(StatusCode, Json<Value>), ApiError> {
        let state = crate::goals::tests::test_state().await;
        demo_run(State(state), Path(id.into()), multipart(file).await).await
    }

    fn status_of(e: ApiError) -> StatusCode {
        axum::response::IntoResponse::into_response(e).status()
    }

    #[tokio::test]
    async fn unknown_demo_is_404_and_bad_uploads_are_400_before_fluxvm() {
        assert_eq!(
            status_of(run("nope", None).await.unwrap_err()),
            StatusCode::NOT_FOUND
        );
        // Wrong extension for the CSV demo.
        assert_eq!(
            status_of(
                run("csv-clean", Some(("evil.exe", b"MZ")))
                    .await
                    .unwrap_err()
            ),
            StatusCode::BAD_REQUEST
        );
        // No extension at all.
        assert_eq!(
            status_of(run("log-triage", Some(("noext", b"x"))).await.unwrap_err()),
            StatusCode::BAD_REQUEST
        );
        // Empty file.
        assert_eq!(
            status_of(run("log-triage", Some(("a.log", b""))).await.unwrap_err()),
            StatusCode::BAD_REQUEST
        );
        // Over the size limit for a text demo.
        let big = vec![b'a'; TEXT_LIMIT + 1];
        assert_eq!(
            status_of(
                run("meeting-actions", Some(("a.txt", &big)))
                    .await
                    .unwrap_err()
            ),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn a_valid_upload_reaches_fluxvm_and_fails_closed_when_it_is_down() {
        // FluxVM at 127.0.0.1:1 is unreachable, so a valid request must stop at
        // the readiness check with 502 rather than doing any guest work.
        let err = run("csv-clean", Some(("data.csv", b"a,b\n1,2\n")))
            .await
            .unwrap_err();
        assert_eq!(status_of(err), StatusCode::BAD_GATEWAY);
        let err = run("pdf-brief", None).await.unwrap_err();
        assert_eq!(status_of(err), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn demo_list_names_every_demo_with_deny_egress_and_no_browser() {
        let Json(v) = demo_list().await;
        let demos = v["demos"].as_array().unwrap();
        assert_eq!(demos.len(), DEMOS.len());
        assert!(demos
            .iter()
            .all(|d| d["egress"] == "deny" && d["browser"] == "none"));
        assert!(demos.iter().any(|d| d["id"] == "pdf-brief"));
    }

    /// The generated sample PDFs must survive the real guest tool. Skipped where
    /// poppler is not installed.
    #[test]
    fn sample_pdfs_round_trip_through_pdftotext_when_available() {
        if std::process::Command::new("pdftotext")
            .arg("-v")
            .output()
            .is_err()
        {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        for (id, needle) in [
            ("contract-clauses", "## Governing law"),
            (
                "security-questionnaire",
                "3 questions found, 1 without an answer",
            ),
        ] {
            let spec = spec_by_id(id).unwrap();
            let (name, bytes) = (spec.sample)();
            let path = dir.path().join(name);
            std::fs::write(&path, bytes).unwrap();
            let out = std::process::Command::new("pdftotext")
                .args(["-layout"])
                .arg(&path)
                .arg("-")
                .output()
                .unwrap();
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            assert!(!text.trim().is_empty(), "{id}: pdftotext extracted nothing");
            let body = (spec.build)(name, &text).unwrap().remove(0).body;
            assert!(
                body.contains(needle),
                "{id}: expected {needle:?} in\n{body}"
            );
        }
    }

    #[test]
    fn extension_is_lowercased_and_missing_is_empty() {
        assert_eq!(extension("A.PDF"), "pdf");
        assert_eq!(extension("noext"), "");
        assert_eq!(extension("a.tar.gz"), "gz");
    }
}
