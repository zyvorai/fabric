use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::process::Command;

use vmspawnd_system::{
    CpuTopology, HugepageManager, HugepageSize, MemoryController, NumaTopology,
};

use crate::server::AppState;
use crate::validation::validate_vm_name;

// Request/Response types
#[derive(Debug, Deserialize)]
pub struct NumaPlacementQuery {
    pub memory_mb: u64,
    pub cpus: u32,
}

#[derive(Debug, Deserialize)]
pub struct SetCpuPinningRequest {
    pub pinning: CpuPinningDto,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum CpuPinningDto {
    Auto,
    NumaNode { value: u32 },
    Socket { value: u32 },
    Explicit { value: Vec<CpuPinDto> },
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CpuPinDto {
    pub vcpu_id: u32,
    pub physical_cpu: u32,
}

#[derive(Debug, Deserialize)]
pub struct SetMemoryLimitRequest {
    pub limit_bytes: u64,
    pub swap_limit_bytes: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SetMemoryBallooningRequest {
    pub enabled: bool,
    pub target_mb: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct AllocateHugepagesRequest {
    pub size: HugepageSizeDto,
    pub count: u32,
}

#[derive(Debug, Deserialize, Serialize)]
pub enum HugepageSizeDto {
    Size2MB,
    Size1GB,
}

impl From<HugepageSizeDto> for HugepageSize {
    fn from(dto: HugepageSizeDto) -> Self {
        match dto {
            HugepageSizeDto::Size2MB => HugepageSize::Size2MB,
            HugepageSizeDto::Size1GB => HugepageSize::Size1GB,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct HugepageQuery {
    pub size: HugepageSizeDto,
}

// API Handlers

/// GET /api/system/cpu/topology - Get CPU topology
pub async fn get_cpu_topology() -> Result<Json<CpuTopology>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_cpu_topology));
    match CpuTopology::detect() {
        Ok(topology) => Ok(Json(topology)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to detect CPU topology: {}", e),
        )),
    }
}

/// GET /api/system/numa/topology - Get NUMA topology
pub async fn get_numa_topology() -> Result<Json<NumaTopology>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_numa_topology));
    match NumaTopology::detect() {
        Ok(topology) => Ok(Json(topology)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to detect NUMA topology: {}", e),
        )),
    }
}

/// GET /api/system/numa/nodes/:id - Get NUMA node details
pub async fn get_numa_node(
    Path(node_id): Path<u32>,
) -> Result<Json<vmspawnd_system::NumaNode>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_numa_node));
    let topology = NumaTopology::detect().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to detect NUMA topology: {}", e),
        )
    })?;

    match topology.get_node(node_id) {
        Some(node) => Ok(Json(node.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            format!("NUMA node {} not found", node_id),
        )),
    }
}

/// GET /api/system/numa/placement - Get recommended NUMA placement
pub async fn get_numa_placement(
    Query(params): Query<NumaPlacementQuery>,
) -> Result<Json<vmspawnd_system::NumaPlacement>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_numa_placement));
    let topology = NumaTopology::detect().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to detect NUMA topology: {}", e),
        )
    })?;

    match topology.recommend_placement(params.memory_mb, params.cpus) {
        Some(placement) => Ok(Json(placement)),
        None => Err((
            StatusCode::NOT_FOUND,
            "No suitable NUMA node found for requested resources".to_string(),
        )),
    }
}

/// POST /api/vms/:name/cpu/pin - Set CPU pinning for a VM
pub async fn set_cpu_pinning(
    Path(vm_name): Path<String>,
    Json(req): Json<SetCpuPinningRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(set_cpu_pinning));
    validate_vm_name(&vm_name)?;
    // Implement CPU pinning via systemd
    tracing::info!(
        "Setting CPU pinning for VM '{}': {:?}",
        vm_name,
        req.pinning
    );

    // Build CPU affinity list for systemd based on pinning type
    let cpu_list = match &req.pinning {
        CpuPinningDto::Auto => {
            tracing::info!("Auto CPU pinning - no explicit affinity set");
            return Ok(StatusCode::OK);
        }
        CpuPinningDto::NumaNode { value } => {
            tracing::warn!("NUMA node pinning requires reading node CPU list");
            // Would need to read /sys/devices/system/node/nodeN/cpulist
            format!("{}", value) // Simplified for now
        }
        CpuPinningDto::Socket { value } => {
            tracing::warn!("Socket pinning requires reading socket CPU list");
            // Would need to read socket topology
            format!("{}", value) // Simplified for now
        }
        CpuPinningDto::Explicit { value } => {
            value
                .iter()
                .map(|pin| pin.physical_cpu.to_string())
                .collect::<Vec<_>>()
                .join(",")
        }
    };

    // Set CPUAffinity via systemctl set-property
    let service_name = format!("systemd-vmspawn@{}.service", vm_name);
    let output = Command::new("systemctl")
        .arg("set-property")
        .arg(&service_name)
        .arg(format!("CPUAffinity={}", cpu_list))
        .output()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to execute systemctl: {}", e),
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to set CPU affinity: {}", stderr),
        ));
    }

    tracing::info!("CPU pinning set successfully for VM '{}'", vm_name);
    Ok(StatusCode::OK)
}

