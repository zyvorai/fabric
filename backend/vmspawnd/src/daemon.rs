use anyhow::Result;
use state_store::StateStore;
use vmspawnd::{config::Config, server::Server};

pub struct Daemon {
    config: Config,
    state: StateStore,
}

impl Daemon {
    pub fn new() -> Result<Self> {
        let config = Config::load()?;
        let state = StateStore::new(&config.storage.path)?;

        Ok(Self { config, state })
    }

    pub async fn start(self) -> Result<()> {
        tracing::info!("vmspawnd daemon starting on {}", self.config.daemon.listen);

        let server = Server::new(self.state, self.config)?;
        server.run().await
    }
}
