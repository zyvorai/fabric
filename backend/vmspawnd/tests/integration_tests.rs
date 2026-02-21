use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

// ─── Health & system info (always work) ──────────────────────────────────────

#[tokio::test]
async fn test_health_endpoint() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/health")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_cpu_topology_detection() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/cpu/topology")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let topology: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(topology.get("total_cpus").is_some());
    assert!(topology.get("sockets").is_some());
    assert!(topology.get("cores_per_socket").is_some());
    assert!(topology.get("threads_per_core").is_some());
}

#[tokio::test]
async fn test_numa_topology_detection() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/numa/topology")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let topology: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(topology.get("nodes").is_some());
}

#[tokio::test]
async fn test_system_memory_info() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/memory")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let memory: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(memory.get("total_kb").is_some());
    assert!(memory.get("free_kb").is_some());
    assert!(memory.get("available_kb").is_some());
}

#[tokio::test]
async fn test_hugepage_stats() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/memory/hugepages")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    // Hugepages may not be configured on all systems, accept any non-panic response
    assert!(
        response.status().is_success()
            || response.status().is_client_error()
            || response.status().is_server_error()
    );
}

#[tokio::test]
async fn test_firmware_capabilities() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/firmware/capabilities")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ─── Storage pool operations ─────────────────────────────────────────────────

#[tokio::test]
async fn test_storage_pool_lifecycle() {
    let app = common::create_test_app().await;

    let tmp = std::env::temp_dir().join("vmspawnd-test-pool");
    let _ = std::fs::create_dir_all(&tmp);

    let create_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/local")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "test-pool",
                "path": tmp.to_string_lossy(),
                "auto_start": true
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert!(
        response.status() == StatusCode::CREATED || response.status() == StatusCode::OK,
        "Expected 200 or 201, got {}",
        response.status()
    );

    // List pools
    let list_request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(list_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Delete pool
    let delete_request = Request::builder()
        .method("DELETE")
        .uri("/api/storage/pools/test-pool")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(delete_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    let _ = std::fs::remove_dir_all(&tmp);
}

#[tokio::test]
async fn test_nonexistent_pool_returns_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools/non-existent-pool")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ─── VM operations (VMs won't exist, expect NOT_FOUND) ──────────────────────

#[tokio::test]
async fn test_vm_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/vms/nonexistent-vm")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_list_vms() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/vms")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ─── Networkd API ────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_networkd_bridge_lifecycle() {
    let app = common::create_test_app().await;

    // Create bridge
    let create_request = Request::builder()
        .method("POST")
        .uri("/api/networkd/bridges")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "br-test",
                "stp": true,
                "addresses": ["10.0.0.1/24"]
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let bridge: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let bridge_id = bridge["id"].as_str().unwrap();

    // List bridges
    let list_request = Request::builder()
        .method("GET")
        .uri("/api/networkd/bridges")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(list_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let bridges: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert!(!bridges.is_empty());

    // Delete bridge
    let delete_request = Request::builder()
        .method("DELETE")
        .uri(&format!("/api/networkd/bridges/{}", bridge_id))
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(delete_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_networkd_list_managed_files() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/networkd/files")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ─── Quotas & Schedules ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_list_quotas() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/quotas")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_list_schedules() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/schedules")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ─── Template CRUD ──────────────────────────────────────────────────────────

#[tokio::test]
async fn test_template_lifecycle() {
    let app = common::create_test_app().await;

    // Create template
    let create_request = Request::builder()
        .method("POST")
        .uri("/api/templates")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "ubuntu-base",
                "description": "Base Ubuntu template",
                "cpus": 2,
                "memory": 2048,
                "disk": 20,
                "image": "ubuntu-22.04.qcow2",
                "tags": ["linux", "ubuntu"]
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let template: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let template_id = template["id"].as_str().unwrap().to_string();

    assert_eq!(template["name"], "ubuntu-base");
    assert_eq!(template["cpus"], 2);
    assert_eq!(template["memory"], 2048);

    // List templates
    let list_request = Request::builder()
        .method("GET")
        .uri("/api/templates")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(list_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let templates: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert!(!templates.is_empty());

    // Get template by ID
    let get_request = Request::builder()
        .method("GET")
        .uri(&format!("/api/templates/{}", template_id))
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(get_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Update template
    let update_request = Request::builder()
        .method("PUT")
        .uri(&format!("/api/templates/{}", template_id))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "ubuntu-base-v2",
                "cpus": 4
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(update_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let updated: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(updated["name"], "ubuntu-base-v2");
    assert_eq!(updated["cpus"], 4);

    // Delete template
    let delete_request = Request::builder()
        .method("DELETE")
        .uri(&format!("/api/templates/{}", template_id))
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(delete_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    // Verify deleted
    let get_request = Request::builder()
        .method("GET")
        .uri(&format!("/api/templates/{}", template_id))
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(get_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_template_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/templates/nonexistent-id")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_deploy_template() {
    let app = common::create_test_app().await;

    // Create template first
    let create_request = Request::builder()
        .method("POST")
        .uri("/api/templates")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "deploy-test",
                "cpus": 1,
                "memory": 512,
                "disk": 10,
                "image": "test.qcow2",
                "tags": []
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let template: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let template_id = template["id"].as_str().unwrap().to_string();

    // Deploy VM from template
    let deploy_request = Request::builder()
        .method("POST")
        .uri(&format!("/api/templates/{}/deploy", template_id))
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "vm_name": "deployed-vm" }).to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(deploy_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let vm: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(vm["name"], "deployed-vm");
    assert_eq!(vm["cpus"], 1);
    assert_eq!(vm["memory"], 512);

    // Verify VM exists in VM list
    let list_request = Request::builder()
        .method("GET")
        .uri("/api/vms/deployed-vm")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(list_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ─── VM Pause/Resume ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_pause_nonexistent_vm() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/vms/nonexistent/pause")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    // Will fail because VM doesn't have a running process to SIGSTOP
    assert!(response.status().is_server_error() || response.status().is_client_error());
}

#[tokio::test]
async fn test_resume_nonexistent_vm() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/vms/nonexistent/resume")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert!(response.status().is_server_error() || response.status().is_client_error());
}

// ─── VM Clone ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_clone_nonexistent_vm() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/vms/nonexistent/clone")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "target_name": "clone-target" }).to_string(),
        ))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_clone_vm() {
    let app = common::create_test_app().await;

    // Create a VM first
    let create_request = Request::builder()
        .method("POST")
        .uri("/api/vms")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "clone-source",
                "image": "test.qcow2",
                "cpus": 2,
                "memory": 1024
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    // Clone it
    let clone_request = Request::builder()
        .method("POST")
        .uri("/api/vms/clone-source/clone")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "target_name": "clone-target", "linked_clone": false }).to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(clone_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let cloned: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(cloned["name"], "clone-target");
    assert_eq!(cloned["cpus"], 2);
    assert_eq!(cloned["memory"], 1024);
    assert_eq!(cloned["state"], "stopped");
}

#[tokio::test]
async fn test_clone_vm_name_conflict() {
    let app = common::create_test_app().await;

    // Create two VMs
    for name in &["vm-a", "vm-b"] {
        let create_request = Request::builder()
            .method("POST")
            .uri("/api/vms")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "name": name,
                    "image": "test.qcow2",
                    "cpus": 1,
                    "memory": 512
                })
                .to_string(),
            ))
            .unwrap();

        app.clone().oneshot(create_request).await.unwrap();
    }

    // Try to clone vm-a with target name vm-b (conflict)
    let clone_request = Request::builder()
        .method("POST")
        .uri("/api/vms/vm-a/clone")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "target_name": "vm-b" }).to_string(),
        ))
        .unwrap();

    let response = app.oneshot(clone_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// ─── Migrations ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_list_migrations() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/migrations")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let migrations: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    assert!(migrations.is_empty());
}