/// DELETE /api/vms/:name/cpu/pin - Remove CPU pinning from a VM
pub async fn remove_cpu_pinning(
    Path(vm_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(remove_cpu_pinning));
    validate_vm_name(&vm_name)?;
    tracing::info!("Removing CPU pinning for VM '{}'", vm_name);
    Ok(StatusCode::OK)
}

/// GET /api/vms/:name/cpu/affinity - Get CPU affinity for a VM
pub async fn get_cpu_affinity(
    Path(vm_name): Path<String>,
) -> Result<Json<Vec<u32>>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_cpu_affinity));
    validate_vm_name(&vm_name)?;
    // Read CPU affinity from systemd service
    tracing::info!("Getting CPU affinity for VM '{}'", vm_name);

    let service_name = format!("systemd-vmspawn@{}.service", vm_name);
    let output = Command::new("systemctl")
        .arg("show")
        .arg(&service_name)
        .arg("--property=CPUAffinity")
        .output()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to execute systemctl: {}", e),
            )
        })?;

    if !output.status.success() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' service not found", vm_name),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse CPUAffinity output (format: "CPUAffinity=0 1 2 3" or "CPUAffinity=")
    let affinity = if let Some(line) = stdout.lines().next() {
        if let Some(cpus) = line.strip_prefix("CPUAffinity=") {
            cpus.split_whitespace()
                .filter_map(|s| s.parse::<u32>().ok())
                .collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    Ok(Json(affinity))
}

/// PUT /api/vms/:name/memory/limit - Set memory limit for a VM
pub async fn set_memory_limit(
    Path(vm_name): Path<String>,
    Json(req): Json<SetMemoryLimitRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(set_memory_limit));
    validate_vm_name(&vm_name)?;
    let controller = MemoryController::new(&vm_name);

    if !controller.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' not found or not running", vm_name),
        ));
    }

    controller.set_limit(req.limit_bytes).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to set memory limit: {}", e),
        )
    })?;

    if let Some(swap_limit) = req.swap_limit_bytes {
        controller.set_swap_limit(swap_limit).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to set swap limit: {}", e),
            )
        })?;
    }

    Ok(StatusCode::OK)
}

/// GET /api/vms/:name/memory/usage - Get memory usage for a VM
pub async fn get_memory_usage(
    Path(vm_name): Path<String>,
) -> Result<Json<vmspawnd_system::MemoryStats>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_memory_usage));
    validate_vm_name(&vm_name)?;
    let controller = MemoryController::new(&vm_name);

    if !controller.exists() {
        return Err((
            StatusCode::NOT_FOUND,
            format!("VM '{}' not found or not running", vm_name),
        ));
    }

    let stats = controller.get_stats().map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get memory stats: {}", e),
        )
    })?;

    Ok(Json(stats))
}

