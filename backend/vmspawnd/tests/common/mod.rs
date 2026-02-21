use axum::Router;
use std::sync::Arc;
use tokio::sync::RwLock;

use vmspawnd::config::{
    Config, ControllerConfig, DaemonConfig, NetworkConfig, StorageConfig,
};
use vmspawnd::server::{AppState, QuotaCache};

pub async fn create_test_app() -> Router {
    let tmp_dir = std::env::temp_dir().join(format!("vmspawnd-test-{}", std::process::id()));
    let store_dir = tmp_dir.join("store");
    let storage_dir = tmp_dir.join("storage");

    std::fs::create_dir_all(&store_dir).unwrap();
    std::fs::create_dir_all(&storage_dir).unwrap();

    let store = state_store::StateStore::new(&store_dir).unwrap();

    let config = Config {
        daemon: DaemonConfig {
            listen: "127.0.0.1:0".to_string(),
            cors_origins: vec!["http://127.0.0.1:8080".to_string()],
        },
        storage: StorageConfig {
            path: tmp_dir.to_string_lossy().to_string(),
            image_path: tmp_dir.join("images").to_string_lossy().to_string(),
        },
        network: NetworkConfig {
            bridge: "br-test".to_string(),
            networkd_config_dir: tmp_dir.join("networkd").to_string_lossy().to_string(),
            networkd_file_prefix: "50-vmspawnd-".to_string(),
        },
        controller: ControllerConfig::default(),
    };

    let storage_manager = vmspawnd_storage::StorageManager::new(&storage_dir).unwrap();

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap();

    let state = Arc::new(AppState {
        store,
        config,
        storage_manager: Arc::new(RwLock::new(storage_manager)),
        http_client,
        quota_cache: Arc::new(std::sync::RwLock::new(QuotaCache::new())),
    });

    vmspawnd::server::build_router(state)
}
