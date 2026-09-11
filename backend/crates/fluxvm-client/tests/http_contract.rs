// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! HTTP contract tests against a wiremock FluxVM peer.

use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
use zyvor_fabric_fluxvm_client::{
    CreateVmRequest, FluxVmClient, MigrationReceiverRequest, VmStatus,
};

fn sample_create_req() -> CreateVmRequest {
    serde_json::from_value(json!({
        "name": "recv",
        "backend": "qemu",
        "image": "/tmp/base.qcow2",
        "vcpus": 1,
        "memory_mib": 512
    }))
    .expect("CreateVmRequest")
}

#[tokio::test]
async fn migration_receiver_crud_paths_and_auth() {
    let server = MockServer::start().await;
    let id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
    let expires = Utc::now() + Duration::seconds(300);

    Mock::given(method("POST"))
        .and(path("/v1/migration/receivers"))
        .and(header("authorization", "Bearer test-token"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "id": id,
            "status": "receiving",
            "port": 4444,
            "expires_at": expires
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path(format!("/v1/migration/receivers/{id}")))
        .and(header("authorization", "Bearer test-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": id,
            "status": "receiving",
            "port": 4444,
            "expires_at": expires
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path(format!("/v1/migration/receivers/{id}/activate")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": id,
            "name": "recv",
            "backend": "qemu",
            "status": "running",
            "pid": null,
            "created_at": "2026-01-01T00:00:00Z",
            "expires_at": null,
            "workspace": "/tmp",
            "disk": "/tmp/disk.qcow2",
            "seed_disk": null,
            "tap_name": null,
            "control_socket": null,
            "log_path": "/tmp/log",
            "error": null,
            "request": sample_create_req(),
            "virtiofsd_pids": [],
            "dhcp_leasefile": null
        })))
        .mount(&server)
        .await;

    Mock::given(method("DELETE"))
        .and(path(format!("/v1/migration/receivers/{id}")))
        .respond_with(ResponseTemplate::new(204))
        .mount(&server)
        .await;

    let client = FluxVmClient::new(server.uri())
        .unwrap()
        .with_token("test-token");

    let created = client
        .create_migration_receiver(&MigrationReceiverRequest {
            spec: sample_create_req(),
            disk_path: "/tmp/disk.qcow2".into(),
            receiver_ttl_seconds: Some(60),
        })
        .await
        .unwrap();
    assert_eq!(created.port, 4444);

    let got = client.get_migration_receiver(id).await.unwrap();
    assert_eq!(got.id, id);

    let _ = client.activate_migration_receiver(id).await.unwrap();
    client.abort_migration_receiver(id).await.unwrap();
}

#[tokio::test]
async fn network_drop_reasons_and_pod_policy_paths() {
    let server = MockServer::start().await;
    let id = Uuid::new_v4();

    Mock::given(method("GET"))
        .and(path(format!("/v1/vms/{id}/network/drop-reasons")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "items": [{
                "identity": 1,
                "family": 4,
                "source": "10.0.0.1",
                "destination": "10.0.0.2",
                "source_port": 1,
                "destination_port": 80,
                "protocol": 6,
                "reason_code": 8,
                "reason": "default-deny",
                "action": "drop",
                "packets": 1,
                "bytes": 64,
                "last_seen_ns": 1
            }]
        })))
        .mount(&server)
        .await;

    Mock::given(method("GET"))
        .and(path(format!("/v1/vms/{id}/network/pod-policy")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!(null)))
        .mount(&server)
        .await;

    Mock::given(method("DELETE"))
        .and(path(format!("/v1/vms/{id}/network/pod-policy")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"ok": true})))
        .mount(&server)
        .await;

    let client = FluxVmClient::new(server.uri()).unwrap();
    let drops = client.network_drop_reasons(id, Some(10)).await.unwrap();
    assert_eq!(drops.len(), 1);
    assert_eq!(drops[0].reason, "default-deny");

    let policy = client.get_pod_network_policy(id).await.unwrap();
    assert!(policy.is_none());
    client.delete_pod_network_policy(id).await.unwrap();
}

#[tokio::test]
async fn pause_resume_and_qga_ping_paths() {
    let server = MockServer::start().await;
    let id = Uuid::new_v4();

    Mock::given(method("POST"))
        .and(path(format!("/v1/vms/{id}/pause")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": id,
            "name": "vm",
            "backend": "qemu",
            "status": "paused",
            "pid": null,
            "created_at": "2026-01-01T00:00:00Z",
            "expires_at": null,
            "workspace": "/tmp",
            "disk": "/tmp/disk.qcow2",
            "seed_disk": null,
            "tap_name": null,
            "control_socket": null,
            "log_path": "/tmp/log",
            "error": null,
            "request": sample_create_req(),
            "virtiofsd_pids": [],
            "dhcp_leasefile": null
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path(format!("/v1/vms/{id}/resume")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": id,
            "name": "vm",
            "backend": "qemu",
            "status": "running",
            "pid": null,
            "created_at": "2026-01-01T00:00:00Z",
            "expires_at": null,
            "workspace": "/tmp",
            "disk": "/tmp/disk.qcow2",
            "seed_disk": null,
            "tap_name": null,
            "control_socket": null,
            "log_path": "/tmp/log",
            "error": null,
            "request": sample_create_req(),
            "virtiofsd_pids": [],
            "dhcp_leasefile": null
        })))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path(format!("/v1/vms/{id}/qga/ping")))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"ok": true})))
        .mount(&server)
        .await;

    let client = FluxVmClient::new(server.uri()).unwrap();
    let paused = client.pause_vm(id).await.unwrap();
    assert_eq!(paused.status, VmStatus::Paused);
    let resumed = client.resume_vm(id).await.unwrap();
    assert_eq!(resumed.status, VmStatus::Running);
    client.qga_ping(id).await.unwrap();
}
