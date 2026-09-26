// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Personal memory: short notes a person lets their agent keep between conversations (a preference, a fact, a habit).
//!
//! * **Opt-in and per user.** Memory is off until the user turns it on, and nothing is added while it is off.
//! * **On the host, never in a cell.** One file per user under `memory/`. The operator of the host can read these files, like the vault;
//!   they are not encrypted to the user.
//! * **The user decides what is kept.** The user can add, edit, pin, expire and delete entries, and forget everything. An agent may only
//!   *propose* an entry; it stays out of use until the user accepts it.
//! * **Provenance.** Every entry records who wrote it (the user or an agent) and where it came from (thread, message, session). An entry
//!   proposed by a session that had read untrusted content carries `tainted: true`, so it shows in the review list and can be refused.
//! * **No secrets.** Text that looks like a credential (`l7::scan`) is refused.
//!
//! Every route is scoped to the caller: a user token reaches only its own memory. The operator must name `user_id` and every operator
//! access is journaled (`keep.memory.operator_access`, without the text).

use crate::{
    app::ApiError, audit::AuditPhase, authz::Principal, model::validate_user_id,
    store::atomic_write, AppState,
};
use anyhow::{bail, Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension, Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tokio::{
    fs,
    sync::{Mutex, RwLock},
};
use uuid::Uuid;

pub const MAX_TEXT_BYTES: usize = 2000;
pub const MAX_ACTIVE: usize = 200;
pub const MAX_PROPOSED: usize = 50;
const KINDS: [&str; 3] = ["preference", "fact", "note"];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    User,
    Agent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Active,
    /// Proposed by an agent; not used until the user accepts it.
    Proposed,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Source {
    #[serde(default)]
    pub thread_id: Option<Uuid>,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemoryItem {
    pub id: Uuid,
    pub text: String,
    pub kind: String,
    pub origin: Origin,
    pub status: Status,
    #[serde(default)]
    pub source: Source,
    /// Proposed by a session that had read untrusted content.
    #[serde(default)]
    pub tainted: bool,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub expires_at: Option<DateTime<Utc>>,
}

impl MemoryItem {
    fn expired(&self, now: DateTime<Utc>) -> bool {
        self.expires_at.is_some_and(|t| t <= now)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserMemory {
    pub enabled: bool,
    pub items: Vec<MemoryItem>,
}

pub struct MemoryStore {
    root: PathBuf,
    users: RwLock<HashMap<String, UserMemory>>,
    write: Mutex<()>,
}

/// Validated text and kind of an entry.
fn clean(text: &str, kind: &str) -> Result<(String, String)> {
    let text = text.trim();
    if text.is_empty() {
        bail!("the text is empty");
    }
    if text.len() > MAX_TEXT_BYTES {
        bail!("an entry may be at most {MAX_TEXT_BYTES} bytes");
    }
    if text.chars().any(|c| c.is_control() && c != '\n') {
        bail!("the text contains control characters");
    }
    let found = crate::l7::scan(text);
    if !found.is_empty() {
        bail!(
            "the text looks like it contains a secret ({}); memory never stores credentials",
            found.join(", ")
        );
    }
    if !KINDS.contains(&kind) {
        bail!("kind must be one of: {}", KINDS.join(", "));
    }
    Ok((text.to_string(), kind.to_string()))
}

impl MemoryStore {
    pub async fn open(root: impl AsRef<std::path::Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root).await?;
        let mut users = HashMap::new();
        let mut entries = fs::read_dir(&root).await?;
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            let Some(name) = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_suffix(".json"))
            else {
                continue;
            };
            if validate_user_id(name).is_err() {
                continue;
            }
            let raw = fs::read(&path).await?;
            let memory: UserMemory = serde_json::from_slice(&raw)
                .with_context(|| format!("decoding {}", path.display()))?;
            users.insert(name.to_string(), memory);
        }
        Ok(Self {
            root,
            users: RwLock::new(users),
            write: Mutex::new(()),
        })
    }

    async fn save(&self, user: &str, memory: &UserMemory) -> Result<()> {
        atomic_write(
            self.root.join(format!("{user}.json")),
            &serde_json::to_vec_pretty(memory)?,
        )
        .await
    }

    /// The user's memory with expired entries dropped.
    pub async fn get(&self, user: &str) -> UserMemory {
        let now = Utc::now();
        let mut memory = self
            .users
            .read()
            .await
            .get(user)
            .cloned()
            .unwrap_or_default();
        memory.items.retain(|i| !i.expired(now));
        memory
    }

    /// Runs `change` on the user's memory under the write lock and saves the result.
    async fn edit<T>(
        &self,
        user: &str,
        change: impl FnOnce(&mut UserMemory) -> Result<T>,
    ) -> Result<T> {
        validate_user_id(user).map_err(anyhow::Error::msg)?;
        let _guard = self.write.lock().await;
        let mut memory = self
            .users
            .read()
            .await
            .get(user)
            .cloned()
            .unwrap_or_default();
        let now = Utc::now();
        memory.items.retain(|i| !i.expired(now));
        let out = change(&mut memory)?;
        self.save(user, &memory).await?;
        self.users.write().await.insert(user.to_string(), memory);
        Ok(out)
    }

    pub async fn set_enabled(&self, user: &str, enabled: bool) -> Result<()> {
        self.edit(user, |m| {
            m.enabled = enabled;
            Ok(())
        })
        .await
    }

    /// The user adds an entry themselves. Needs memory to be on.
    pub async fn add(
        &self,
        user: &str,
        text: &str,
        kind: &str,
        pinned: bool,
        expires_in_days: Option<u32>,
        source: Source,
    ) -> Result<MemoryItem> {
        let (text, kind) = clean(text, kind)?;
        self.edit(user, |m| {
            if !m.enabled {
                bail!("memory is off; turn it on first");
            }
            if m.items
                .iter()
                .filter(|i| i.status == Status::Active)
                .count()
                >= MAX_ACTIVE
            {
                bail!("memory is full ({MAX_ACTIVE} entries); delete one first");
            }
            let now = Utc::now();
            let item = MemoryItem {
                id: Uuid::new_v4(),
                text,
                kind,
                origin: Origin::User,
                status: Status::Active,
                source,
                tainted: false,
                pinned,
                created_at: now,
                updated_at: now,
                expires_at: expires_in_days
                    .map(|d| now + Duration::days(i64::from(d.clamp(1, 3650)))),
            };
            m.items.push(item.clone());
            Ok(item)
        })
        .await
    }

    /// An agent proposes an entry. It waits for the user; it is never used before they accept it. Needs memory to be on.
    pub async fn propose(
        &self,
        user: &str,
        text: &str,
        kind: &str,
        source: Source,
        tainted: bool,
    ) -> Result<MemoryItem> {
        let (text, kind) = clean(text, kind)?;
        self.edit(user, |m| {
            if !m.enabled {
                bail!("memory is off");
            }
            if m.items
                .iter()
                .filter(|i| i.status == Status::Proposed)
                .count()
                >= MAX_PROPOSED
            {
                bail!("too many proposals are waiting for review");
            }
            let now = Utc::now();
            let item = MemoryItem {
                id: Uuid::new_v4(),
                text,
                kind,
                origin: Origin::Agent,
                status: Status::Proposed,
                source,
                tainted,
                pinned: false,
                created_at: now,
                updated_at: now,
                expires_at: None,
            };
            m.items.push(item.clone());
            Ok(item)
        })
        .await
    }

    /// Edits text, pin or expiry. Editing a proposal keeps it a proposal.
    pub async fn update(
        &self,
        user: &str,
        id: Uuid,
        text: Option<&str>,
        pinned: Option<bool>,
        expires_in_days: Option<Option<u32>>,
    ) -> Result<Option<MemoryItem>> {
        self.edit(user, |m| {
            let Some(item) = m.items.iter_mut().find(|i| i.id == id) else {
                return Ok(None);
            };
            if let Some(t) = text {
                let (t, _) = clean(t, &item.kind)?;
                item.text = t;
            }
            if let Some(p) = pinned {
                item.pinned = p;
            }
            if let Some(e) = expires_in_days {
                item.expires_at =
                    e.map(|d| Utc::now() + Duration::days(i64::from(d.clamp(1, 3650))));
            }
            item.updated_at = Utc::now();
            Ok(Some(item.clone()))
        })
        .await
    }

    /// The user accepts or refuses a proposal. Accepting makes it active; refusing deletes it.
    pub async fn decide(&self, user: &str, id: Uuid, accept: bool) -> Result<Option<MemoryItem>> {
        self.edit(user, |m| {
            let Some(pos) = m
                .items
                .iter()
                .position(|i| i.id == id && i.status == Status::Proposed)
            else {
                return Ok(None);
            };
            if !accept {
                return Ok(Some(m.items.remove(pos)));
            }
            if m.items
                .iter()
                .filter(|i| i.status == Status::Active)
                .count()
                >= MAX_ACTIVE
            {
                bail!("memory is full ({MAX_ACTIVE} entries); delete one first");
            }
            let item = &mut m.items[pos];
            item.status = Status::Active;
            item.updated_at = Utc::now();
            Ok(Some(item.clone()))
        })
        .await
    }

    pub async fn delete(&self, user: &str, id: Uuid) -> Result<bool> {
        self.edit(user, |m| {
            let before = m.items.len();
            m.items.retain(|i| i.id != id);
            Ok(m.items.len() != before)
        })
        .await
    }

    /// Forgets every entry (the on/off choice stays). Returns how many were removed.
    pub async fn forget_all(&self, user: &str) -> Result<usize> {
        self.edit(user, |m| {
            let n = m.items.len();
            m.items.clear();
            Ok(n)
        })
        .await
    }

    /// What may be shown to an agent as context for this user: only when memory is on, only active and unexpired entries, pinned first
    /// then newest, at most `max_items` and `max_bytes`. (Nothing in the runtime calls this yet; it is the one way memory leaves this module.)
    pub async fn context_for(
        &self,
        user: &str,
        max_items: usize,
        max_bytes: usize,
    ) -> Vec<MemoryItem> {
        let memory = self.get(user).await;
        if !memory.enabled {
            return Vec::new();
        }
        let mut items: Vec<MemoryItem> = memory
            .items
            .into_iter()
            .filter(|i| i.status == Status::Active)
            .collect();
        items.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then(b.updated_at.cmp(&a.updated_at))
        });
        let mut used = 0;
        let mut out = Vec::new();
        for i in items {
            if out.len() >= max_items || used + i.text.len() > max_bytes {
                break;
            }
            used += i.text.len();
            out.push(i);
        }
        out
    }
}

