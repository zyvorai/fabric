// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Request-level (layer 7) egress policy for the JSON broker: per-host rules and
//! a data-loss scan. Both run on what the agent supplied (URL, headers, body)
//! before anything leaves the host.
//!
//! The CONNECT proxy cannot apply either: a TLS tunnel exposes only `host:port`.

use crate::{credentials::host_matches, model::EgressRule};

/// Check a request against the agent's rules for `host`.
///
/// A host with no rules is unrestricted (the allowlist already gates it). A host
/// with rules needs at least one rule that matches the method, the path prefix
/// and the body size.
pub fn check_rules(
    rules: &[EgressRule],
    host: &str,
    method: &str,
    path: &str,
    body_len: usize,
) -> Result<(), String> {
    let mut any = false;
    for rule in rules.iter().filter(|r| host_matches(&r.host, host)) {
        any = true;
        let method_ok =
            rule.methods.is_empty() || rule.methods.iter().any(|m| m.eq_ignore_ascii_case(method));
        let path_ok =
            rule.path_prefixes.is_empty() || rule.path_prefixes.iter().any(|p| path.starts_with(p));
        let size_ok = rule.max_body_bytes.is_none_or(|max| body_len as u64 <= max);
        if method_ok && path_ok && size_ok {
            return Ok(());
        }
    }
    if any {
        Err(format!(
            "{method} {path} ({body_len} body bytes) is not permitted by this agent's egress rules for {host}"
        ))
    } else {
        Ok(())
    }
}

/// True when `host` has rules, which a TLS tunnel could not enforce.
pub fn host_has_rules(rules: &[EgressRule], host: &str) -> bool {
    rules.iter().any(|r| host_matches(&r.host, host))
}

/// Names of the secret shapes found in `text`. Only names are returned, never
/// the matched text, so the result is safe to store and show to an operator.
pub fn scan(text: &str) -> Vec<&'static str> {
    let mut found = Vec::new();
    let mut add = |name: &'static str, hit: bool| {
        if hit && !found.contains(&name) {
            found.push(name);
        }
    };
    add(
        "private-key",
        text.contains("-----BEGIN") && text.contains("PRIVATE KEY-----"),
    );
    add("aws-access-key", token_after(text, "AKIA", 16, upper_alnum));
    for prefix in ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"] {
        add("github-token", token_after(text, prefix, 36, alnum));
    }
    add(
        "github-token",
        token_after(text, "github_pat_", 22, alnum_underscore),
    );
    add("slack-token", slack_token(text));
    add("api-key", token_after(text, "sk-", 32, alnum_dash));
    add("jwt", has_jwt(text));
    found
}

fn upper_alnum(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit()
}
fn alnum(c: char) -> bool {
    c.is_ascii_alphanumeric()
}
fn alnum_underscore(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}
fn alnum_dash(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_'
}

/// `prefix` followed by at least `min` characters accepted by `class`.
fn token_after(text: &str, prefix: &str, min: usize, class: fn(char) -> bool) -> bool {
    text.match_indices(prefix).any(|(at, _)| {
        text[at + prefix.len()..]
            .chars()
            .take_while(|c| class(*c))
            .count()
            >= min
    })
}

fn slack_token(text: &str) -> bool {
    ["xoxb-", "xoxp-", "xoxa-", "xoxs-"]
        .iter()
        .any(|p| token_after(text, p, 20, alnum_dash))
}

/// Three dot-separated base64url segments, the first two starting `eyJ` (JSON).
fn has_jwt(text: &str) -> bool {
    text.match_indices("eyJ").any(|(at, _)| {
        let candidate: String = text[at..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            .collect();
        let parts: Vec<&str> = candidate.split('.').collect();
        parts.len() >= 3
            && parts[1].starts_with("eyJ")
            && parts.iter().take(3).all(|p| p.len() >= 8)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(host: &str, methods: &[&str], prefixes: &[&str], max: Option<u64>) -> EgressRule {
        EgressRule {
            host: host.into(),
            methods: methods.iter().map(|s| s.to_string()).collect(),
            path_prefixes: prefixes.iter().map(|s| s.to_string()).collect(),
            max_body_bytes: max,
        }
    }

    #[test]
    fn hosts_without_rules_are_unrestricted() {
        let rules = [rule("api.example.com", &["GET"], &[], None)];
        assert!(check_rules(&rules, "other.example", "POST", "/x", 1_000_000).is_ok());
        assert!(check_rules(&[], "api.example.com", "DELETE", "/x", 0).is_ok());
    }

    #[test]
    fn a_host_with_rules_needs_one_matching_rule() {
        let rules = [
            rule("api.example.com", &["GET"], &[], None),
            rule("api.example.com", &["POST"], &["/v1/messages"], Some(1024)),
        ];
        assert!(check_rules(&rules, "api.example.com", "get", "/anything", 0).is_ok());
        assert!(check_rules(&rules, "api.example.com", "POST", "/v1/messages/1", 1024).is_ok());
        for (method, path, len) in [
            ("POST", "/v1/messages", 1025),
            ("POST", "/v1/other", 10),
            ("DELETE", "/v1/messages", 0),
        ] {
            let error = check_rules(&rules, "api.example.com", method, path, len).unwrap_err();
            assert!(error.contains("egress rules"), "{error}");
        }
    }

    #[test]
    fn rules_match_subdomains_like_the_allowlist_does() {
        let rules = [rule("example.com", &["GET"], &[], None)];
        assert!(host_has_rules(&rules, "api.example.com"));
        assert!(check_rules(&rules, "api.example.com", "POST", "/", 0).is_err());
        assert!(!host_has_rules(&rules, "evilexample.com"));
    }

    #[test]
    fn scan_finds_common_secret_shapes_by_name_only() {
        let aws = "key=AKIAIOSFODNN7EXAMPLE";
        assert_eq!(scan(aws), vec!["aws-access-key"]);
        assert_eq!(
            scan("-----BEGIN RSA PRIVATE KEY-----\nMIIE"),
            vec!["private-key"]
        );
        assert_eq!(
            scan(&format!("token ghp_{}", "a1B2".repeat(9))),
            vec!["github-token"]
        );
        assert_eq!(scan(&format!("sk-{}", "x".repeat(40))), vec!["api-key"]);
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r";
        assert_eq!(scan(jwt), vec!["jwt"]);
        assert_eq!(
            scan(&format!("xoxb-{}", "1".repeat(24))),
            vec!["slack-token"]
        );
        // Nothing echoes the secret itself.
        for name in scan(aws) {
            assert!(!aws.contains(name));
        }
    }

    #[test]
    fn scan_ignores_ordinary_text_and_short_lookalikes() {
        for text in [
            "hello world",
            "AKIA short",
            "ghp_tooshort",
            "sk-abc",
            "eyJ only one segment",
            "the price is $5 - sk",
        ] {
            assert!(scan(text).is_empty(), "{text}");
        }
    }
}
