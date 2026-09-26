// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Retention: an hourly sweep that forgets what the operator has said not to keep. Both settings are off by default, so nothing
//! disappears unless it was asked for:
//!
//! * `ZYVOR_AGENT_THREAD_RETENTION_DAYS`: conversation threads (and their messages) idle for that many days are forgotten. A thread whose
//!   session is still running is never forgotten.
//! * `ZYVOR_AGENT_EVENT_RETENTION_DAYS`: the event log of a session that ended that many days ago is deleted. The session record, its
//!   artifacts and approvals stay.
//!
//! Each sweep that removes something is journaled with counts only (`keep.retention.sweep`), never with names or text.

use crate::{audit::AuditPhase, AppState};
use chrono::{DateTime, Duration as Days, Utc};
use serde_json::json;
use std::{sync::Arc, time::Duration};

/// How often the sweep runs.
const SWEEP_EVERY: Duration = Duration::from_secs(3600);

/// What one sweep removed.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Swept {
    pub threads: usize,
    pub messages: u64,
    pub event_logs: usize,
}

/// One sweep as of `now`, using the configured periods. Public so a test (or an operator tool) can run it directly.
pub async fn sweep(state: &AppState, now: DateTime<Utc>) -> anyhow::Result<Swept> {
    let mut swept = Swept::default();
    if let Some(days) = state.config.thread_retention_days {
        let cutoff = now - Days::days(days as i64);
        // decide which threads are protected before the store deletes anything: those whose session has not ended
        let mut protected = std::collections::HashSet::new();
        for t in state.store.threads.list(None).await {
            if let Some(sid) = t.session_id {
                if state
                    .store
                    .get_session(sid)
                    .await
                    .is_some_and(|s| !s.status.is_terminal())
                {
                    protected.insert(t.id);
                }
            }
        }
        for t in state
            .store
            .threads
            .purge_idle(cutoff, |t| protected.contains(&t.id))
            .await?
        {
            swept.threads += 1;
            swept.messages += t.message_count;
        }
    }
    if let Some(days) = state.config.event_retention_days {
        swept.event_logs = state
            .store
            .purge_ended_session_events(now - Days::days(days as i64))
            .await?;
    }
    if swept != Swept::default() {
        let _ = state
            .store
            .audit
            .append(
                None,
                AuditPhase::Performed,
                "keep.retention.sweep",
                None,
                json!({ "threads": swept.threads, "messages": swept.messages, "event_logs": swept.event_logs }),
            )
            .await;
    }
    Ok(swept)
}