// ---- HTTP -----------------------------------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct UserQuery {
    /// The operator names whose memory it means; a user token is always its own and this is ignored.
    #[serde(default)]
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SettingsRequest {
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct AddRequest {
    pub text: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub expires_in_days: Option<u32>,
    #[serde(default)]
    pub source: Source,
}

fn default_kind() -> String {
    "note".into()
}

#[derive(Debug, Deserialize)]
pub struct PatchRequest {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub pinned: Option<bool>,
    /// A number sets the expiry that many days from now; `null` removes it; absent leaves it.
    #[serde(default, deserialize_with = "double_option")]
    pub expires_in_days: Option<Option<u32>>,
}

fn double_option<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<u32>>, D::Error> {
    Ok(Some(Option::<u32>::deserialize(d)?))
}

/// Whose memory this request is about, and (for the operator) a journal entry that it was accessed.
async fn subject(
    state: &AppState,
    principal: &Principal,
    q: &UserQuery,
    what: &str,
) -> Result<String, ApiError> {
    match principal.user() {
        Some(user) => Ok(user.to_string()),
        None => {
            let user = q
                .user_id
                .clone()
                .ok_or_else(|| ApiError::bad_request("user_id is required for the operator"))?;
            validate_user_id(&user).map_err(ApiError::bad_request)?;
            let _ = state
                .store
                .audit
                .append(
                    None,
                    AuditPhase::Performed,
                    "keep.memory.operator_access",
                    None,
                    json!({ "user_id": user, "action": what }),
                )
                .await;
            Ok(user)
        }
    }
}

fn view(memory: &UserMemory) -> Value {
    let (active, proposed): (Vec<_>, Vec<_>) = memory
        .items
        .iter()
        .partition(|i| i.status == Status::Active);
    json!({ "enabled": memory.enabled, "items": active, "proposals": proposed })
}

pub(crate) async fn get_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Query(q): Query<UserQuery>,
) -> Result<Json<Value>, ApiError> {
    let user = subject(&state, &principal, &q, "read").await?;
    Ok(Json(view(&state.store.memory.get(&user).await)))
}

