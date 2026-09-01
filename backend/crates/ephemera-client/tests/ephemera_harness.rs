// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! Phase 1 harness test (see the systemd-removal plan): boots a real
//! `ephemera serve` process from the sibling Ephemera checkout and exercises
//! the wire contract `zyvor-fabric-ephemera-client` depends on.
//!
//! This intentionally does NOT create a real VM (that needs a QEMU/Cloud
//! Hypervisor/Firecracker binary and a base disk image — heavier
//! integration coverage that belongs to the Phase 3/5 lifecycle-cutover
//! tests). It only proves: the `ephemera` binary starts, serves `/healthz`,
//! and returns wire-compatible JSON for the read-only endpoints this client
//! parses.
//!
//! Skips (does not fail) if the `ephemera` binary can't be found, so this
//! passes on machines/CI that haven't built the sibling repo yet. Point it
//! at a specific binary with `EPHEMERA_BIN=/path/to/ephemera`.

use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    time::Duration,
};

use zyvor_fabric_ephemera_client::EphemeraClient;

struct EphemeraServe {
    child: Child,
    _workdir: PathBuf,
}

impl Drop for EphemeraServe {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn find_ephemera_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("EPHEMERA_BIN") {
        let path = PathBuf::from(path);
        return path.exists().then_some(path);
    }
    // Sibling checkout: .../zyvor-fabric/backend/crates/ephemera-client -> .../tt/Ephemera
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest_dir
        .join("../../../../Ephemera/target/debug/ephemera")
        .canonicalize()
        .ok()?;
    candidate.exists().then_some(candidate)
}

async fn spawn_ephemera(bin: &PathBuf, port: u16) -> anyhow::Result<EphemeraServe> {
    let workdir = std::env::temp_dir().join(format!("ephemera-harness-{}", std::process::id()));
    std::fs::create_dir_all(&workdir)?;
    let state_dir = workdir.join("state");
    let run_dir = workdir.join("run");
    let config_path = workdir.join("config.toml");
    std::fs::write(
        &config_path,
        format!(
            "listen = \"127.0.0.1:{port}\"\nstate_dir = \"{}\"\nrun_dir = \"{}\"\nreaper_interval_secs = 3600\n",
            state_dir.display(),
            run_dir.display(),
        ),
    )?;

    let child = Command::new(bin)
        .arg("--config")
        .arg(&config_path)
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let client = EphemeraClient::new(format!("http://127.0.0.1:{port}"))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    while std::time::Instant::now() < deadline {
        if client.healthy().await {
            return Ok(EphemeraServe { child, _workdir: workdir });
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    anyhow::bail!("ephemera serve did not become healthy within 10s")
}

#[tokio::test]
async fn boots_and_serves_healthz() {
    let Some(bin) = find_ephemera_binary() else {
        eprintln!(
            "SKIP: no ephemera binary found (build ../Ephemera with `cargo build` or set EPHEMERA_BIN)"
        );
        return;
    };

    let serve = spawn_ephemera(&bin, 17788).await.expect("ephemera serve failed to start");
    let client = EphemeraClient::new("http://127.0.0.1:17788").unwrap();

    assert!(client.healthy().await, "healthz should report healthy");

    let vms = client.list_vms().await.expect("list_vms should succeed against a fresh instance");
    assert!(vms.is_empty(), "a fresh ephemera instance should have no VMs");

    assert!(
        client.find_by_name("does-not-exist").await.unwrap().is_none(),
        "find_by_name should return None, not error, for an unknown name"
    );

    let missing = client.get_vm(uuid::Uuid::new_v4()).await;
    assert!(missing.is_err(), "getting a nonexistent VM id should error, not panic or hang");

    drop(serve);
}
