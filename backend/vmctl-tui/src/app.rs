use anyhow::Result;
use reqwest::Client;
use vm_model::VM;

const API_BASE: &str = "http://localhost:8080/api";

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum View {
    Dashboard,
    VMs,
    Logs,
    Metrics,
    Network,
    Storage,
    Help,
}

pub struct App {
    pub vms: Vec<VM>,
    pub selected: usize,
    pub current_view: View,
    pub search_query: String,
    pub search_mode: bool,
    pub show_help: bool,
    pub cpu_history: Vec<f64>,
    pub memory_history: Vec<f64>,
    pub network_rx_history: Vec<f64>,
    pub network_tx_history: Vec<f64>,
    pub bulk_mode: bool,
    pub selected_vms: Vec<usize>,
    client: Client,
}

impl App {
    pub fn new() -> Self {
        Self {
            vms: Vec::new(),
            selected: 0,
            current_view: View::Dashboard,
            search_query: String::new(),
            search_mode: false,
            show_help: false,
            cpu_history: vec![0.0; 60],
            memory_history: vec![0.0; 60],
            network_rx_history: vec![0.0; 60],
            network_tx_history: vec![0.0; 60],
            bulk_mode: false,
            selected_vms: Vec::new(),
            client: Client::new(),
        }
    }

    pub fn toggle_bulk_mode(&mut self) {
        self.bulk_mode = !self.bulk_mode;
        if !self.bulk_mode {
            self.selected_vms.clear();
        }
    }

    pub fn toggle_vm_selection(&mut self) {
        let filtered = self.filtered_vms();
        if self.selected < filtered.len() {
            if self.selected_vms.contains(&self.selected) {
                self.selected_vms.retain(|&x| x != self.selected);
            } else {
                self.selected_vms.push(self.selected);
            }
        }
    }

    pub fn select_all(&mut self) {
        let filtered = self.filtered_vms();
        self.selected_vms = (0..filtered.len()).collect();
    }

    pub fn deselect_all(&mut self) {
        self.selected_vms.clear();
    }

    pub async fn bulk_start(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        for &idx in &self.selected_vms {
            if let Some(vm) = filtered.get(idx) {
                let vm_name = vm.name.clone();
                let _ = self.client
                    .post(format!("{}/vms/{}/start", API_BASE, vm_name))
                    .send()
                    .await;
            }
        }
        self.refresh().await?;
        self.selected_vms.clear();
        Ok(())
    }

    pub async fn bulk_stop(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        for &idx in &self.selected_vms {
            if let Some(vm) = filtered.get(idx) {
                let vm_name = vm.name.clone();
                let _ = self.client
                    .post(format!("{}/vms/{}/stop", API_BASE, vm_name))
                    .send()
                    .await;
            }
        }
        self.refresh().await?;
        self.selected_vms.clear();
        Ok(())
    }

    pub async fn bulk_delete(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        for &idx in &self.selected_vms {
            if let Some(vm) = filtered.get(idx) {
                let vm_name = vm.name.clone();
                let _ = self.client
                    .delete(format!("{}/vms/{}", API_BASE, vm_name))
                    .send()
                    .await;
            }
        }
        self.refresh().await?;
        self.selected_vms.clear();
        Ok(())
    }

    pub fn filtered_vms(&self) -> Vec<&VM> {
        if self.search_query.is_empty() {
            self.vms.iter().collect()
        } else {
            self.vms
                .iter()
                .filter(|vm| {
                    vm.name.to_lowercase().contains(&self.search_query.to_lowercase())
                })
                .collect()
        }
    }

    pub fn clear_search(&mut self) {
        self.search_query.clear();
        self.search_mode = false;
        self.selected = 0;
    }

    pub fn enter_search_mode(&mut self) {
        self.search_mode = true;
        self.search_query.clear();
    }

    pub fn add_search_char(&mut self, c: char) {
        self.search_query.push(c);
        self.selected = 0;
    }

    pub fn delete_search_char(&mut self) {
        self.search_query.pop();
        self.selected = 0;
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

        // Update metrics history (simulated for now)
        self.update_metrics_history();

        Ok(())
    }

    fn update_metrics_history(&mut self) {
        use rand::Rng;
        let mut rng = rand::thread_rng();

        // Shift history and add new values
        self.cpu_history.rotate_left(1);
        self.cpu_history[59] = rng.gen_range(20.0..80.0);

        self.memory_history.rotate_left(1);
        self.memory_history[59] = rng.gen_range(30.0..70.0);

        self.network_rx_history.rotate_left(1);
        self.network_rx_history[59] = rng.gen_range(0.0..100.0);

        self.network_tx_history.rotate_left(1);
        self.network_tx_history[59] = rng.gen_range(0.0..100.0);
    }

    pub fn next(&mut self) {
        let filtered = self.filtered_vms();
        if !filtered.is_empty() {
            self.selected = (self.selected + 1) % filtered.len();
        }
    }

    pub fn previous(&mut self) {
        let filtered = self.filtered_vms();
        if !filtered.is_empty() {
            if self.selected > 0 {
                self.selected -= 1;
            } else {
                self.selected = filtered.len() - 1;
            }
        }
    }

    pub fn next_view(&mut self) {
        self.current_view = match self.current_view {
            View::Dashboard => View::VMs,
            View::VMs => View::Logs,
            View::Logs => View::Metrics,
            View::Metrics => View::Network,
            View::Network => View::Storage,
            View::Storage => View::Help,
            View::Help => View::Dashboard,
        };
    }

    pub fn previous_view(&mut self) {
        self.current_view = match self.current_view {
            View::Dashboard => View::Help,
            View::Help => View::Storage,
            View::Storage => View::Network,
            View::Network => View::Metrics,
            View::Metrics => View::Logs,
            View::Logs => View::VMs,
            View::VMs => View::Dashboard,
        };
    }

    pub fn switch_to_view(&mut self, view: View) {
        self.current_view = view;
    }

    pub async fn start_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            self.client
                .post(format!("{}/vms/{}/start", API_BASE, vm_name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn stop_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            self.client
                .post(format!("{}/vms/{}/stop", API_BASE, vm_name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn restart_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            self.client
                .post(format!("{}/vms/{}/restart", API_BASE, vm_name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn delete_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            self.client
                .delete(format!("{}/vms/{}", API_BASE, vm_name))
                .send()
                .await?;
            self.refresh().await?;
        }
        Ok(())
    }
}