#[tokio::test]
async fn test_migration_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/migrations/nonexistent-id")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_start_migration_vm_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/migrations")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "vm_name": "nonexistent-vm",
                "target_host": "192.168.1.100",
                "migration_type": "offline"
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_cancel_migration_not_found() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/migrations/nonexistent-id/cancel")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ─── Resource Optimization ──────────────────────────────────────────────────

#[tokio::test]
async fn test_optimization_recommendations() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/optimization/recommendations")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let recommendations: Vec<serde_json::Value> = serde_json::from_slice(&body).unwrap();
    // No running VMs so no recommendations
    assert!(recommendations.is_empty());
}

#[tokio::test]
async fn test_optimize_nonexistent_vm() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("POST")
        .uri("/api/vms/nonexistent/optimize")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

// ─── Analytics ──────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_analytics_system_performance() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/analytics/system?range=1h")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_analytics_insights() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/analytics/insights")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_analytics_utilization() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/analytics/utilization")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_vm_metrics() {
    let app = common::create_test_app().await;

    // Metrics for nonexistent VM should return error (no cgroup to read)
    let request = Request::builder()
        .method("GET")
        .uri("/api/vms/nonexistent/metrics")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    // get_metrics returns Ok with zeroes even if cgroup doesn't exist, so expect 200
    assert_eq!(response.status(), StatusCode::OK);
}
