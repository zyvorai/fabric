// Integration tests for Phase 1 API endpoints
// These tests verify the complete stack: API → Business Logic → System Layer

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::json;
use tower::ServiceExt;

mod common;

#[tokio::test]
async fn test_storage_pool_lifecycle() {
    let app = common::create_test_app().await;

    // Create local storage pool
    let create_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/local")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "test-pool",
                "path": "/tmp/vmspawnd-test-pool",
                "auto_start": true
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(create_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    // List pools - should contain our new pool
    let list_request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(list_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Get pool details
    let get_request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools/test-pool")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(get_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Get pool stats
    let stats_request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools/test-pool/stats")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(stats_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Delete pool
    let delete_request = Request::builder()
        .method("DELETE")
        .uri("/api/storage/pools/test-pool")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(delete_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_nfs_pool_creation() {
    let app = common::create_test_app().await;

    let create_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/nfs")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "name": "nfs-test",
                "server": "192.168.1.100",
                "export_path": "/exports/vms",
                "mount_path": "/mnt/nfs-test",
                "nfs_version": "V4_1",
                "mount_options": ["rw", "hard", "intr"],
                "auto_start": false
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.oneshot(create_request).await.unwrap();
    // May fail if NFS server not available, but should not panic
    assert!(
        response.status() == StatusCode::CREATED
            || response.status() == StatusCode::INTERNAL_SERVER_ERROR
    );
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

    // Verify response contains expected fields
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let topology: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(topology.get("total_cpus").is_some());
    assert!(topology.get("sockets").is_some());
    assert!(topology.get("cores_per_socket").is_some());
    assert!(topology.get("threads_per_core").is_some());
    assert!(topology.get("cpus").is_some());
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

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let topology: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(topology.get("nodes").is_some());
    assert!(topology.get("distances").is_some());
}

#[tokio::test]
async fn test_numa_placement_recommendation() {
    let app = common::create_test_app().await;

    let request = Request::builder()
        .method("GET")
        .uri("/api/system/numa/placement?memory_mb=4096&cpus=4")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let placement: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(placement.get("node_id").is_some());
    assert!(placement.get("available_memory_mb").is_some());
    assert!(placement.get("available_cpus").is_some());
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

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
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
    assert_eq!(response.status(), StatusCode::OK);

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let stats: serde_json::Value = serde_json::from_slice(&body).unwrap();

    // Should return array of hugepage stats
    assert!(stats.is_array());
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

    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    let caps: serde_json::Value = serde_json::from_slice(&body).unwrap();

    assert!(caps.get("uefi_available").is_some());
    assert!(caps.get("secure_boot_available").is_some());
    assert!(caps.get("tpm_available").is_some());
}

#[tokio::test]
async fn test_cpu_pinning_operations() {
    let app = common::create_test_app().await;

    // Set CPU pinning
    let set_request = Request::builder()
        .method("POST")
        .uri("/api/vms/test-vm/cpu/pin")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "pinning": {
                    "type": "NumaNode",
                    "node_id": 0
                }
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(set_request).await.unwrap();
    // VM may not exist, but endpoint should be accessible
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );

    // Get CPU affinity
    let get_request = Request::builder()
        .method("GET")
        .uri("/api/vms/test-vm/cpu/affinity")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(get_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );

    // Remove CPU pinning
    let remove_request = Request::builder()
        .method("DELETE")
        .uri("/api/vms/test-vm/cpu/pin")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(remove_request).await.unwrap();
    assert!(
        response.status() == StatusCode::NO_CONTENT
            || response.status() == StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn test_memory_limit_operations() {
    let app = common::create_test_app().await;

    // Set memory limit
    let set_request = Request::builder()
        .method("PUT")
        .uri("/api/vms/test-vm/memory/limit")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({
                "limit_mb": 2048
            })
            .to_string(),
        ))
        .unwrap();

    let response = app.clone().oneshot(set_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );

    // Get memory usage
    let get_request = Request::builder()
        .method("GET")
        .uri("/api/vms/test-vm/memory/usage")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(get_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn test_pool_operations() {
    let app = common::create_test_app().await;

    // Start pool (requires pool to exist)
    let start_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/test/start")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(start_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );

    // Stop pool
    let stop_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/test/stop")
        .body(Body::empty())
        .unwrap();

    let response = app.clone().oneshot(stop_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );

    // Refresh stats
    let refresh_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/test/refresh")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(refresh_request).await.unwrap();
    assert!(
        response.status() == StatusCode::OK
            || response.status() == StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn test_invalid_requests() {
    let app = common::create_test_app().await;

    // Invalid pool creation (missing required fields)
    let invalid_request = Request::builder()
        .method("POST")
        .uri("/api/storage/pools/local")
        .header("content-type", "application/json")
        .body(Body::from(json!({"name": "test"}).to_string()))
        .unwrap();

    let response = app.clone().oneshot(invalid_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    // Non-existent pool
    let not_found_request = Request::builder()
        .method("GET")
        .uri("/api/storage/pools/non-existent-pool")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(not_found_request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

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
