// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use axum::{middleware, Router};
use std::sync::Arc;
use tokio::sync::RwLock;

use zyvor_fabricd::config::{
    AuthConfig, Config, ControllerConfig, DaemonConfig, DriverConfig, NetworkConfig, StorageConfig,
    TlsConfig,
};
use zyvor_fabricd::server::{AppState, QuotaCache};

/// Test middleware that injects admin Claims into every request.
/// This is needed because unauthenticated_claims() now defaults to Viewer,
/// but integration tests need full access.
async fn inject_admin_claims(
    mut req: axum::extract::Request,
    next: middleware::Next,
) -> axum::response::Response {
    req.extensions_mut().insert(security::Claims {
        sub: "test-admin".to_string(),
        role: security::Role::Admin,
        exp: usize::MAX,
        jti: String::new(),
    });
    next.run(req).await
}

pub async fn create_test_app() -> Router {
    let tmp_dir = std::env::temp_dir().join(format!("zyvor-fabricd-test-{}", std::process::id()));
    let store_dir = tmp_dir.join("store");
    let storage_dir = tmp_dir.join("storage");

    std::fs::create_dir_all(&store_dir).unwrap();
    std::fs::create_dir_all(&storage_dir).unwrap();

    let store = state_store::StateStore::new(&store_dir).unwrap();

    let config = Config {
        daemon: DaemonConfig {
            listen: "127.0.0.1:0".to_string(),
            cors_origins: vec!["http://127.0.0.1:9095".to_string()],
        },
        storage: StorageConfig {
            path: tmp_dir.to_string_lossy().to_string(),
            image_path: tmp_dir.join("images").to_string_lossy().to_string(),
        },
        network: NetworkConfig {
            bridge: "br-test".to_string(),
            networkd_config_dir: tmp_dir.join("networkd").to_string_lossy().to_string(),
            networkd_file_prefix: "50-zyvor-fabricd-".to_string(),
        },
        controller: ControllerConfig::default(),
        auth: AuthConfig {
            enabled: false,
            ..AuthConfig::default()
        },
        driver: DriverConfig::default(),
        tls: TlsConfig { enabled: false, ..TlsConfig::default() },
    };

    let storage_manager = zyvor_fabric_storage::StorageManager::new(&storage_dir).unwrap();

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    let driver = zyvor_fabric_ephemera_driver::EphemeraDriver::new("http://127.0.0.1:7788")
        .expect("failed to construct test Ephemera driver (no real connection made yet)");

    let lock_manager = Arc::new(zyvor_fabric_lock_manager::LockManager::new(
        zyvor_fabric_lock_manager::LockConfig::default(),
    ));

    let state = Arc::new(AppState {
        store,
        config,
        storage_manager: Arc::new(RwLock::new(storage_manager)),
        http_client,
        quota_cache: Arc::new(tokio::sync::RwLock::new(QuotaCache::new())),
        user_db: None,
        jwt_config: None,
        plugin_registry: Arc::new(RwLock::new(zyvor_fabricd::plugins::PluginRegistry::new())),
        driver: Arc::new(driver),
        dnsmasq_manager: Arc::new(zyvor_fabric_dnsmasq_manager::DnsmasqManager::new(tmp_dir.join("dnsmasq"))),
        lock_manager,
        policy_engine: Arc::new(network_policy::PolicyEngine::new()),
        service_mesh: Arc::new(service_mesh::ServiceMesh::new()),
        traffic_shaper: Arc::new(traffic_shaping::TrafficShaper::new()),
        dns_manager: Arc::new(dns_policy::DnsManager::new()),
        vm_firewall: Arc::new(vm_firewall::VMFirewall::new()),
        vpn_mesh: Arc::new(vpn_mesh::VpnMesh::new()),
        packet_mirror: Arc::new(packet_mirror::PacketMirror::new()),
        nat_gateway: Arc::new(nat_gateway::NatGateway::new()),
        net_monitor: Arc::new(net_monitor::NetMonitor::new()),
        secrets_manager: Arc::new(secrets_manager::SecretsManager::new()),
        event_tx: {
            let (tx, _) = tokio::sync::broadcast::channel(256);
            tx
        },
        vm_locks: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        shutdown: tokio_util::sync::CancellationToken::new(),
    });

    zyvor_fabricd::server::build_router(state).layer(middleware::from_fn(inject_admin_claims))
}

