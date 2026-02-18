use anyhow::Result;
use reqwest::Client;
use vm_model::VM;

const API_BASE: &str = "http://localhost:8080/api";

pub struct App {
    pub vms: Vec<VM>,
    pub selected: usize,
    client: Client,
}

impl App {
    pub fn new() -> Self {
        Self {
            vms: Vec::new(),
            selected: 0,
            client: Client::new(),
        }
    }

    pub async fn refresh(&mut self) -> Result<()> {
        self.vms = self
            .client
            .get(format!("{}/vms", API_BASE))
            .send()
            .await?
            .json()
            .await?;

        if self.selected >= self.vms.len() && !self.vms.is_empty() {
            self.selected = self.vms.len() - 1;
        }

        Ok(())
    }

    pub fn next(&mut self) {
        if !self.vms.is_empty() {
            self.selected = (self.selected + 1) % self.vms.len();
        }
    }

    pub fn previous(&mut self) {
        if !self.vms.is_empty() {
            if self.selected > 0 {
                self.selected -= 1;
            } else {
                self.selected = self.vms.len() - 1;
            }
        }
    }

    pub async fn start_selected(&mut self) -> Result<()> {
        if let Some(vm) = self.vms.get(self.selected) {
            self.client
                .post(format!("{}/vms/{}/start", API_BASE, vm.name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn stop_selected(&mut self) -> Result<()> {
        if let Some(vm) = self.vms.get(self.selected) {
            self.client
                .post(format!("{}/vms/{}/stop", API_BASE, vm.name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn delete_selected(&mut self) -> Result<()> {
        if let Some(vm) = self.vms.get(self.selected) {
            self.client
                .delete(format!("{}/vms/{}", API_BASE, vm.name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }
}
