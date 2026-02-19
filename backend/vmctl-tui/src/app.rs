use anyhow::Result;
use reqwest::Client;
use std::collections::VecDeque;
use std::time::Instant;
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
    VMDetail,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StatusLevel {
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone)]
pub struct StatusMessage {
    pub text: String,
    pub level: StatusLevel,
    pub created: Instant,
}

#[derive(Debug, Clone)]
pub enum PendingAction {
    DeleteVM(String),
    BulkDelete(Vec<String>),
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
    pub status_messages: VecDeque<StatusMessage>,
    pub pending_action: Option<PendingAction>,
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
            status_messages: VecDeque::new(),
            pending_action: None,
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    pub fn add_status(&mut self, text: String, level: StatusLevel) {
        self.status_messages.push_back(StatusMessage {
            text,
            level,
            created: Instant::now(),
        });
        // Keep at most 5 messages
        while self.status_messages.len() > 5 {
            self.status_messages.pop_front();
        }
    }

    pub fn clear_expired_status(&mut self) {
        let now = Instant::now();
        self.status_messages
            .retain(|m| now.duration_since(m.created).as_secs() < 5);
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
        let mut success = 0;
        let mut failed = Vec::new();
        for &idx in &self.selected_vms.clone() {
            if let Some(vm) = filtered.get(idx) {
                let vm_name = vm.name.clone();
                match self.client
                    .post(format!("{}/vms/{}/start", API_BASE, vm_name))
                    .send()
                    .await
                {
                    Ok(res) if res.status().is_success() => success += 1,
                    Ok(res) => failed.push(format!("{} ({})", vm_name, res.status())),
                    Err(e) => failed.push(format!("{} ({})", vm_name, e)),
                }
            }
        }
        self.refresh().await?;
        self.selected_vms.clear();

        if failed.is_empty() {
            self.add_status(format!("Started {} VMs", success), StatusLevel::Success);
        } else {
            self.add_status(
                format!("Started {} VMs, {} failed: {}", success, failed.len(), failed.join(", ")),
                StatusLevel::Warning,
            );
        }
        Ok(())
    }

    pub async fn bulk_stop(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        let mut success = 0;
        let mut failed = Vec::new();
        for &idx in &self.selected_vms.clone() {
            if let Some(vm) = filtered.get(idx) {
                let vm_name = vm.name.clone();
                match self.client
                    .post(format!("{}/vms/{}/stop", API_BASE, vm_name))
                    .send()
                    .await
                {
                    Ok(res) if res.status().is_success() => success += 1,
                    Ok(res) => failed.push(format!("{} ({})", vm_name, res.status())),
                    Err(e) => failed.push(format!("{} ({})", vm_name, e)),
                }
            }
        }
        self.refresh().await?;
        self.selected_vms.clear();

        if failed.is_empty() {
            self.add_status(format!("Stopped {} VMs", success), StatusLevel::Success);
        } else {
            self.add_status(
                format!("Stopped {} VMs, {} failed: {}", success, failed.len(), failed.join(", ")),
                StatusLevel::Warning,
            );
        }
        Ok(())
    }

    pub async fn bulk_delete(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        let names: Vec<String> = self.selected_vms.iter()
            .filter_map(|&idx| filtered.get(idx).map(|vm| vm.name.clone()))
            .collect();
        self.pending_action = Some(PendingAction::BulkDelete(names));
        Ok(())
    }

    pub async fn confirm_pending_action(&mut self) -> Result<()> {
        let action = match self.pending_action.take() {
            Some(a) => a,
            None => return Ok(()),
        };

        match action {
            PendingAction::DeleteVM(name) => {
                match self.client
                    .delete(format!("{}/vms/{}", API_BASE, name))
                    .send()
                    .await
                {
                    Ok(res) if res.status().is_success() => {
                        self.add_status(format!("Deleted VM '{}'", name), StatusLevel::Success);
                    }
                    Ok(res) => {
                        self.add_status(
                            format!("Failed to delete '{}': {}", name, res.status()),
                            StatusLevel::Error,
                        );
                    }
                    Err(e) => {
                        self.add_status(
                            format!("Failed to delete '{}': {}", name, e),
                            StatusLevel::Error,
                        );
                    }
                }
            }
            PendingAction::BulkDelete(names) => {
                let mut success = 0;
                let mut failed = Vec::new();
                for name in &names {
                    match self.client
                        .delete(format!("{}/vms/{}", API_BASE, name))
                        .send()
                        .await
                    {
                        Ok(res) if res.status().is_success() => success += 1,
                        Ok(res) => failed.push(format!("{} ({})", name, res.status())),
                        Err(e) => failed.push(format!("{} ({})", name, e)),
                    }
                }
                self.selected_vms.clear();
                if failed.is_empty() {
                    self.add_status(format!("Deleted {} VMs", success), StatusLevel::Success);
                } else {
                    self.add_status(
                        format!("Deleted {} VMs, {} failed: {}", success, failed.len(), failed.join(", ")),
                        StatusLevel::Warning,
                    );
                }
            }
        }

        self.refresh().await?;
        Ok(())
    }

