// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

use crate::model::{
    AgentRecord, DeployAgentRequest, SessionEvent, SessionRecord, SessionStatus,
};
use anyhow::{bail, Context, Result};
use base64::Engine;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tokio::{
    fs::{self, OpenOptions},
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    sync::RwLock,
};
use uuid::Uuid;

pub struct Store {
    root: PathBuf,
    agents: RwLock<HashMap<String, AgentRecord>>,
    sessions: RwLock<HashMap<Uuid, SessionRecord>>,
}

impl Store {
    pub async fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("agents")).await?;
        fs::create_dir_all(root.join("sessions")).await?;

        let store = Self {
            root,
            agents: RwLock::new(HashMap::new()),
            sessions: RwLock::new(HashMap::new()),
        };
        store.load().await?;
        Ok(store)
    }

    async fn load(&self) -> Result<()> {
        let mut agents = HashMap::new();
        let mut rd = fs::read_dir(self.root.join("agents")).await?;
        while let Some(entry) = rd.next_entry().await? {
            if !entry.file_type().await?.is_dir() {
                continue;
            }
            let current = entry.path().join("current.json");
            if let Ok(raw) = fs::read(&current).await {
                if let Ok(record) = serde_json::from_slice::<AgentRecord>(&raw) {
                    agents.insert(record.name.clone(), record);
                }
            }
        }
        *self.agents.write().await = agents;

        let mut sessions = HashMap::new();
        let mut rd = fs::read_dir(self.root.join("sessions")).await?;
        while let Some(entry) = rd.next_entry().await? {
            if !entry.file_type().await?.is_dir() {
                continue;
            }
            let path = entry.path().join("session.json");
            if let Ok(raw) = fs::read(&path).await {
                if let Ok(record) = serde_json::from_slice::<SessionRecord>(&raw) {
                    sessions.insert(record.id, record);
                }
            }
        }
        *self.sessions.write().await = sessions;
        Ok(())
    }

    pub async fn deploy_agent(&self, req: DeployAgentRequest) -> Result<AgentRecord> {
        validate_name(&req.name)?;
        let bundle = base64::engine::general_purpose::STANDARD
            .decode(req.bundle_base64.as_bytes())
            .context("bundle_base64 is not valid base64")?;
        if bundle.is_empty() {
            bail!("agent bundle is empty");
        }
        if bundle.len() > 16 * 1024 * 1024 {
            bail!("agent bundle exceeds 16 MiB");
        }

        // The deployment version covers both executable bytes and policy. A manifest-only
        // change (for example granting a new credential) must never mutate an existing
        // session's immutable security contract.
        let mut hasher = Sha256::new();
        hasher.update(&bundle);
        hasher.update([0]);
        hasher.update(serde_json::to_vec(&req.manifest)?);
        let digest = hex::encode(hasher.finalize());
        let version = digest[..12].to_string();
        let record = AgentRecord {
            name: req.name.clone(),
            version: version.clone(),
            digest_sha256: digest,
            manifest: req.manifest,
            created_at: Utc::now(),
        };

        let dir = self.root.join("agents").join(&req.name).join(&version);
        fs::create_dir_all(&dir).await?;
        atomic_write(&dir.join("bundle.mjs"), &bundle).await?;
        atomic_write(
            &dir.join("record.json"),
            &serde_json::to_vec_pretty(&record)?,
        )
        .await?;
        atomic_write(
            &self.root.join("agents").join(&req.name).join("current.json"),
            &serde_json::to_vec_pretty(&record)?,
        )
        .await?;

        self.agents
            .write()
            .await
            .insert(record.name.clone(), record.clone());
        Ok(record)
    }

    pub async fn list_agents(&self) -> Vec<AgentRecord> {
        let mut out: Vec<_> = self.agents.read().await.values().cloned().collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    pub async fn get_agent(&self, name: &str) -> Option<AgentRecord> {
        self.agents.read().await.get(name).cloned()
    }

    /// Load one immutable historical deployment version. Sessions pin this
    /// record so a later deploy cannot change their egress or runtime policy.
    pub async fn get_agent_version(&self, name: &str, version: &str) -> Result<AgentRecord> {
        let path = self
            .root
            .join("agents")
            .join(name)
            .join(version)
            .join("record.json");
        let raw = fs::read(&path)
            .await
            .with_context(|| format!("reading agent record {}", path.display()))?;
        serde_json::from_slice(&raw).context("decoding immutable agent record")
    }

    pub async fn agent_bundle(&self, name: &str, version: &str) -> Result<Vec<u8>> {
        let path = self
            .root
            .join("agents")
            .join(name)
            .join(version)
            .join("bundle.mjs");
        fs::read(&path)
            .await
            .with_context(|| format!("reading agent bundle {}", path.display()))
    }

    pub async fn save_session(&self, record: SessionRecord) -> Result<()> {
        let dir = self.root.join("sessions").join(record.id.to_string());
        fs::create_dir_all(&dir).await?;
        atomic_write(
            &dir.join("session.json"),
            &serde_json::to_vec_pretty(&record)?,
        )
        .await?;
        self.sessions.write().await.insert(record.id, record);
        Ok(())
    }

    pub async fn get_session(&self, id: Uuid) -> Option<SessionRecord> {
        self.sessions.read().await.get(&id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<SessionRecord> {
        let mut out: Vec<_> = self.sessions.read().await.values().cloned().collect();
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        out
    }

    pub async fn update_session<F>(&self, id: Uuid, f: F) -> Result<SessionRecord>
    where
        F: FnOnce(&mut SessionRecord),
    {
        let updated = {
            let mut sessions = self.sessions.write().await;
            let record = sessions
                .get_mut(&id)
                .with_context(|| format!("session {id} not found"))?;
            f(record);
            record.updated_at = Utc::now();
            record.clone()
        };
        self.persist_session(&updated).await?;
        Ok(updated)
    }

    async fn persist_session(&self, record: &SessionRecord) -> Result<()> {
        let path = self
            .root
            .join("sessions")
            .join(record.id.to_string())
            .join("session.json");
        atomic_write(&path, &serde_json::to_vec_pretty(record)?).await
    }

    pub async fn append_event(
        &self,
        id: Uuid,
        kind: impl Into<String>,
        data: serde_json::Value,
    ) -> Result<SessionEvent> {
        let event = {
            let mut sessions = self.sessions.write().await;
            let record = sessions
                .get_mut(&id)
                .with_context(|| format!("session {id} not found"))?;
            record.last_event_seq += 1;
            record.updated_at = Utc::now();
            SessionEvent {
                session_id: id,
                seq: record.last_event_seq,
                kind: kind.into(),
                data,
                timestamp: Utc::now(),
            }
        };

        let dir = self.root.join("sessions").join(id.to_string());
        fs::create_dir_all(&dir).await?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("events.jsonl"))
            .await?;
        file.write_all(&serde_json::to_vec(&event)?).await?;
        file.write_all(b"\n").await?;
        file.flush().await?;

        if let Some(record) = self.get_session(id).await {
            self.persist_session(&record).await?;
        }
        Ok(event)
    }

    pub async fn events_after(&self, id: Uuid, after: u64) -> Result<Vec<SessionEvent>> {
        let path = self
            .root
            .join("sessions")
            .join(id.to_string())
            .join("events.jsonl");
        let file = match fs::File::open(path).await {
            Ok(v) => v,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };
        let mut lines = BufReader::new(file).lines();
        let mut out = Vec::new();
        while let Some(line) = lines.next_line().await? {
            if line.trim().is_empty() {
                continue;
            }
            let event: SessionEvent = serde_json::from_str(&line)?;
            if event.seq > after {
                out.push(event);
            }
        }
        Ok(out)
    }

    pub async fn active_sessions(&self) -> Vec<SessionRecord> {
        self.sessions
            .read()
            .await
            .values()
            .filter(|s| !s.status.is_terminal() && s.status != SessionStatus::Hibernated)
            .cloned()
            .collect()
    }
}

async fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    let tmp = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    fs::write(&tmp, bytes).await?;
    fs::rename(&tmp, path).await?;
    Ok(())
}