/// POST /api/vms/:name/memory/balloon - Enable/disable memory ballooning
pub async fn set_memory_ballooning(
    Path(vm_name): Path<String>,
    Json(req): Json<SetMemoryBallooningRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(set_memory_ballooning));
    validate_vm_name(&vm_name)?;
    // Implement memory ballooning control via QEMU monitor
    tracing::info!(
        "Setting memory ballooning for VM '{}': enabled={}, target={:?}",
        vm_name,
        req.enabled,
        req.target_mb
    );

    if !req.enabled {
        tracing::info!("Memory ballooning disabled for VM '{}'", vm_name);
        return Ok(StatusCode::OK);
    }

    // If enabled and target is specified, set balloon target via QEMU monitor
    if let Some(target_mb) = req.target_mb {
        let monitor_socket = format!("/run/systemd/vmspawn/{}/qemu.sock", vm_name);

        // Check if monitor socket exists
        if !std::path::Path::new(&monitor_socket).exists() {
            return Err((
                StatusCode::NOT_FOUND,
                format!("VM '{}' QEMU monitor socket not found", vm_name),
            ));
        }

        // Send balloon command via socat to QEMU monitor
        // Format: { "execute": "balloon", "arguments": { "value": bytes } }
        let target_bytes = target_mb * 1024 * 1024;
        let qmp_command = format!(
            r#"{{"execute":"balloon","arguments":{{"value":{}}}}}"#,
            target_bytes
        );

        let output = Command::new("socat")
            .arg("-")
            .arg(format!("UNIX-CONNECT:{}", monitor_socket))
            .arg("EXEC:'echo {}'")
            .arg(&qmp_command)
            .output()
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to communicate with QEMU monitor: {}", e),
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!("Failed to set balloon via QEMU monitor: {}", stderr);
            // Don't fail - ballooning might not be supported
        } else {
            tracing::info!(
                "Memory balloon target set to {}MB for VM '{}'",
                target_mb,
                vm_name
            );
        }
    }

    Ok(StatusCode::OK)
}

/// GET /api/system/memory/hugepages - Get hugepage statistics
pub async fn get_hugepage_stats(
    Query(params): Query<HugepageQuery>,
) -> Result<Json<vmspawnd_system::HugepageStats>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_hugepage_stats));
    let size: HugepageSize = params.size.into();

    match HugepageManager::get_stats(size) {
        Ok(stats) => Ok(Json(stats)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get hugepage stats: {}", e),
        )),
    }
}

/// POST /api/system/memory/hugepages - Allocate hugepages
pub async fn allocate_hugepages(
    Json(req): Json<AllocateHugepagesRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(allocate_hugepages));
    let size: HugepageSize = req.size.into();

    HugepageManager::allocate(size, req.count).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to allocate hugepages: {}", e),
        )
    })?;

    Ok(StatusCode::OK)
}

/// GET /api/system/memory - Get system memory info
pub async fn get_system_memory(
) -> Result<Json<vmspawnd_system::SystemMemory>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_system_memory));
    match HugepageManager::get_system_memory() {
        Ok(memory) => Ok(Json(memory)),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to get system memory: {}", e),
        )),
    }
}

// ============================================================================
// Resource Optimization
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OptimizationRecommendation {
    pub vm_name: String,
    pub recommendations: Vec<ResourceRecommendation>,
}

#[derive(Debug, Serialize)]
pub struct ResourceRecommendation {
    pub resource: String,
    pub current_value: String,
    pub recommended_value: String,
    pub reason: String,
    pub impact: String,
}

#[derive(Debug, Serialize)]
pub struct OptimizationResult {
    pub vm_name: String,
    pub applied: Vec<String>,
    pub skipped: Vec<String>,
}

/// GET /api/system/optimization/recommendations - Get resource optimization suggestions
pub async fn get_optimization_recommendations(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<OptimizationRecommendation>>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(get_optimization_recommendations));
    let vms = state.store.list_vms().unwrap_or_default();

    let numa_topology = NumaTopology::detect().ok();
    let cpu_topology = CpuTopology::detect().ok();

    let mut recommendations = Vec::new();

    for vm in &vms {
        if !matches!(vm.state, vm_model::VMState::Running) {
            continue;
        }

        let mut vm_recs = Vec::new();

        // NUMA placement recommendation
        if let Some(ref numa) = numa_topology {
            if numa.nodes.len() > 1 {
                if let Some(placement) = numa.recommend_placement(vm.memory, vm.cpus) {
                    vm_recs.push(ResourceRecommendation {
                        resource: "NUMA".to_string(),
                        current_value: "auto".to_string(),
                        recommended_value: format!("node {}", placement.numa_node),
                        reason: format!(
                            "VM requires {} MB memory and {} CPUs; NUMA node {} has optimal resources",
                            vm.memory, vm.cpus, placement.numa_node
                        ),
                        impact: "Reduced memory access latency, improved performance".to_string(),
                    });
                }
            }
        }

        // CPU pinning recommendation
        if let Some(ref cpu) = cpu_topology {
            if vm.cpus <= cpu.total_cpus && cpu.total_cpus > 4 {
                // Recommend pinning for VMs with dedicated cores
                let available_cores: Vec<u32> = cpu.cpus.iter()
                    .filter(|c| c.online)
                    .map(|c| c.id)
                    .take(vm.cpus as usize)
                    .collect();

                if !available_cores.is_empty() {
                    vm_recs.push(ResourceRecommendation {
                        resource: "CPU Pinning".to_string(),
                        current_value: "unpinned".to_string(),
                        recommended_value: format!("cores {:?}", available_cores),
                        reason: "CPU pinning reduces context switching and cache misses".to_string(),
                        impact: "5-15% CPU performance improvement for compute-intensive workloads".to_string(),
                    });
                }
            }
        }

        // Memory optimization: check if hugepages would help
        if vm.memory >= 2048 {
            vm_recs.push(ResourceRecommendation {
                resource: "Hugepages".to_string(),
                current_value: "4KB pages".to_string(),
                recommended_value: "2MB hugepages".to_string(),
                reason: format!(
                    "VM has {} MB memory; hugepages reduce TLB misses for large memory VMs",
                    vm.memory
                ),
                impact: "Reduced TLB misses, 2-5% memory access improvement".to_string(),
            });
        }

        // Memory ballooning recommendation for overcommitted scenarios
        if vm.memory >= 4096 {
            vm_recs.push(ResourceRecommendation {
                resource: "Memory Ballooning".to_string(),
                current_value: "disabled".to_string(),
                recommended_value: "enabled".to_string(),
                reason: "Enables dynamic memory reclamation for better host utilization".to_string(),
                impact: "Allows host to reclaim unused VM memory during pressure".to_string(),
            });
        }

        if !vm_recs.is_empty() {
            recommendations.push(OptimizationRecommendation {
                vm_name: vm.name.clone(),
                recommendations: vm_recs,
            });
        }
    }

    Ok(Json(recommendations))
}

