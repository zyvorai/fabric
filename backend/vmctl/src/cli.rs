use anyhow::Result;
use clap::{Parser, Subcommand};
use reqwest::Client;
use serde_json::json;
use tabled::{Table, Tabled};
use vm_model::{CreateVMRequest, VM};

const API_BASE: &str = "http://localhost:8080/api";

#[derive(Parser)]
#[command(name = "vmctl")]
#[command(about = "vmspawnd command-line interface", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all VMs
    List,

    /// Get VM information
    Info { name: String },

    /// Create a new VM
    Create {
        name: String,
        #[arg(long)]
        image: String,
        #[arg(long, default_value = "2")]
        cpus: u32,
        #[arg(long, default_value = "2048")]
        memory: u64,
    },

    /// Start a VM
    Start { name: String },

    /// Stop a VM
    Stop { name: String },

    /// Restart a VM
    Restart { name: String },

    /// Delete a VM
    Delete { name: String },

    /// Get VM metrics
    Metrics { name: String },
}

#[derive(Tabled)]
struct VMRow {
    name: String,
    state: String,
    cpus: u32,
    memory: String,
}

impl Cli {
    pub async fn run(self) -> Result<()> {
        let client = Client::new();

        match self.command {
            Commands::List => {
                let vms: Vec<VM> = client
                    .get(format!("{}/vms", API_BASE))
                    .send()
                    .await?
                    .json()
                    .await?;

                if vms.is_empty() {
                    println!("No VMs found");
                    return Ok(());
                }

                let rows: Vec<VMRow> = vms
                    .into_iter()
                    .map(|vm| VMRow {
                        name: vm.name,
                        state: format!("{:?}", vm.state),
                        cpus: vm.cpus,
                        memory: format!("{}MB", vm.memory),
                    })
                    .collect();

                let table = Table::new(rows);
                println!("{}", table);
            }

            Commands::Info { name } => {
                let vm: VM = client
                    .get(format!("{}/vms/{}", API_BASE, name))
                    .send()
                    .await?
                    .json()
                    .await?;

                println!("Name:   {}", vm.name);
                println!("State:  {:?}", vm.state);
                println!("CPUs:   {}", vm.cpus);
                println!("Memory: {}MB", vm.memory);
                println!("Image:  {}", vm.image);
                if let Some(ip) = vm.ip {
                    println!("IP:     {}", ip);
                }
            }

            Commands::Create {
                name,
                image,
                cpus,
                memory,
            } => {
                let req = CreateVMRequest {
                    name: name.clone(),
                    image,
                    cpus,
                    memory,
                    disk: 20, // Default 20GB
                    hostname: None,
                    tags: None,
                };

                client
                    .post(format!("{}/vms", API_BASE))
                    .json(&req)
                    .send()
                    .await?;

                println!("VM '{}' created successfully", name);
            }

            Commands::Start { name } => {
                client
                    .post(format!("{}/vms/{}/start", API_BASE, name))
                    .send()
                    .await?;

                println!("VM '{}' started", name);
            }

            Commands::Stop { name } => {
                client
                    .post(format!("{}/vms/{}/stop", API_BASE, name))
                    .send()
                    .await?;

                println!("VM '{}' stopped", name);
            }

            Commands::Restart { name } => {
                client
                    .post(format!("{}/vms/{}/restart", API_BASE, name))
                    .send()
                    .await?;

                println!("VM '{}' restarted", name);
            }

            Commands::Delete { name } => {
                client
                    .delete(format!("{}/vms/{}", API_BASE, name))
                    .send()
                    .await?;

                println!("VM '{}' deleted", name);
            }

            Commands::Metrics { name } => {
                let metrics: serde_json::Value = client
                    .get(format!("{}/vms/{}/metrics", API_BASE, name))
                    .send()
                    .await?
                    .json()
                    .await?;

                println!("{}", serde_json::to_string_pretty(&metrics)?);
            }
        }

        Ok(())
    }
}
