// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Small MCP server over the agent HTTP API.
//!
//! Cursor or Claude Code can list agents, list executions, and chat with an
//! agent. Chat creates a session or steers an existing one. It does not
//! grant credentials or open egress beyond that agent's manifest.

use crate::{
    app::{self, ApiError},
    model::{CreateSessionRequest, SteerRequest},
    AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use std::sync::Arc;
use uuid::Uuid;

pub async fn handle(
    State(state): State<Arc<AppState>>,
    Json(request): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    if request.get("jsonrpc") != Some(&Value::String("2.0".into())) {
        return rpc_error(id, -32600, "invalid JSON-RPC request");
    }
    if method.starts_with("notifications/") {
        return (StatusCode::ACCEPTED, Json(Value::Null));
    }
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "fabric-agent-runtime", "version": env!("CARGO_PKG_VERSION") }
        })),
        "tools/list" => Ok(json!({"tools": tools()})),
        "tools/call" => call_tool(&state, &params).await,
        "ping" => Ok(json!({})),
        _ => Err((-32601, "method not found".to_string())),
    };
    match result {
        Ok(result) => (
            StatusCode::OK,
            Json(json!({"jsonrpc": "2.0", "id": id, "result": result})),
        ),
        Err((code, message)) => rpc_error(id, code, &message),
    }
}

fn rpc_error(id: Value, code: i32, message: &str) -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message }
        })),
    )
}

fn tools() -> Vec<Value> {
    vec![
        tool(
            "list_agents",
            "List deployed Fabric agents.",
            json!({"type": "object", "properties": {}}),
        ),
        tool(
            "list_executions",
            "List agent sessions. Pass session_id to read one execution.",
            json!({
                "type": "object",
                "properties": {
                    "agent": { "type": "string" },
                    "session_id": { "type": "string" }
                }
            }),
        ),
        tool(
            "chat_with_agent",
            "Start a session with an agent, or steer an existing session.",
            json!({
                "type": "object",
                "properties": {
                    "agent": { "type": "string" },
                    "message": {},
                    "session_id": { "type": "string" }
                },
                "required": ["message"]
            }),
        ),
    ]
}

fn tool(name: &str, description: &str, schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": schema
    })
}

async fn call_tool(state: &Arc<AppState>, params: &Value) -> Result<Value, (i32, String)> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((-32602, "tools/call requires name".to_string()))?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let value = match name {
        "list_agents" => json!({"items": state.store.list_agents().await}),
        "list_executions" => list_executions(state, &args).await?,
        "chat_with_agent" => chat(state, &args).await?,
        _ => return Err((-32602, format!("unknown tool {name}"))),
    };
    Ok(json!({
        "content": [{ "type": "text", "text": value.to_string() }],
        "isError": false
    }))
}

async fn list_executions(state: &AppState, args: &Value) -> Result<Value, (i32, String)> {
    if let Some(raw) = args.get("session_id").and_then(Value::as_str) {
        let id = Uuid::parse_str(raw).map_err(|_| (-32602, "session_id is not a uuid".into()))?;
        let session = state
            .store
            .get_session(id)
            .await
            .ok_or((-32004, "session not found".to_string()))?;
        return Ok(json!(crate::model::SessionView::from(session)));
    }
    let agent = args.get("agent").and_then(Value::as_str);
    let items: Vec<_> = state
        .store
        .list_sessions()
        .await
        .into_iter()
        .filter(|session| agent.is_none_or(|name| session.agent == name))
        .map(crate::model::SessionView::from)
        .collect();
    Ok(json!({"items": items}))
}

async fn chat(state: &Arc<AppState>, args: &Value) -> Result<Value, (i32, String)> {
    let message = args
        .get("message")
        .cloned()
        .ok_or((-32602, "message is required".to_string()))?;
    if let Some(raw) = args.get("session_id").and_then(Value::as_str) {
        let id = Uuid::parse_str(raw).map_err(|_| (-32602, "session_id is not a uuid".into()))?;
        let steered = app::steer_session(
            State(state.clone()),
            Path(id),
            Json(SteerRequest { message }),
        )
        .await
        .map_err(api_error)?;
        return Ok(json!({"steered": true, "session_id": id, "result": steered.1 .0}));
    }
    let agent = args.get("agent").and_then(Value::as_str).ok_or((
        -32602,
        "agent is required when session_id is omitted".to_string(),
    ))?;
    let created = app::create_session(
        State(state.clone()),
        Json(CreateSessionRequest {
            agent: agent.to_string(),
            input: json!({"message": message}),
            ttl_seconds: None,
            request_id: None,
            start_policy: Default::default(),
            parent_session_id: None,
            user_id: None,
        }),
    )
    .await
    .map_err(api_error)?;
    Ok(json!({"session": created.1 .0}))
}

fn api_error(error: ApiError) -> (i32, String) {
    (-32000, error.message().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_list_chat_and_executions() {
        let listed = tools();
        let names: Vec<_> = listed
            .iter()
            .filter_map(|tool| tool.get("name").and_then(Value::as_str))
            .collect();
        assert_eq!(
            names,
            vec!["list_agents", "list_executions", "chat_with_agent"]
        );
    }
}