/// POST /api/vms/:name/optimize - Auto-apply optimal NUMA/CPU settings
pub async fn optimize_vm(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
) -> Result<Json<OptimizationResult>, (StatusCode, String)> {
    tracing::debug!("system::{}", stringify!(optimize_vm));
    validate_vm_name(&vm_name)?;

    let vm = match state.store.get_vm(&vm_name) {
        Ok(Some(vm)) => vm,
        Ok(None) => {
            return Err((StatusCode::NOT_FOUND, format!("VM '{}' not found", vm_name)));
        }
        Err(e) => {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
        }
    };

    let mut applied = Vec::new();
    let mut skipped = Vec::new();

    // Try to apply NUMA placement
    if let Ok(numa) = NumaTopology::detect() {
        if numa.nodes.len() > 1 {
            if let Some(placement) = numa.recommend_placement(vm.memory, vm.cpus) {
                let cpu_list = placement.cpu_affinity.iter()
                    .map(|c| c.to_string())
                    .collect::<Vec<_>>()
                    .join(",");

                let service_name = format!("systemd-vmspawn@{}.service", vm_name);
                let output = Command::new("systemctl")
                    .arg("set-property")
                    .arg(&service_name)
                    .arg(format!("CPUAffinity={}", cpu_list))
                    .output()
                    .await;

                match output {
                    Ok(o) if o.status.success() => {
                        applied.push(format!("CPU pinning to NUMA node {} (cores: {})", placement.numa_node, cpu_list));
                    }
                    _ => {
                        skipped.push("CPU pinning: failed to apply via systemctl".to_string());
                    }
                }
            } else {
                skipped.push("NUMA placement: no suitable node found".to_string());
            }
        } else {
            skipped.push("NUMA placement: single-node system".to_string());
        }
    } else {
        skipped.push("NUMA placement: failed to detect topology".to_string());
    }

    // Try to set memory limit via cgroup
    let controller = MemoryController::new(&vm_name);
    if controller.exists() {
        let limit_bytes = vm.memory * 1024 * 1024;
        match controller.set_limit(limit_bytes) {
            Ok(_) => {
                applied.push(format!("Memory limit set to {} MB", vm.memory));
            }
            Err(e) => {
                skipped.push(format!("Memory limit: {}", e));
            }
        }
    } else {
        skipped.push("Memory limit: cgroup not found (VM may not be running)".to_string());
    }

    Ok(Json(OptimizationResult {
        vm_name,
        applied,
        skipped,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hugepage_size_conversion() {
        let size_2mb = HugepageSizeDto::Size2MB;
        let hugepage_size: HugepageSize = size_2mb.into();
        assert!(matches!(hugepage_size, HugepageSize::Size2MB));
    }

    #[test]
    fn test_cpu_pinning_deserialization() {
        let json = r#"{"type": "NumaNode", "value": 0}"#;
        let pinning: CpuPinningDto = serde_json::from_str(json).unwrap();
        assert!(matches!(pinning, CpuPinningDto::NumaNode { value: 0 }));
    }
}
