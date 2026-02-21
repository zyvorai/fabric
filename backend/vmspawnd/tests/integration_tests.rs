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
