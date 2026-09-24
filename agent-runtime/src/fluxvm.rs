// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::model::Resources;
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
    /// Present when the create request asked for `confidential`. An older FluxVM
    /// ignores the request and omits this.
    #[serde(default)]
    pub confidential: Option<crate::model::ConfidentialStatus>,
}

#[derive(Debug, Serialize)]
struct SandboxCreate<'a> {
    name: String,
    template: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    ttl_seconds: Option<u64>,
    http_proxy_port: u16,
    #[serde(skip_serializing_if = "<[SandboxVolume]>::is_empty")]
    volumes: &'a [SandboxVolume],
    #[serde(skip_serializing_if = "Option::is_none")]
    vcpus: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    memory_mib: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    confidential: Option<&'static str>,
}

/// A FluxVM sandbox volume (`POST /v1/sandboxes` `volumes`).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SandboxVolume {
    pub name: String,
    pub guest_path: String,
}

/// What a sandbox gets beyond its template: volumes, size, confidential launch.
#[derive(Debug, Default)]
pub struct SandboxOptions<'a> {
    pub volumes: &'a [SandboxVolume],
    pub resources: Option<Resources>,
    pub confidential: crate::model::Confidential,
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
        options: &SandboxOptions<'_>,
    ) -> Result<SandboxRecord> {
        let response = self
            .auth(self.http.post(self.url("/v1/sandboxes")?))
            .json(&SandboxCreate {
                name,
                template,
                ttl_seconds,
                http_proxy_port: runtime_port,
                volumes: options.volumes,
                vcpus: options.resources.map(|r| r.vcpus),
                memory_mib: options.resources.map(|r| r.memory_mib),
                confidential: (!options.confidential.is_off())
                    .then_some(options.confidential.as_str()),
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

    /// Replace the sandbox's L4 network policy (`POST /v1/vms/{id}/network/policy`).
    pub async fn set_network_policy(&self, id: Uuid, policy: &Value) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/network/policy"))?),
            )
            .json(policy)
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn set_network_policy_posts_the_policy_to_the_vm() {
        let seen = std::sync::Arc::new(std::sync::Mutex::new(None));
        let sink = seen.clone();
        let app = axum::Router::new().route(
            "/v1/vms/{id}/network/policy",
            axum::routing::post(
                move |axum::extract::Path(id): axum::extract::Path<String>,
                      axum::Json(body): axum::Json<Value>| {
                    let sink = sink.clone();
                    async move {
                        *sink.lock().unwrap() = Some((id, body.clone()));
                        axum::Json(body)
                    }
                },
            ),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = FluxVm::new(&format!("http://{addr}"), None).unwrap();
        let id = Uuid::new_v4();
        let policy = crate::confine::strict_policy("10.0.2.1".parse().unwrap(), 18082, None);
        client.set_network_policy(id, &policy).await.unwrap();
        let (seen_id, seen_body) = seen.lock().unwrap().clone().unwrap();
        assert_eq!(seen_id, id.to_string());
        assert_eq!(seen_body, policy);
    }

    #[tokio::test]
    async fn set_network_policy_surfaces_a_fluxvm_error() {
        let app = axum::Router::new().route(
            "/v1/vms/{id}/network/policy",
            axum::routing::post(|| async {
                (
                    axum::http::StatusCode::BAD_REQUEST,
                    "invalid eBPF allow CIDR",
                )
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = FluxVm::new(&format!("http://{addr}"), None).unwrap();
        let error = client
            .set_network_policy(Uuid::new_v4(), &json!({}))
            .await
            .unwrap_err()
            .to_string();
        assert!(
            error.contains("400") && error.contains("invalid eBPF allow CIDR"),
            "{error}"
        );
    }

    #[test]
    fn sandbox_create_omits_volumes_unless_present() {
        let none = serde_json::to_value(SandboxCreate {
            name: "n".into(),
            template: "t",
            ttl_seconds: None,
            http_proxy_port: 8080,
            volumes: &[],
            vcpus: None,
            memory_mib: None,
            confidential: None,
        })
        .unwrap();
        assert!(none.get("volumes").is_none());
        assert!(none.get("vcpus").is_none() && none.get("memory_mib").is_none());
        assert!(none.get("confidential").is_none());

        let volumes = [SandboxVolume {
            name: "home".into(),
            guest_path: "/home/agent".into(),
        }];
        let some = serde_json::to_value(SandboxCreate {
            name: "n".into(),
            template: "t",
            ttl_seconds: None,
            http_proxy_port: 8080,
            volumes: &volumes,
            vcpus: Some(2),
            memory_mib: Some(7900),
            confidential: Some("auto"),
        })
        .unwrap();
        assert_eq!(some["volumes"][0]["name"], "home");
        assert_eq!(some["volumes"][0]["guest_path"], "/home/agent");
        assert_eq!(
            (some["vcpus"].as_u64(), some["memory_mib"].as_u64()),
            (Some(2), Some(7900))
        );
    }
}