pub(crate) async fn put_settings(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Query(q): Query<UserQuery>,
    Json(req): Json<SettingsRequest>,
) -> Result<Json<Value>, ApiError> {
    let user = subject(&state, &principal, &q, "settings").await?;
    state
        .store
        .memory
        .set_enabled(&user, req.enabled)
        .await
        .map_err(ApiError::bad_request)?;
    Ok(Json(view(&state.store.memory.get(&user).await)))
}

pub(crate) async fn add_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Query(q): Query<UserQuery>,
    Json(req): Json<AddRequest>,
) -> Result<(StatusCode, Json<MemoryItem>), ApiError> {
    let user = subject(&state, &principal, &q, "add").await?;
    let item = state
        .store
        .memory
        .add(
            &user,
            &req.text,
            &req.kind,
            req.pinned,
            req.expires_in_days,
            req.source,
        )
        .await
        .map_err(ApiError::bad_request)?;
    Ok((StatusCode::CREATED, Json(item)))
}

pub(crate) async fn patch_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<Uuid>,
    Query(q): Query<UserQuery>,
    Json(req): Json<PatchRequest>,
) -> Result<Json<MemoryItem>, ApiError> {
    let user = subject(&state, &principal, &q, "edit").await?;
    state
        .store
        .memory
        .update(
            &user,
            id,
            req.text.as_deref(),
            req.pinned,
            req.expires_in_days,
        )
        .await
        .map_err(ApiError::bad_request)?
        .map(Json)
        .ok_or_else(|| ApiError::not_found("memory entry not found"))
}

