// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Store-backed request and token windows.
//!
//! The decision itself holds no process-local counter. Callers persist the
//! returned record with an exclusive file lock.

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct RateCounter {
    pub id: String,
    #[serde(default)]
    pub window_started_unix: i64,
    #[serde(default)]
    pub requests: u64,
    #[serde(default)]
    pub tokens: u64,
}

pub fn admit(
    mut counter: RateCounter,
    now_unix: i64,
    requested_tokens: u64,
    requests_per_minute: u64,
    tokens_per_minute: u64,
) -> Result<RateCounter, String> {
    if now_unix.saturating_sub(counter.window_started_unix) >= 60 {
        counter.window_started_unix = now_unix;
        counter.requests = 0;
        counter.tokens = 0;
    }
    if requests_per_minute > 0 && counter.requests.saturating_add(1) > requests_per_minute {
        return Err(format!(
            "rate limit exceeded for {} ({} requests/minute)",
            counter.id, requests_per_minute
        ));
    }
    let tokens = requested_tokens.max(1);
    if tokens_per_minute > 0 && counter.tokens.saturating_add(tokens) > tokens_per_minute {
        return Err(format!(
            "token limit exceeded for {} ({} tokens/minute)",
            counter.id, tokens_per_minute
        ));
    }
    counter.requests = counter.requests.saturating_add(1);
    counter.tokens = counter.tokens.saturating_add(tokens);
    Ok(counter)
}

pub fn counter_id(scope: &str, name: &str) -> String {
    let name = name.replace('/', "_");
    format!("{scope}:{name}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_resets_and_then_refuses_the_next_request() {
        let counter = RateCounter {
            id: "endpoint:qwen".into(),
            window_started_unix: 0,
            requests: 2,
            tokens: 0,
        };
        let admitted = admit(counter, 61, 1, 2, 0).unwrap();
        assert_eq!(admitted.requests, 1);
        let again = admit(admitted.clone(), 61, 1, 2, 0).unwrap();
        assert!(admit(again, 61, 1, 2, 0).is_err());
    }

    #[test]
    fn token_window_counts_the_request() {
        let counter = RateCounter {
            id: "model:qwen".into(),
            window_started_unix: 10,
            requests: 0,
            tokens: 8,
        };
        assert!(admit(counter, 10, 4, 0, 10).is_err());
    }
}