    pub fn cancel_pending_action(&mut self) {
        self.pending_action = None;
        self.add_status("Action cancelled".to_string(), StatusLevel::Warning);
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

        self.update_metrics_history().await;

        Ok(())
    }

    async fn update_metrics_history(&mut self) {
        // Try to fetch real system performance data from the API
        match self.client
            .get(format!("{}/analytics/system", API_BASE))
            .send()
            .await
        {
            Ok(res) if res.status().is_success() => {
                if let Ok(data) = res.json::<Vec<serde_json::Value>>().await {
                    if let Some(latest) = data.last() {
                        let cpu = latest.get("total_cpu_usage")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        let mem = latest.get("total_memory_usage")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);

                        self.cpu_history.rotate_left(1);
                        self.cpu_history[59] = cpu;
                        self.memory_history.rotate_left(1);
                        self.memory_history[59] = mem;
                        return;
                    }
                }
            }
            _ => {}
        }

        // Fallback: calculate from VM count (basic approximation)
        let running = self.vms.iter()
            .filter(|v| v.state == vm_model::VMState::Running)
            .count() as f64;
        let total = self.vms.len().max(1) as f64;
        let cpu_estimate = (running / total) * 50.0;
        let mem_estimate = (running / total) * 60.0;

        self.cpu_history.rotate_left(1);
        self.cpu_history[59] = cpu_estimate;
        self.memory_history.rotate_left(1);
        self.memory_history[59] = mem_estimate;

        self.network_rx_history.rotate_left(1);
        self.network_rx_history[59] = running * 10.0;
        self.network_tx_history.rotate_left(1);
        self.network_tx_history[59] = running * 5.0;
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
            View::VMDetail => View::VMs,
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
            View::VMDetail => View::VMs,
        };
    }

    pub fn switch_to_view(&mut self, view: View) {
        self.current_view = view;
    }

    pub fn open_selected_detail(&mut self) {
        if !self.filtered_vms().is_empty() {
            self.current_view = View::VMDetail;
        }
    }

    pub async fn start_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            match self.client
                .post(format!("{}/vms/{}/start", API_BASE, vm_name))
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => {
                    self.add_status(format!("Started VM '{}'", vm_name), StatusLevel::Success);
                }
                Ok(res) => {
                    self.add_status(
                        format!("Failed to start '{}': {}", vm_name, res.status()),
                        StatusLevel::Error,
                    );
                }
                Err(e) => {
                    self.add_status(
                        format!("Failed to start '{}': {}", vm_name, e),
                        StatusLevel::Error,
                    );
                }
            }
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn stop_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            match self.client
                .post(format!("{}/vms/{}/stop", API_BASE, vm_name))
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => {
                    self.add_status(format!("Stopped VM '{}'", vm_name), StatusLevel::Success);
                }
                Ok(res) => {
                    self.add_status(
                        format!("Failed to stop '{}': {}", vm_name, res.status()),
                        StatusLevel::Error,
                    );
                }
                Err(e) => {
                    self.add_status(
                        format!("Failed to stop '{}': {}", vm_name, e),
                        StatusLevel::Error,
                    );
                }
            }
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn restart_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            match self.client
                .post(format!("{}/vms/{}/restart", API_BASE, vm_name))
                .send()
                .await
            {
                Ok(res) if res.status().is_success() => {
                    self.add_status(format!("Restarted VM '{}'", vm_name), StatusLevel::Success);
                }
                Ok(res) => {
                    self.add_status(
                        format!("Failed to restart '{}': {}", vm_name, res.status()),
                        StatusLevel::Error,
                    );
                }
                Err(e) => {
                    self.add_status(
                        format!("Failed to restart '{}': {}", vm_name, e),
                        StatusLevel::Error,
                    );
                }
            }
            self.refresh().await?;
        }
        Ok(())
    }

    pub async fn delete_selected(&mut self) -> Result<()> {
        let filtered = self.filtered_vms();
        if let Some(vm) = filtered.get(self.selected) {
            let vm_name = vm.name.clone();
            self.pending_action = Some(PendingAction::DeleteVM(vm_name));
        }
        Ok(())
    }
}
