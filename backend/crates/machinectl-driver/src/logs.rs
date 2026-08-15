// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;
use async_trait::async_trait;
use chrono::{TimeZone, Utc};
use vmspawnd_driver_core::{LogDriver, LogEntry, LogStream};

use crate::MachinectlDriver;

#[async_trait]
impl LogDriver for MachinectlDriver {
    async fn stream_logs(&self, name: &str, lines: u32) -> Result<LogStream> {
        let scope = format!("machine-{}.scope", name);
        let lines_str = lines.to_string();

        let mut child = tokio::process::Command::new("journalctl")
            .args(["--follow", "--output=json", "-n", &lines_str, "-u", &scope])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture journalctl stdout"))?;

        let stream = async_stream::stream! {
            use tokio::io::{AsyncBufReadExt, BufReader};

            let reader = BufReader::new(stdout);
            let mut line_buf = reader.lines();

            while let Ok(Some(line)) = line_buf.next_line().await {
                if let Some(entry) = parse_journal_json(&line) {
                    yield entry;
                }
            }

            // Clean up the child process
            let _ = child.kill().await;
        };

        Ok(Box::pin(stream))
    }
}

/// Parse a single JSON line from journalctl --output=json.
fn parse_journal_json(line: &str) -> Option<LogEntry> {
    let obj: serde_json::Value = serde_json::from_str(line).ok()?;

    let message = obj
        .get("MESSAGE")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let priority = obj
        .get("PRIORITY")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u8>().ok())
        .unwrap_or(6); // default to "info"

    let unit = obj
        .get("_SYSTEMD_UNIT")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // __REALTIME_TIMESTAMP is microseconds since epoch
    let timestamp = obj
        .get("__REALTIME_TIMESTAMP")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .and_then(|us| Utc.timestamp_micros(us).single())
        .unwrap_or_else(Utc::now);

    Some(LogEntry {
        timestamp,
        message,
        priority,
        unit,
    })
}