pub fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 80 {
        bail!("name must be 1..=80 characters");
    }
    if !name
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
    {
        bail!("name may contain only ASCII letters, digits, '.', '_' and '-'");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AgentManifest, DeployAgentRequest, SessionRecord};
    use serde_json::json;

    fn test_root() -> PathBuf {
        std::env::temp_dir().join(format!("zyvor-agent-test-{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn deploy_and_reload_agent() {
        let root = test_root();
        let store = Store::open(&root).await.unwrap();
        let request = DeployAgentRequest {
            name: "research".into(),
            bundle_base64: base64::engine::general_purpose::STANDARD.encode("export default () => 1"),
            manifest: AgentManifest {
                template: "node22".into(),
                credentials: vec!["openai".into()],
                egress_allow_hosts: vec!["api.openai.com".into()],
                allow_private_networks: false,
                runtime_port: 8080,
                ttl_seconds: None,
            },
        };
        let record = store.deploy_agent(request).await.unwrap();
        assert_eq!(record.name, "research");
        drop(store);

        let reloaded = Store::open(&root).await.unwrap();
        assert_eq!(reloaded.get_agent("research").await.unwrap().version, record.version);
        let _ = fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn manifest_change_creates_new_immutable_version() {
        let root = test_root();
        let store = Store::open(&root).await.unwrap();
        let bundle = base64::engine::general_purpose::STANDARD.encode("export default () => 1");
        let one = store.deploy_agent(DeployAgentRequest {
            name: "research".into(),
            bundle_base64: bundle.clone(),
            manifest: AgentManifest {
                template: "node22".into(), credentials: vec![],
                egress_allow_hosts: vec!["api.openai.com".into()], allow_private_networks: false, runtime_port: 8080, ttl_seconds: None,
            },
        }).await.unwrap();
        let two = store.deploy_agent(DeployAgentRequest {
            name: "research".into(),
            bundle_base64: bundle,
            manifest: AgentManifest {
                template: "node22".into(), credentials: vec![],
                egress_allow_hosts: vec!["api.anthropic.com".into()], allow_private_networks: false, runtime_port: 8080, ttl_seconds: None,
            },
        }).await.unwrap();
        assert_ne!(one.version, two.version);
        assert_eq!(store.get_agent_version("research", &one.version).await.unwrap().manifest.egress_allow_hosts[0], "api.openai.com");
        let _ = fs::remove_dir_all(root).await;
    }

    #[tokio::test]
    async fn events_are_monotonic_and_durable() {
        let root = test_root();
        let store = Store::open(&root).await.unwrap();
        let id = Uuid::new_v4();
        let now = Utc::now();
        store
            .save_session(SessionRecord {
                id,
                agent: "a".into(),
                agent_version: "v".into(),
                sandbox_id: Uuid::new_v4(),
                status: SessionStatus::Running,
                input: json!({}),
                created_at: now,
                updated_at: now,
                last_event_seq: 0,
                guest_event_cursor: 0,
                capability_token: "cap".into(),
                error: None,
            })
            .await
            .unwrap();
        assert_eq!(store.append_event(id, "one", json!(1)).await.unwrap().seq, 1);
        assert_eq!(store.append_event(id, "two", json!(2)).await.unwrap().seq, 2);
        let events = store.events_after(id, 1).await.unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "two");
        let _ = fs::remove_dir_all(root).await;
    }
}