pub(crate) async fn delete_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<Uuid>,
    Query(q): Query<UserQuery>,
) -> Result<StatusCode, ApiError> {
    let user = subject(&state, &principal, &q, "delete").await?;
    if state
        .store
        .memory
        .delete(&user, id)
        .await
        .map_err(ApiError::internal)?
    {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::not_found("memory entry not found"))
    }
}

pub(crate) async fn forget_all(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Query(q): Query<UserQuery>,
) -> Result<Json<Value>, ApiError> {
    let user = subject(&state, &principal, &q, "forget-all").await?;
    let removed = state
        .store
        .memory
        .forget_all(&user)
        .await
        .map_err(ApiError::internal)?;
    let _ = state
        .store
        .audit
        .append(
            None,
            AuditPhase::Performed,
            "keep.memory.forget_all",
            None,
            json!({ "user_id": user, "entries": removed }),
        )
        .await;
    Ok(Json(json!({ "removed": removed })))
}

async fn decide_route(
    state: Arc<AppState>,
    principal: Principal,
    id: Uuid,
    q: UserQuery,
    accept: bool,
) -> Result<Json<Value>, ApiError> {
    let user = subject(
        &state,
        &principal,
        &q,
        if accept { "accept" } else { "reject" },
    )
    .await?;
    match state
        .store
        .memory
        .decide(&user, id, accept)
        .await
        .map_err(ApiError::bad_request)?
    {
        Some(item) => Ok(Json(json!(item))),
        None => Err(ApiError::not_found("no such proposal")),
    }
}