pub async fn retention_loop(state: Arc<AppState>) {
    if state.config.thread_retention_days.is_none() && state.config.event_retention_days.is_none() {
        return;
    }
    tracing::info!(
        thread_days = ?state.config.thread_retention_days,
        event_days = ?state.config.event_retention_days,
        "retention sweep enabled"
    );
    tokio::time::sleep(Duration::from_secs(60)).await;
    loop {
        match sweep(&state, Utc::now()).await {
            Ok(s) if s != Swept::default() => tracing::info!(?s, "retention sweep removed data"),
            Ok(_) => {}
            Err(error) => tracing::warn!(%error, "retention sweep failed"),
        }
        tokio::time::sleep(SWEEP_EVERY).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::parse_days, egress::ask_tests::state_and_session_cfg, model::SessionStatus,
        threads::Role,
    };

    #[test]
    fn retention_days_are_off_unless_set_and_bounded() {
        assert_eq!(parse_days(None).unwrap(), None);
        assert_eq!(parse_days(Some("0")).unwrap(), None, "0 means keep");
        assert_eq!(parse_days(Some(" 30 ")).unwrap(), Some(30));
        assert_eq!(parse_days(Some("3650")).unwrap(), Some(3650));
        for bad in ["3651", "-1", "x", "1.5", ""] {
            assert!(parse_days(Some(bad)).is_err(), "{bad}");
        }
    }

    #[tokio::test]
    async fn threads_idle_past_the_period_are_forgotten_but_not_while_their_session_runs() {
        let (state, base) = state_and_session_cfg(|c| c.thread_retention_days = Some(30)).await;
        let threads = &state.store.threads;
        let old = threads
            .get_or_create("ana", "chat", "old", Some("c-old"))
            .await
            .unwrap();
        threads
            .append(old.id, Role::User, "old talk", None, None)
            .await
            .unwrap();
        let running = threads
            .get_or_create("ana", "chat", "running", Some("c-run"))
            .await
            .unwrap();
        threads
            .append(running.id, Role::User, "still going", None, None)
            .await
            .unwrap();
        let mut live = base.clone();
        live.id = uuid::Uuid::new_v4();
        live.status = SessionStatus::Running;
        state.store.save_session(live.clone()).await.unwrap();
        threads
            .set_session(running.id, Some(live.id))
            .await
            .unwrap();

        // now: nothing is 30 days idle yet
        assert_eq!(sweep(&state, Utc::now()).await.unwrap(), Swept::default());
        assert_eq!(threads.list(None).await.len(), 2);

        // 31 days later both are idle, but the one with a running session stays
        let later = Utc::now() + Days::days(31);
        let swept = sweep(&state, later).await.unwrap();
        assert_eq!(
            swept,
            Swept {
                threads: 1,
                messages: 1,
                event_logs: 0
            }
        );
        assert!(threads.get(old.id).await.is_none());
        assert!(threads.get(running.id).await.is_some());

        // once that session ended, the thread goes on the next sweep
        state
            .store
            .update_session(live.id, |s| s.status = SessionStatus::Completed)
            .await
            .unwrap();
        assert_eq!(sweep(&state, later).await.unwrap().threads, 1);
        assert!(threads.list(None).await.is_empty());
        assert_eq!(
            sweep(&state, later).await.unwrap(),
            Swept::default(),
            "repeating removes nothing more"
        );
    }

    #[tokio::test]
    async fn the_journal_gets_counts_and_never_text() {
        let (state, _) = state_and_session_cfg(|c| c.thread_retention_days = Some(1)).await;
        let t = state
            .store
            .threads
            .get_or_create("ana", "chat", "secret title", None)
            .await
            .unwrap();
        state
            .store
            .threads
            .append(t.id, Role::User, "very private words", None, None)
            .await
            .unwrap();
        sweep(&state, Utc::now() + Days::days(2)).await.unwrap();
        let entries = state.store.audit.list(None, 100).await.unwrap();
        let text = serde_json::to_string(&entries).unwrap();
        assert!(
            text.contains("keep.retention.sweep"),
            "the sweep is journaled: {text}"
        );
        assert!(
            !text.contains("very private words") && !text.contains("secret title"),
            "no text in the journal"
        );
    }

    #[tokio::test]
    async fn event_logs_of_ended_sessions_go_after_the_period_and_running_ones_stay() {
        let (state, base) = state_and_session_cfg(|c| c.event_retention_days = Some(7)).await;
        let mut ended = base.clone();
        ended.id = uuid::Uuid::new_v4();
        ended.status = SessionStatus::Running;
        state.store.save_session(ended.clone()).await.unwrap();
        state
            .store
            .append_event(ended.id, "session.log", json!({"line": "x"}))
            .await
            .unwrap();
        state
            .store
            .update_session(ended.id, |s| s.status = SessionStatus::Completed)
            .await
            .unwrap();
        let mut running = base.clone();
        running.id = uuid::Uuid::new_v4();
        running.status = SessionStatus::Running;
        state.store.save_session(running.clone()).await.unwrap();
        state
            .store
            .append_event(running.id, "session.log", json!({"line": "y"}))
            .await
            .unwrap();

        assert_eq!(
            sweep(&state, Utc::now()).await.unwrap(),
            Swept::default(),
            "not old enough"
        );
        let later = Utc::now() + Days::days(8);
        assert_eq!(sweep(&state, later).await.unwrap().event_logs, 1);
        assert!(
            state
                .store
                .events_after(ended.id, 0)
                .await
                .unwrap()
                .is_empty(),
            "the ended session's events are gone"
        );
        assert!(
            state.store.get_session(ended.id).await.is_some(),
            "its record stays"
        );
        assert_eq!(
            state.store.events_after(running.id, 0).await.unwrap().len(),
            1,
            "a running session keeps its events"
        );
        assert_eq!(
            sweep(&state, later).await.unwrap(),
            Swept::default(),
            "safe to repeat"
        );
    }

    #[tokio::test]
    async fn with_no_period_set_nothing_is_ever_removed() {
        let (state, _) = state_and_session_cfg(|_| {}).await;
        let t = state
            .store
            .threads
            .get_or_create("ana", "chat", "t", None)
            .await
            .unwrap();
        state
            .store
            .threads
            .append(t.id, Role::User, "keep me", None, None)
            .await
            .unwrap();
        assert_eq!(
            sweep(&state, Utc::now() + Days::days(5000)).await.unwrap(),
            Swept::default()
        );
        assert!(state.store.threads.get(t.id).await.is_some());
    }
}
