// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use vmspawn_sdk::logs::LogQuery;
use vmspawn_sdk::{Client, ClientConfig};

#[derive(Debug, Parser)]
#[command(name = "machina-fabric", about = "Zyvor Fabric CLI for Machina v0.1")]
struct Cli {
    #[arg(long, short = 'c', default_value = "homelab")]
    cluster: String,

    #[arg(long)]
    token: Option<String>,

    #[arg(long)]
    user: Option<String>,

    #[arg(long)]
    password: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// GET /health
    Health,
    /// List VMs
    Vms {
        #[command(subcommand)]
        action: Option<VmAction>,
    },
    /// Recent VM lifecycle events
    Events,
    /// System or VM journal logs
    Logs {
        #[arg(long)]
        vm: Option<String>,
        #[arg(long, default_value_t = 50)]
        lines: u32,
    },
}

#[derive(Debug, Subcommand)]
enum VmAction {
    Metrics { name: String },
}

#[derive(Debug, Deserialize)]
struct ClustersFile {
    clusters: Vec<ClusterEntry>,
}

#[derive(Debug, Deserialize)]
struct ClusterEntry {
    name: String,
    endpoint: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let endpoint = resolve_endpoint(&cli.cluster)?;
    let token = cli.token.or_else(|| std::env::var("ZYVOR_FABRIC_TOKEN").ok());
    let user = cli.user.or_else(|| std::env::var("ZYVOR_FABRIC_USER").ok());
    let password = cli.password.or_else(|| std::env::var("ZYVOR_FABRIC_PASSWORD").ok());

    let mut client = Client::new(ClientConfig {
        endpoint,
        token: token.clone(),
    })?;

    if token.is_none() {
        if let (Some(user), Some(password)) = (&user, &password) {
            client.login(user, password).await?;
        }
    }

    match cli.command {
        Commands::Health => {
            println!("{}", client.health().await?);
        }
        Commands::Vms { action } => match action {
            None => {
                let vms = client.list_vms().await?;
                println!("{}", serde_json::to_string_pretty(&vms)?);
            }
            Some(VmAction::Metrics { name }) => {
                let m = client.vm_metrics(&name).await?;
                println!("{}", serde_json::to_string_pretty(&m.raw)?);
            }
        },
        Commands::Events => {
            let events = client.list_events().await?;
            println!("{}", serde_json::to_string_pretty(&events)?);
        }
        Commands::Logs { vm, lines } => {
            let q = LogQuery {
                lines: Some(lines),
                ..Default::default()
            };
            let resp = if let Some(vm) = vm {
                client.vm_logs(&vm, &q).await?
            } else {
                client.system_logs(&q).await?
            };
            for entry in resp.entries {
                println!("{} {}: {}", entry.timestamp, entry.unit, entry.message);
            }
        }
    }
    Ok(())
}

fn resolve_endpoint(cluster: &str) -> Result<String> {
    let path = clusters_path();
    if !path.exists() {
        bail!(
            "missing {:?}; copy integrations/machina/clusters.example.yaml to ~/.machina/clusters.yaml",
            path
        );
    }
    let raw = std::fs::read_to_string(&path)?;
    let file: ClustersFile = serde_yaml::from_str(&raw)?;
    let map: HashMap<_, _> = file
        .clusters
        .into_iter()
        .map(|c| (c.name, c.endpoint))
        .collect();
    map.get(cluster)
        .cloned()
        .with_context(|| format!("cluster '{cluster}' not in {}", path.display()))
}

fn clusters_path() -> PathBuf {
    if let Ok(p) = std::env::var("MACHINA_CLUSTERS") {
        return PathBuf::from(p);
    }
    home_dir().join(".machina/clusters.yaml")
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}