pub(crate) async fn accept_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<Uuid>,
    Query(q): Query<UserQuery>,
) -> Result<Json<Value>, ApiError> {
    decide_route(state, principal, id, q, true).await
}

pub(crate) async fn reject_memory(
    State(state): State<Arc<AppState>>,
    Extension(principal): Extension<Principal>,
    Path(id): Path<Uuid>,
    Query(q): Query<UserQuery>,
) -> Result<Json<Value>, ApiError> {
    decide_route(state, principal, id, q, false).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn store() -> (MemoryStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (MemoryStore::open(dir.path()).await.unwrap(), dir)
    }

    #[tokio::test]
    async fn memory_is_off_until_the_user_turns_it_on() {
        let (s, _d) = store().await;
        assert!(!s.get("ana").await.enabled);
        assert!(s
            .add(
                "ana",
                "likes tea",
                "preference",
                false,
                None,
                Source::default()
            )
            .await
            .is_err());
        assert!(
            s.propose("ana", "likes tea", "preference", Source::default(), false)
                .await
                .is_err(),
            "an agent cannot propose while it is off"
        );
        s.set_enabled("ana", true).await.unwrap();
        assert!(s
            .add(
                "ana",
                "likes tea",
                "preference",
                false,
                None,
                Source::default()
            )
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn entries_survive_a_restart_and_stay_per_user() {
        let dir = tempfile::tempdir().unwrap();
        let s = MemoryStore::open(dir.path()).await.unwrap();
        s.set_enabled("ana", true).await.unwrap();
        s.set_enabled("ben", true).await.unwrap();
        let a = s
            .add("ana", "vegetarian", "fact", true, None, Source::default())
            .await
            .unwrap();
        s.add("ben", "runs at 6am", "fact", false, None, Source::default())
            .await
            .unwrap();
        drop(s);
        let s = MemoryStore::open(dir.path()).await.unwrap();
        let ana = s.get("ana").await;
        assert_eq!(ana.items.len(), 1);
        assert_eq!(ana.items[0].id, a.id);
        assert!(ana.items[0].pinned && ana.enabled);
        assert_eq!(s.get("ben").await.items[0].text, "runs at 6am");
        assert!(
            !s.delete("ben", a.id).await.unwrap(),
            "another user's id finds nothing"
        );
        assert_eq!(s.get("ana").await.items.len(), 1);
    }

    #[tokio::test]
    async fn text_is_validated_and_credentials_are_refused() {
        let (s, _d) = store().await;
        s.set_enabled("ana", true).await.unwrap();
        assert!(s
            .add("ana", "   ", "note", false, None, Source::default())
            .await
            .is_err());
        assert!(s
            .add(
                "ana",
                &"x".repeat(MAX_TEXT_BYTES + 1),
                "note",
                false,
                None,
                Source::default()
            )
            .await
            .is_err());
        assert!(
            s.add("ana", "fine", "mood", false, None, Source::default())
                .await
                .is_err(),
            "unknown kind"
        );
        assert!(s
            .add("ana", "bell\u{7}", "note", false, None, Source::default())
            .await
            .is_err());
        let err = s
            .add(
                "ana",
                "my token is ghp_abcdefghijklmnopqrstuvwxyz0123456789",
                "note",
                false,
                None,
                Source::default(),
            )
            .await
            .unwrap_err()
            .to_string();
        assert!(
            err.contains("github-token") && !err.contains("ghp_abc"),
            "names the shape, never the text: {err}"
        );
        assert!(s
            .add("bad user", "x", "note", false, None, Source::default())
            .await
            .is_err());
        assert!(
            s.add(
                "ana",
                "line one\nline two",
                "note",
                false,
                None,
                Source::default()
            )
            .await
            .is_ok(),
            "newlines are fine"
        );
    }

    #[tokio::test]
    async fn an_agent_proposal_is_not_used_until_the_user_accepts_it() {
        let (s, _d) = store().await;
        s.set_enabled("ana", true).await.unwrap();
        let p = s
            .propose(
                "ana",
                "prefers window seats",
                "preference",
                Source {
                    session_id: Some(Uuid::new_v4()),
                    ..Default::default()
                },
                true,
            )
            .await
            .unwrap();
        assert_eq!(
            (p.origin, p.status, p.tainted),
            (Origin::Agent, Status::Proposed, true)
        );
        assert!(
            s.context_for("ana", 10, 10_000).await.is_empty(),
            "a proposal is not context"
        );
        let view = view(&s.get("ana").await);
        assert_eq!(view["proposals"].as_array().unwrap().len(), 1);
        assert!(view["items"].as_array().unwrap().is_empty());
        // editing a proposal keeps it a proposal; refusing removes it; accepting activates it
        let edited = s
            .update("ana", p.id, Some("prefers aisle seats"), None, None)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(edited.status, Status::Proposed);
        let accepted = s.decide("ana", p.id, true).await.unwrap().unwrap();
        assert_eq!(
            (accepted.status, accepted.tainted),
            (Status::Active, true),
            "taint stays on the entry"
        );
        assert_eq!(s.context_for("ana", 10, 10_000).await.len(), 1);
        let p2 = s
            .propose("ana", "x", "note", Source::default(), false)
            .await
            .unwrap();
        assert!(s.decide("ana", p2.id, false).await.unwrap().is_some());
        assert!(s.get("ana").await.items.iter().all(|i| i.id != p2.id));
        assert!(
            s.decide("ana", accepted.id, true).await.unwrap().is_none(),
            "only proposals can be decided"
        );
    }

    #[tokio::test]
    async fn context_is_bounded_ordered_and_off_when_memory_is_off() {
        let (s, _d) = store().await;
        s.set_enabled("ana", true).await.unwrap();
        for i in 0..5 {
            s.add(
                "ana",
                &format!("note {i}"),
                "note",
                i == 0,
                None,
                Source::default(),
            )
            .await
            .unwrap();
        }
        let ctx = s.context_for("ana", 3, 10_000).await;
        assert_eq!(ctx.len(), 3);
        assert_eq!(ctx[0].text, "note 0", "pinned first");
        assert_eq!(
            s.context_for("ana", 10, 14).await.len(),
            2,
            "the byte budget cuts it"
        );
        s.set_enabled("ana", false).await.unwrap();
        assert!(
            s.context_for("ana", 10, 10_000).await.is_empty(),
            "turning memory off stops it being used"
        );
        assert_eq!(s.get("ana").await.items.len(), 5, "but does not delete it");
    }

    #[tokio::test]
    async fn expiry_forget_all_and_limits() {
        let (s, _d) = store().await;
        s.set_enabled("ana", true).await.unwrap();
        let e = s
            .add("ana", "temp", "note", false, Some(1), Source::default())
            .await
            .unwrap();
        assert!(e.expires_at.is_some());
        // an entry whose expiry has passed is not shown or used
        s.edit("ana", |m| {
            m.items[0].expires_at = Some(Utc::now() - Duration::hours(1));
            Ok(())
        })
        .await
        .unwrap();
        assert!(s.get("ana").await.items.is_empty());
        for i in 0..MAX_ACTIVE {
            s.add(
                "ana",
                &format!("n{i}"),
                "note",
                false,
                None,
                Source::default(),
            )
            .await
            .unwrap();
        }
        assert!(
            s.add("ana", "one more", "note", false, None, Source::default())
                .await
                .is_err(),
            "the cap"
        );
        assert_eq!(s.forget_all("ana").await.unwrap(), MAX_ACTIVE);
        assert!(
            s.get("ana").await.enabled,
            "forgetting keeps the on/off choice"
        );
    }
}
