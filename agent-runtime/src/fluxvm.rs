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

/// FluxVM `GET /v1/security/capabilities` (Phase 6 HostCapabilities subset).
#[derive(Debug, Clone, Deserialize, Default, PartialEq, Eq)]
pub struct HostSecurityCapabilities {
    #[serde(default)]
    pub snp_present: bool,
    #[serde(default)]
    pub tdx_present: bool,
    #[serde(default)]
    pub snp_launch_verified: bool,
    #[serde(default)]
    pub tdx_launch_verified: bool,
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
    /// FluxVM Phase 6 profile (`measured`, …). Older FluxVM ignores unknown fields.
    #[serde(skip_serializing_if = "Option::is_none")]
    security_profile: Option<&'a str>,
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
    /// Phase 6 security profile name (e.g. `measured`). Evidence class stays
    /// `software-test` until Keep 0.2 + attested hardware.
    pub security_profile: Option<&'a str>,
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

    /// Host SNP/TDX capability + launch-verified flags (fail-closed when unreachable).
    pub async fn security_capabilities(&self) -> Result<HostSecurityCapabilities> {
        let response = self
            .auth(self.http.get(self.url("/v1/security/capabilities")?))
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
                security_profile: options.security_profile,
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

    /// Host-channel write refused when the session's confidential launch is active.
    pub async fn fs_write_for_session(
        &self,
        confidential: Option<&crate::model::ConfidentialStatus>,
        id: Uuid,
        path: &str,
        bytes: &[u8],
        mode: u32,
    ) -> Result<()> {
        if let Some(msg) = crate::attestation::host_channel_forbidden(confidential) {
            anyhow::bail!("{msg}");
        }
        self.fs_write(id, path, bytes, mode).await
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

    /// Host-channel exec refused when the session's confidential launch is active.
    pub async fn process_for_session(
        &self,
        confidential: Option<&crate::model::ConfidentialStatus>,
        id: Uuid,
        command: &str,
        timeout_seconds: Option<u64>,
    ) -> Result<Value> {
        if let Some(msg) = crate::attestation::host_channel_forbidden(confidential) {
            anyhow::bail!("{msg}");
        }
        self.process(id, command, timeout_seconds).await
    }

    /// Light vsock health-check (no exec). Prefer this over `process` while waiting
    /// for a cold guest boot — exec can hang longer than ping on some images.
    pub async fn agent_ping(&self, id: Uuid) -> Result<()> {
        let response = self
            .auth(
                self.http
                    .post(self.url(&format!("/v1/vms/{id}/agent/ping"))?),
            )
            .json(&json!({}))
            .send()
            .await?;
        let _: Value = self.parse(response).await?;
        Ok(())
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

    /// Open a FluxVM-bridged WebSocket to a guest TCP WebSocket path (CDP, etc.).
    pub async fn guest_ws(
        &self,
        id: Uuid,
        port: u16,
        path: &str,
    ) -> Result<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    > {
        use tokio_tungstenite::{
            connect_async,
            tungstenite::{client::IntoClientRequest, http::header::AUTHORIZATION},
        };

        let path = path.trim_start_matches('/');
        let mut ws_base = self.base.clone();
        let scheme = if self.base.scheme() == "https" {
            "wss"
        } else {
            "ws"
        };
        ws_base
            .set_scheme(scheme)
            .map_err(|()| anyhow::anyhow!("setting ws scheme"))?;
        let url = ws_base
            .join(&format!("/v1/sandboxes/{id}/ws/{port}/{path}"))
            .with_context(|| format!("joining FluxVM WS URL with {path}"))?;
        let mut request = url
            .as_str()
            .into_client_request()
            .context("building FluxVM WS request")?;
        if let Some(token) = &self.token {
            request.headers_mut().insert(
                AUTHORIZATION,
                format!("Bearer {token}")
                    .parse()
                    .context("FluxVM bearer header")?,
            );
        }
        let (stream, _) = connect_async(request)
            .await
            .context("connecting FluxVM sandbox WS bridge")?;
        Ok(stream)
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
            security_profile: None,
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
            security_profile: Some("measured"),
        })
        .unwrap();
        assert_eq!(some["volumes"][0]["name"], "home");
        assert_eq!(some["volumes"][0]["guest_path"], "/home/agent");
        assert_eq!(
            (some["vcpus"].as_u64(), some["memory_mib"].as_u64()),
            (Some(2), Some(7900))
        );
        assert_eq!(some["security_profile"], "measured");
    }

    #[test]
    fn security_capabilities_parse_launch_flags() {
        let caps: HostSecurityCapabilities = serde_json::from_value(json!({
            "qemu": true,
            "secure_boot_ready": false,
            "swtpm": false,
            "signed_catalog_configured": false,
            "snp_present": true,
            "tdx_present": false,
            "snp_launch_verified": true,
            "tdx_launch_verified": false
        }))
        .unwrap();
        assert!(caps.snp_present);
        assert!(caps.snp_launch_verified);
        assert!(!caps.tdx_launch_verified);
        let empty: HostSecurityCapabilities = serde_json::from_value(json!({})).unwrap();
        assert!(!empty.snp_launch_verified && !empty.tdx_launch_verified);
    }
}