/// Create a test app with a specific role injected into all requests.
/// Use this to test role-based access control.
pub async fn create_test_app_with_role(role: security::Role) -> Router {
    let tmp_dir = std::env::temp_dir().join(format!(
        "zyvor-fabricd-test-rbac-{}-{:?}",
        std::process::id(),
        role
    ));
    let store_dir = tmp_dir.join("store");
    let storage_dir = tmp_dir.join("storage");

    std::fs::create_dir_all(&store_dir).unwrap();
    std::fs::create_dir_all(&storage_dir).unwrap();

    let store = state_store::StateStore::new(&store_dir).unwrap();

    let config = Config {
        daemon: DaemonConfig {
            listen: "127.0.0.1:0".to_string(),
            cors_origins: vec!["http://127.0.0.1:9095".to_string()],
        },
        storage: StorageConfig {
            path: tmp_dir.to_string_lossy().to_string(),
            image_path: tmp_dir.join("images").to_string_lossy().to_string(),
        },
        network: NetworkConfig {
            bridge: "br-test".to_string(),
            networkd_config_dir: tmp_dir.join("networkd").to_string_lossy().to_string(),
            networkd_file_prefix: "50-zyvor-fabricd-".to_string(),
        },
        controller: ControllerConfig::default(),
        auth: AuthConfig {
            enabled: false,
            ..AuthConfig::default()
        },
        driver: DriverConfig::default(),
        tls: TlsConfig { enabled: false, ..TlsConfig::default() },
    };

    let storage_manager = zyvor_fabric_storage::StorageManager::new(&storage_dir).unwrap();

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    let driver = zyvor_fabric_ephemera_driver::EphemeraDriver::new("http://127.0.0.1:7788")
        .expect("failed to construct test Ephemera driver (no real connection made yet)");

    let lock_manager = Arc::new(zyvor_fabric_lock_manager::LockManager::new(
        zyvor_fabric_lock_manager::LockConfig::default(),
    ));

    let state = Arc::new(AppState {
        store,
        config,
        storage_manager: Arc::new(RwLock::new(storage_manager)),
        http_client,
        quota_cache: Arc::new(tokio::sync::RwLock::new(QuotaCache::new())),
        user_db: None,
        jwt_config: None,
        plugin_registry: Arc::new(RwLock::new(zyvor_fabricd::plugins::PluginRegistry::new())),
        driver: Arc::new(driver),
        dnsmasq_manager: Arc::new(zyvor_fabric_dnsmasq_manager::DnsmasqManager::new(tmp_dir.join("dnsmasq"))),
        lock_manager,
        policy_engine: Arc::new(network_policy::PolicyEngine::new()),
        service_mesh: Arc::new(service_mesh::ServiceMesh::new()),
        traffic_shaper: Arc::new(traffic_shaping::TrafficShaper::new()),
        dns_manager: Arc::new(dns_policy::DnsManager::new()),
        vm_firewall: Arc::new(vm_firewall::VMFirewall::new()),
        vpn_mesh: Arc::new(vpn_mesh::VpnMesh::new()),
        packet_mirror: Arc::new(packet_mirror::PacketMirror::new()),
        nat_gateway: Arc::new(nat_gateway::NatGateway::new()),
        net_monitor: Arc::new(net_monitor::NetMonitor::new()),
        secrets_manager: Arc::new(secrets_manager::SecretsManager::new()),
        event_tx: {
            let (tx, _) = tokio::sync::broadcast::channel(256);
            tx
        },
        vm_locks: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        shutdown: tokio_util::sync::CancellationToken::new(),
    });

    // Create a role-specific middleware
    let inject_role = move |mut req: axum::extract::Request, next: middleware::Next| {
        let role = role.clone();
        async move {
            req.extensions_mut().insert(security::Claims {
                sub: format!("test-{:?}", role).to_lowercase(),
                role,
                exp: usize::MAX,
                jti: String::new(),
            });
            next.run(req).await
        }
    };

    zyvor_fabricd::server::build_router(state).layer(middleware::from_fn(inject_role))
}
