// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use anyhow::Result;

/// Check if quorum is held by writing/reading a heartbeat file on shared storage.
pub fn check_quorum(quorum_path: &str, host_id: &str) -> Result<bool> {
    let heartbeat_file = format!("{}/{}.heartbeat", quorum_path, host_id);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();

    // Write our heartbeat
    std::fs::write(&heartbeat_file, now.to_string())?;

    // Read all heartbeats and check how many are recent (within 30s)
    let mut alive_hosts = 0;
    let mut total_hosts = 0;

    if let Ok(entries) = std::fs::read_dir(quorum_path) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("heartbeat") {
                total_hosts += 1;
                if let Ok(content) = std::fs::read_to_string(entry.path()) {
                    if let Ok(ts) = content.trim().parse::<u64>() {
                        if now - ts < 30 {
                            alive_hosts += 1;
                        }
                    }
                }
            }
        }
    }

    // Quorum requires majority
    let has_quorum = total_hosts == 0 || alive_hosts > total_hosts / 2;
    if !has_quorum {
        tracing::warn!("Lost quorum: {}/{} hosts alive", alive_hosts, total_hosts);
    }
    Ok(has_quorum)
}

/// Self-fence: stop all FT-protected VMs when quorum is lost.
pub fn self_fence() -> Result<()> {
    tracing::error!("QUORUM LOST: self-fencing - stopping all FT VMs");
    let output = std::process::Command::new("machinectl")
        .args(["list", "--no-legend", "--no-pager"])
        .output()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(name) = line.split_whitespace().next() {
            tracing::warn!("Self-fence: stopping VM '{}'", name);
            let _ = std::process::Command::new("machinectl")
                .args(["poweroff", name])
                .output();
        }
    }
    Ok(())
}
