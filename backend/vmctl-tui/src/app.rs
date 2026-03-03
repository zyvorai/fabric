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
    NetSecurity,
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
    pub cpu_history: Vec<f64>,
    pub memory_history: Vec<f64>,
    pub network_rx_history: Vec<f64>,
    pub network_tx_history: Vec<f64>,
    pub bulk_mode: bool,
    pub selected_vms: Vec<usize>,
    pub status_messages: VecDeque<StatusMessage>,
    pub pending_action: Option<PendingAction>,
    // Network security data
    pub net_policies: Vec<serde_json::Value>,
    pub fw_profiles: Vec<serde_json::Value>,
    pub services: Vec<serde_json::Value>,
    pub qos_policies: Vec<serde_json::Value>,
    pub vpn_tunnels: Vec<serde_json::Value>,
    pub mirror_sessions: Vec<serde_json::Value>,
    pub nat_rules: Vec<serde_json::Value>,
    pub monitor_policies: Vec<serde_json::Value>,
    pub dns_zones: Vec<serde_json::Value>,
    pub netsec_tab: usize,
    pub netsec_selected: usize,
    // Storage / Ceph data
    pub storage_pools: Vec<serde_json::Value>,
    pub ceph_images: Vec<String>,
    pub ceph_health: Option<serde_json::Value>,
    pub storage_selected: usize,
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
            cpu_history: vec![0.0; 60],
            memory_history: vec![0.0; 60],
            network_rx_history: vec![0.0; 60],
            network_tx_history: vec![0.0; 60],
            bulk_mode: false,
            selected_vms: Vec::new(),
            status_messages: VecDeque::new(),
            pending_action: None,
            net_policies: Vec::new(),
            fw_profiles: Vec::new(),
            services: Vec::new(),
            qos_policies: Vec::new(),
            vpn_tunnels: Vec::new(),
            mirror_sessions: Vec::new(),
            nat_rules: Vec::new(),
            monitor_policies: Vec::new(),
            dns_zones: Vec::new(),
            netsec_tab: 0,
            netsec_selected: 0,
            storage_pools: Vec::new(),
            ceph_images: Vec::new(),
            ceph_health: None,
            storage_selected: 0,
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
        self.refresh_netsec().await;
        self.refresh_storage().await;

        Ok(())
    }

    async fn refresh_storage(&mut self) {
        self.storage_pools = self.fetch_list("/storage/pools").await;

        // Find first Ceph pool and load its images/health
        let ceph_pool = self.storage_pools.iter().find(|p| {
            if let Some(pt) = p.get("pool_type") {
                if pt.is_object() {
                    return pt.get("Ceph").is_some();
                }
            }
            false
        }).and_then(|p| p.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()));

        if let Some(ref pool_name) = ceph_pool {
            self.ceph_images = match self.client
                .get(format!("{}/storage/pools/{}/images", API_BASE, pool_name))
                .send().await
            {
                Ok(res) if res.status().is_success() => res.json().await.unwrap_or_default(),
                _ => Vec::new(),
            };
            self.ceph_health = match self.client
                .get(format!("{}/storage/pools/{}/health", API_BASE, pool_name))
                .send().await
            {
                Ok(res) if res.status().is_success() => res.json().await.ok(),
                _ => None,
            };
        }
    }

    async fn fetch_list(&self, path: &str) -> Vec<serde_json::Value> {
        match self.client.get(format!("{}{}", API_BASE, path)).send().await {
            Ok(res) if res.status().is_success() => {
                res.json().await.unwrap_or_default()
            }
            _ => Vec::new(),
        }
    }

    async fn refresh_netsec(&mut self) {
        self.net_policies = self.fetch_list("/network-policies").await;
        self.fw_profiles = self.fetch_list("/firewall-profiles").await;
        self.services = self.fetch_list("/services").await;
        self.qos_policies = self.fetch_list("/qos-policies").await;
        self.vpn_tunnels = self.fetch_list("/vpn-tunnels").await;
        self.mirror_sessions = self.fetch_list("/mirror-sessions").await;
        self.nat_rules = self.fetch_list("/nat-rules").await;
        self.monitor_policies = self.fetch_list("/monitor-policies").await;
        self.dns_zones = self.fetch_list("/dns-zones").await;
    }

    pub fn netsec_tab_names(&self) -> Vec<&str> {
        vec!["Policies", "Firewall", "Services", "QoS", "DNS", "VPN", "Mirror", "NAT", "Monitor"]
    }

    pub fn netsec_current_items(&self) -> &[serde_json::Value] {
        match self.netsec_tab {
            0 => &self.net_policies,
            1 => &self.fw_profiles,
            2 => &self.services,
            3 => &self.qos_policies,
            4 => &self.dns_zones,
            5 => &self.vpn_tunnels,
            6 => &self.mirror_sessions,
            7 => &self.nat_rules,
            8 => &self.monitor_policies,
            _ => &self.net_policies,
        }
    }

    pub fn netsec_next_tab(&mut self) {
        self.netsec_tab = (self.netsec_tab + 1) % 9;
        self.netsec_selected = 0;
    }

    pub fn netsec_prev_tab(&mut self) {
        self.netsec_tab = if self.netsec_tab == 0 { 8 } else { self.netsec_tab - 1 };
        self.netsec_selected = 0;
    }

    pub fn netsec_next_item(&mut self) {
        let len = self.netsec_current_items().len();
        if len > 0 {
            self.netsec_selected = (self.netsec_selected + 1) % len;
        }
    }

    pub fn netsec_prev_item(&mut self) {
        let len = self.netsec_current_items().len();
        if len > 0 {
            self.netsec_selected = if self.netsec_selected == 0 { len - 1 } else { self.netsec_selected - 1 };
        }
    }

    pub async fn netsec_sync(&mut self) {
        let path = match self.netsec_tab {
            0 => "/network-policies/sync",
            1 => "/firewall/sync",
            2 => "/services/sync",
            3 => "/qos-policies/sync",
            4 => "/dns-policies/sync",
            5 => "/vpn-tunnels/sync",
            6 => "/mirror-sessions/sync",
            7 => "/nat-rules/sync",
            8 => "/monitor-policies/sync",
            _ => return,
        };
        match self.client.post(format!("{}{}", API_BASE, path)).send().await {
            Ok(res) if res.status().is_success() => {
                self.add_status("Sync completed".to_string(), StatusLevel::Success);
            }
            Ok(res) => {
                self.add_status(format!("Sync failed: {}", res.status()), StatusLevel::Error);
            }
            Err(e) => {
                self.add_status(format!("Sync error: {}", e), StatusLevel::Error);
            }
        }
        self.refresh_netsec().await;
    }

    pub async fn netsec_delete_selected(&mut self) {
        let items = self.netsec_current_items().to_vec();
        let item = match items.get(self.netsec_selected) {
            Some(i) => i.clone(),
            None => return,
        };
        let id = match item.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => return,
        };
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
        let path = match self.netsec_tab {
            0 => format!("/network-policies/{}", id),
            1 => format!("/firewall-profiles/{}", id),
            2 => format!("/services/{}", id),
            3 => format!("/qos-policies/{}", id),
            4 => format!("/dns-zones/{}", id),
            5 => format!("/vpn-tunnels/{}", id),
            6 => format!("/mirror-sessions/{}", id),
            7 => format!("/nat-rules/{}", id),
            8 => format!("/monitor-policies/{}", id),
            _ => return,
        };
        match self.client.delete(format!("{}{}", API_BASE, path)).send().await {
            Ok(res) if res.status().is_success() => {
                self.add_status(format!("Deleted '{}'", name), StatusLevel::Success);
            }
            Ok(res) => {
                self.add_status(format!("Delete failed: {}", res.status()), StatusLevel::Error);
            }
            Err(e) => {
                self.add_status(format!("Delete error: {}", e), StatusLevel::Error);
            }
        }
        self.refresh_netsec().await;
        let len = self.netsec_current_items().len();
        if self.netsec_selected >= len && len > 0 {
            self.netsec_selected = len - 1;
        }
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
            View::Network => View::NetSecurity,
            View::NetSecurity => View::Storage,
            View::Storage => View::Help,
            View::Help => View::Dashboard,
            View::VMDetail => View::VMs,
        };
    }

    pub fn previous_view(&mut self) {
        self.current_view = match self.current_view {
            View::Dashboard => View::Help,
            View::Help => View::Storage,
            View::Storage => View::NetSecurity,
            View::NetSecurity => View::Network,
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
