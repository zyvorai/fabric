// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use anyhow::{bail, Context, Result};
use base64::Engine;
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone)]
pub struct FluxVm {
    base: Url,
    http: reqwest::Client,
    token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SandboxRecord {
    pub id: Uuid,
    #[serde(default)]
    pub guest_ip: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Serialize)]
struct SandboxCreate<'a> {
    name: String,
    template: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    ttl_seconds: Option<u64>,
    http_proxy_port: u16,
}

impl FluxVm {
    pub fn new(base: &str, token: Option<String>) -> Result<Self> {
        let base = Url::parse(base).with_context(|| format!("invalid FluxVM URL: {base}"))?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self { base, http, token })
    }

    fn url(&self, path: &str) -> Result<Url> {
        self.base
            .join(path)
            .with_context(|| format!("joining FluxVM URL with {path}"))
    }

    fn auth(&self, b: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match &self.token {
            Some(token) => b.bearer_auth(token),
            None => b,
        }
    }

    async fn parse<T: serde::de::DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T> {
        let status = response.status();
        let bytes = response.bytes().await?;
        if !status.is_success() {
            let detail = String::from_utf8_lossy(&bytes);
            bail!("FluxVM returned {status}: {detail}");
        }
        serde_json::from_slice(&bytes).with_context(|| {
            format!(
                "decoding FluxVM response: {}",
                String::from_utf8_lossy(&bytes)
            )
        })
    }

    pub async fn get_sandbox(&self, id: Uuid) -> Result<SandboxRecord> {
        let response = self
            .auth(self.http.get(self.url(&format!("/v1/vms/{id}"))?))
            .send()
            .await?;
        self.parse(response).await
    }

    pub async fn create_sandbox(
        &self,
        name: String,
        template: &str,
        ttl_seconds: Option<u64>,
        runtime_port: u16,
    ) -> Result<SandboxRecord> {
        let response = self
            .auth(self.http.post(self.url("/v1/sandboxes")?))
            .json(&SandboxCreate {
                name,
                template,
                ttl_seconds,
                http_proxy_port: runtime_port,
            })
            .send()
            .await?;
        self.parse(response).await
    }

    pub async fn fs_write(&self, id: Uuid, path: &str, bytes: &[u8], mode: u32) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v1/sandboxes/{id}/fs/write"))?),
            )
            .json(&json!({
                "path": path,
                "content_base64": base64::engine::general_purpose::STANDARD.encode(bytes),
                "mode": mode,
            }))
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
    }

    pub async fn process(
        &self,
        id: Uuid,
        command: &str,
        timeout_seconds: Option<u64>,
    ) -> Result<Value> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v1/sandboxes/{id}/process"))?),
            )
            .json(&json!({"command": command, "timeout_seconds": timeout_seconds}))
            .send()
            .await?;
        self.parse(response).await
    }

    pub async fn guest_request(
        &self,
        id: Uuid,
        port: u16,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<Value> {
        let path = path.trim_start_matches('/');
        let url = self.url(&format!("/v1/sandboxes/{id}/http/{port}/{path}"))?;
        let mut req = self.auth(self.http.request(method, url));
        if let Some(body) = body {
            req = req.json(body);
        }
        let response = req.send().await?;
        self.parse(response).await
    }

    pub async fn pause(&self, id: Uuid) -> Result<()> {
        let response = self
            .auth(self.http.post(self.url(&format!("/v1/vms/{id}/pause"))?))
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
    }

    pub async fn resume(&self, id: Uuid) -> Result<()> {
        let response = self
            .auth(self.http.post(self.url(&format!("/v1/vms/{id}/resume"))?))
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
    }

    pub async fn snapshot(&self, id: Uuid, path: &str) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v1/sandboxes/{id}/snapshot"))?),
            )
            .json(&json!({"path": path}))
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
    }

    pub async fn delete(&self, id: Uuid) -> Result<()> {
        let response = self
            .auth(self.http.delete(self.url(&format!("/v1/vms/{id}"))?))
            .send()
            .await?;
        let status = response.status();
        if status.is_success() || status == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }
        bail!("FluxVM delete failed: {status}")
    }

    pub async fn default_gateway(&self, id: Uuid) -> Result<String> {
        let value = self
            .process(
                id,
                "ip route show default | awk '{print $3; exit}'",
                Some(5),
            )
            .await?;
        let stdout = value
            .get("stdout")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .get("data")
                    .and_then(|v| v.get("stdout"))
                    .and_then(Value::as_str)
            })
            .unwrap_or_default()
            .trim()
            .to_string();
        if stdout.is_empty() {
            bail!("sandbox did not report a default gateway; use tap+netns or set ZYVOR_AGENT_EGRESS_ADVERTISE_HOST")
        }
        Ok(stdout)
    }
}
