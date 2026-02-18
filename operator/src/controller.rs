use anyhow::Result;
use futures::StreamExt;
use kube::{
    api::{Api, ListParams},
    runtime::{controller::Action, watcher::Config, Controller},
    Client, ResourceExt,
};
use std::sync::Arc;
use std::time::Duration;

use crate::{crd::VirtualMachine, reconcile};

pub struct Context {
    pub client: Client,
    pub vmspawnd_url: String,
}

pub async fn run(client: Client) -> Result<()> {
    let vms = Api::<VirtualMachine>::all(client.clone());

    let vmspawnd_url = std::env::var("VMSPAWND_URL")
        .unwrap_or_else(|_| "http://vmspawnd:8080".to_string());

    let context = Arc::new(Context {
        client: client.clone(),
        vmspawnd_url,
    });

    Controller::new(vms, Config::default())
        .run(reconcile::reconcile, reconcile::error_policy, context)
        .for_each(|res| async move {
            match res {
                Ok(o) => tracing::info!("Reconciled: {:?}", o),
                Err(e) => tracing::error!("Reconcile error: {:?}", e),
            }
        })
        .await;

    Ok(())
}
