use anyhow::Result;
use axum::{
    routing::{get, post},
    Router,
};
use state_store::StateStore;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

use crate::{config::Config, routes, websocket};

pub struct AppState {
    pub store: StateStore,
    pub config: Config,
}

pub struct Server {
    state: Arc<AppState>,
}

impl Server {
    pub fn new(store: StateStore, config: Config) -> Self {
        let state = Arc::new(AppState { store, config });
        Self { state }
    }

    pub async fn run(self) -> Result<()> {
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let api_routes = Router::new()
            .route("/vms", get(routes::list_vms).post(routes::create_vm))
            .route("/vms/:name", get(routes::get_vm).delete(routes::delete_vm))
            .route("/vms/:name/start", post(routes::start_vm))
            .route("/vms/:name/stop", post(routes::stop_vm))
            .route("/vms/:name/restart", post(routes::restart_vm))
            .route("/vms/:name/metrics", get(routes::get_metrics))
            .route("/vms/:name/cloud-init", post(routes::configure_cloud_init))
            .with_state(self.state.clone());

        let ws_routes = Router::new()
            .route("/console/:name", get(websocket::console_handler))
            .route("/vnc/:name", get(vnc_proxy::vnc_handler))
            .with_state(self.state.clone());

        let app = Router::new()
            .nest("/api", api_routes)
            .nest("/ws", ws_routes)
            .route("/health", get(|| async { "OK" }))
            .route("/metrics", get(prometheus_exporter::metrics_handler))
            .fallback_service(ServeDir::new("../web/dist"))
            .layer(cors);

        let addr = self.state.config.daemon.listen.parse()?;
        let listener = tokio::net::TcpListener::bind(&addr).await?;

        tracing::info!("Listening on {}", addr);

        axum::serve(listener, app).await?;

        Ok(())
    }
}
