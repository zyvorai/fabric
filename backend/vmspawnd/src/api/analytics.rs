use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{DateTime, Utc, Duration};

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub timestamp: DateTime<Utc>,
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub disk_io_read: u64,
    pub disk_io_write: u64,
    pub network_rx: u64,
    pub network_tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMPerformance {
    pub vm_name: String,
    pub metrics: Vec<PerformanceMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPerformance {
    pub timestamp: DateTime<Utc>,
    pub total_vms: u32,
    pub running_vms: u32,
    pub total_cpu_usage: f64,
    pub total_memory_usage: f64,
    pub total_network_rx: u64,
    pub total_network_tx: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InsightType {
    HighCpu,
    HighMemory,
    HighDiskIo,
    HighNetwork,
    Underutilized,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceInsight {
    #[serde(rename = "type")]
    pub insight_type: InsightType,
    pub vm_name: String,
    pub resource: String,
    pub value: f64,
    pub threshold: f64,
    pub severity: Severity,
    pub recommendation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopVMResource {
    pub vm_name: String,
    pub value: f64,
}

#[derive(Debug, Deserialize)]
pub struct TimeRangeQuery {
    #[serde(default = "default_time_range")]
    pub range: String,
}

#[derive(Debug, Deserialize)]
pub struct TopResourceQuery {
    pub resource: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub range: String,
    #[serde(default = "default_export_format")]
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUtilization {
    pub cpu_utilization: f64,
    pub memory_utilization: f64,
    pub disk_utilization: f64,
    pub network_utilization: f64,
}

fn default_time_range() -> String {
    "24h".to_string()
}

fn default_limit() -> usize {
    10
}

fn default_export_format() -> String {
    "pdf".to_string()
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_time_range(range: &str) -> Duration {
    match range {
        "1h" => Duration::hours(1),
        "6h" => Duration::hours(6),
        "24h" => Duration::hours(24),
        "7d" => Duration::days(7),
        "30d" => Duration::days(30),
        _ => Duration::hours(24),
    }
}

fn generate_mock_metrics(count: usize, interval_minutes: i64) -> Vec<PerformanceMetrics> {
    let mut metrics = Vec::new();
    let now = Utc::now();

    for i in 0..count {
        let timestamp = now - Duration::minutes(i as i64 * interval_minutes);

        // Generate realistic-looking metrics with some variance
        let t = (i as f64 * 0.1).sin();
        let cpu_usage = 45.0 + (t * 20.0);
        let memory_usage = 60.0 + (t * 15.0);
        let disk_io_read = 1024 * 1024 * (100 + (t * 50.0) as u64);
        let disk_io_write = 1024 * 1024 * (50 + (t * 25.0) as u64);
        let network_rx = 1024 * 1024 * (200 + (t * 100.0) as u64);
        let network_tx = 1024 * 1024 * (150 + (t * 75.0) as u64);

        metrics.push(PerformanceMetrics {
            timestamp,
            cpu_usage: cpu_usage.max(0.0).min(100.0),
            memory_usage: memory_usage.max(0.0).min(100.0),
            disk_io_read,
            disk_io_write,
            network_rx,
            network_tx,
        });
    }

    metrics.reverse();
    metrics
}

// ============================================================================
// Analytics Handlers
// ============================================================================

pub async fn get_vm_performance(
    State(state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Query(query): Query<TimeRangeQuery>,
) -> Result<Json<VMPerformance>, StatusCode> {
    // Try to load real metrics from state store
    let metrics_key = format!("metrics/vm/{}/{}", vm_name, query.range);
    let metrics = if let Ok(Some(stored_performance)) = state.store.get_entity::<VMPerformance>("performance", &metrics_key) {
        // Use stored metrics
        tracing::debug!("Loaded {} stored metrics for VM {}", stored_performance.metrics.len(), vm_name);
        stored_performance.metrics
    } else {
        // Fall back to mock data for demonstration
        tracing::debug!("No stored metrics found for VM {}, using mock data", vm_name);

        let duration = parse_time_range(&query.range);
        let count = match query.range.as_str() {
            "1h" => 60,
            "6h" => 72,
            "24h" => 96,
            "7d" => 168,
            "30d" => 720,
            _ => 96,
        };

        generate_mock_metrics(count, duration.num_minutes() / count as i64)
    };

    let performance = VMPerformance {
        vm_name,
        metrics,
    };

    Ok(Json(performance))
}

pub async fn get_system_performance(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TimeRangeQuery>,
) -> Result<Json<Vec<SystemPerformance>>, StatusCode> {
    // Try to load real system metrics from state store
    let metrics_key = format!("metrics/system/{}", query.range);
    if let Ok(Some(stored_performance)) = state.store.get_entity::<Vec<SystemPerformance>>("performance", &metrics_key) {
        tracing::debug!("Loaded {} stored system performance entries", stored_performance.len());
        return Ok(Json(stored_performance));
    }

    // Fall back to mock data for demonstration
    tracing::debug!("No stored system metrics found, using mock data");

    let duration = parse_time_range(&query.range);
    let count = match query.range.as_str() {
        "1h" => 60,
        "6h" => 72,
        "24h" => 96,
        "7d" => 168,
        "30d" => 720,
        _ => 96,
    };

    let interval_minutes = duration.num_minutes() / count as i64;
    let now = Utc::now();

    let mut performance = Vec::new();

    for i in 0..count {
        let timestamp = now - Duration::minutes(i as i64 * interval_minutes);
        let t = (i as f64 * 0.1).sin();

        performance.push(SystemPerformance {
            timestamp,
            total_vms: 12,
            running_vms: 8 + ((t * 2.0) as i32).max(0) as u32,
            total_cpu_usage: 55.0 + (t * 15.0),
            total_memory_usage: 70.0 + (t * 10.0),
            total_network_rx: 1024 * 1024 * (500 + (t * 200.0) as u64),
            total_network_tx: 1024 * 1024 * (300 + (t * 150.0) as u64),
        });
    }

    performance.reverse();
    Ok(Json(performance))
}

pub async fn get_performance_insights(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<PerformanceInsight>>, StatusCode> {
    // Generate real insights from metrics analysis
    let mut insights = Vec::new();

    // Try to load all VMs to analyze their metrics
    let vms = state.store.list_vms().unwrap_or_default();

    for vm in vms {
        // Try to load recent metrics for this VM
        let metrics_key = format!("metrics/vm/{}/1h", vm.name);
        if let Ok(Some(performance)) = state.store.get_entity::<VMPerformance>("performance", &metrics_key) {
            if let Some(latest_metric) = performance.metrics.last() {
                // Analyze CPU usage
                if latest_metric.cpu_usage > 90.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighCpu,
                        vm_name: vm.name.clone(),
                        resource: "CPU".to_string(),
                        value: latest_metric.cpu_usage,
                        threshold: 90.0,
                        severity: Severity::Critical,
                        recommendation: "CPU usage is critically high. Consider adding more vCPUs or scaling horizontally".to_string(),
                    });
                } else if latest_metric.cpu_usage > 80.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighCpu,
                        vm_name: vm.name.clone(),
                        resource: "CPU".to_string(),
                        value: latest_metric.cpu_usage,
                        threshold: 80.0,
                        severity: Severity::Warning,
                        recommendation: "CPU usage is high. Monitor closely and consider scaling".to_string(),
                    });
                } else if latest_metric.cpu_usage < 15.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::Underutilized,
                        vm_name: vm.name.clone(),
                        resource: "CPU".to_string(),
                        value: latest_metric.cpu_usage,
                        threshold: 15.0,
                        severity: Severity::Info,
                        recommendation: "CPU usage is very low. Consider downsizing this VM or consolidating workloads".to_string(),
                    });
                }

                // Analyze Memory usage
                if latest_metric.memory_usage > 95.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighMemory,
                        vm_name: vm.name.clone(),
                        resource: "Memory".to_string(),
                        value: latest_metric.memory_usage,
                        threshold: 95.0,
                        severity: Severity::Critical,
                        recommendation: "Memory usage is critically high. Increase memory allocation immediately".to_string(),
                    });
                } else if latest_metric.memory_usage > 85.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighMemory,
                        vm_name: vm.name.clone(),
                        resource: "Memory".to_string(),
                        value: latest_metric.memory_usage,
                        threshold: 85.0,
                        severity: Severity::Warning,
                        recommendation: "Memory usage is high. Consider increasing memory allocation".to_string(),
                    });
                }

                // Analyze Disk I/O (convert bytes to MB/s for comparison)
                let disk_io_total = (latest_metric.disk_io_read + latest_metric.disk_io_write) as f64 / (1024.0 * 1024.0);
                if disk_io_total > 500.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighDiskIo,
                        vm_name: vm.name.clone(),
                        resource: "Disk I/O".to_string(),
                        value: disk_io_total,
                        threshold: 500.0,
                        severity: Severity::Warning,
                        recommendation: "Disk I/O is very high. Consider using faster storage or optimizing disk operations".to_string(),
                    });
                }

                // Analyze Network usage (convert bytes to MB/s for comparison)
                let network_total = (latest_metric.network_rx + latest_metric.network_tx) as f64 / (1024.0 * 1024.0);
                if network_total > 1000.0 {
                    insights.push(PerformanceInsight {
                        insight_type: InsightType::HighNetwork,
                        vm_name: vm.name.clone(),
                        resource: "Network".to_string(),
                        value: network_total,
                        threshold: 1000.0,
                        severity: Severity::Warning,
                        recommendation: "Network usage is very high. Check for network bottlenecks or consider upgrading network capacity".to_string(),
                    });
                }
            }
        }
    }

    // If no real insights generated, fall back to mock data
    if insights.is_empty() {
        tracing::debug!("No real metrics found for insights, using mock data");
        insights = vec![
        PerformanceInsight {
            insight_type: InsightType::HighCpu,
            vm_name: "web-server-01".to_string(),
            resource: "CPU".to_string(),
            value: 92.5,
            threshold: 80.0,
            severity: Severity::Critical,
            recommendation: "Consider adding more vCPUs or scaling horizontally".to_string(),
        },
        PerformanceInsight {
            insight_type: InsightType::HighMemory,
            vm_name: "database-01".to_string(),
            resource: "Memory".to_string(),
            value: 88.3,
            threshold: 85.0,
            severity: Severity::Warning,
            recommendation: "Increase memory allocation or optimize application memory usage".to_string(),
        },
        PerformanceInsight {
            insight_type: InsightType::Underutilized,
            vm_name: "test-server-03".to_string(),
            resource: "CPU".to_string(),
            value: 12.5,
            threshold: 20.0,
            severity: Severity::Info,
            recommendation: "Consider downsizing this VM or consolidating workloads".to_string(),
        },
        PerformanceInsight {
            insight_type: InsightType::HighDiskIo,
            vm_name: "database-01".to_string(),
            resource: "Disk I/O".to_string(),
            value: 450.0,
            threshold: 400.0,
            severity: Severity::Warning,
            recommendation: "Consider using faster storage or optimizing database queries".to_string(),
        },
        ];
    }

    Ok(Json(insights))
}

pub async fn get_top_vms_by_resource(
    State(state): State<Arc<AppState>>,
    Query(query): Query<TopResourceQuery>,
) -> Result<Json<Vec<TopVMResource>>, StatusCode> {
    // Calculate from real metrics
    let mut vm_resources = Vec::new();

    // Load all VMs and their latest metrics
    let vms = state.store.list_vms().unwrap_or_default();

    for vm in vms {
        let metrics_key = format!("metrics/vm/{}/1h", vm.name);
        if let Ok(Some(performance)) = state.store.get_entity::<VMPerformance>("performance", &metrics_key) {
            if let Some(latest_metric) = performance.metrics.last() {
                let value = match query.resource.as_str() {
                    "cpu" => latest_metric.cpu_usage,
                    "memory" => latest_metric.memory_usage,
                    "network" => (latest_metric.network_rx + latest_metric.network_tx) as f64 / (1024.0 * 1024.0),
                    "disk" => (latest_metric.disk_io_read + latest_metric.disk_io_write) as f64 / (1024.0 * 1024.0),
                    _ => 0.0,
                };

                vm_resources.push(TopVMResource {
                    vm_name: vm.name.clone(),
                    value,
                });
            }
        }
    }

    // Sort by value descending
    vm_resources.sort_by(|a, b| b.value.partial_cmp(&a.value).unwrap_or(std::cmp::Ordering::Equal));

    // Apply limit
    vm_resources.truncate(query.limit);

    // If no real metrics, fall back to mock data
    if vm_resources.is_empty() {
        tracing::debug!("No real metrics found for top VMs, using mock data");
        let vms = match query.resource.as_str() {
        "cpu" => vec![
            TopVMResource { vm_name: "web-server-01".to_string(), value: 92.5 },
            TopVMResource { vm_name: "database-01".to_string(), value: 78.3 },
            TopVMResource { vm_name: "app-server-02".to_string(), value: 65.7 },
            TopVMResource { vm_name: "api-gateway".to_string(), value: 54.2 },
            TopVMResource { vm_name: "worker-01".to_string(), value: 48.9 },
        ],
        "memory" => vec![
            TopVMResource { vm_name: "database-01".to_string(), value: 88.3 },
            TopVMResource { vm_name: "cache-server".to_string(), value: 82.1 },
            TopVMResource { vm_name: "app-server-01".to_string(), value: 71.5 },
            TopVMResource { vm_name: "web-server-01".to_string(), value: 65.3 },
            TopVMResource { vm_name: "worker-02".to_string(), value: 58.7 },
        ],
        "network" => vec![
            TopVMResource { vm_name: "api-gateway".to_string(), value: 450.0 },
            TopVMResource { vm_name: "web-server-01".to_string(), value: 380.0 },
            TopVMResource { vm_name: "web-server-02".to_string(), value: 320.0 },
            TopVMResource { vm_name: "app-server-01".to_string(), value: 250.0 },
            TopVMResource { vm_name: "database-01".to_string(), value: 180.0 },
        ],
        "disk" => vec![
            TopVMResource { vm_name: "database-01".to_string(), value: 450.0 },
            TopVMResource { vm_name: "database-02".to_string(), value: 380.0 },
            TopVMResource { vm_name: "file-server".to_string(), value: 320.0 },
            TopVMResource { vm_name: "backup-server".to_string(), value: 280.0 },
            TopVMResource { vm_name: "app-server-01".to_string(), value: 150.0 },
        ],
        _ => vec![],
        };

        let limited_vms: Vec<TopVMResource> = vms.into_iter().take(query.limit).collect();
        return Ok(Json(limited_vms));
    }

    Ok(Json(vm_resources))
}

pub async fn get_resource_utilization(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ResourceUtilization>, StatusCode> {
    // Calculate from real metrics
    let vms = state.store.list_vms().unwrap_or_default();

    let mut total_cpu = 0.0;
    let mut total_memory = 0.0;
    let mut total_disk = 0.0;
    let mut total_network = 0.0;
    let mut count = 0;

    for vm in vms {
        let metrics_key = format!("metrics/vm/{}/1h", vm.name);
        if let Ok(Some(performance)) = state.store.get_entity::<VMPerformance>("performance", &metrics_key) {
            if let Some(latest_metric) = performance.metrics.last() {
                total_cpu += latest_metric.cpu_usage;
                total_memory += latest_metric.memory_usage;
                total_disk += (latest_metric.disk_io_read + latest_metric.disk_io_write) as f64 / (1024.0 * 1024.0);
                total_network += (latest_metric.network_rx + latest_metric.network_tx) as f64 / (1024.0 * 1024.0);
                count += 1;
            }
        }
    }

    let utilization = if count > 0 {
        ResourceUtilization {
            cpu_utilization: total_cpu / count as f64,
            memory_utilization: total_memory / count as f64,
            disk_utilization: (total_disk / count as f64).min(100.0), // Cap at 100%
            network_utilization: (total_network / count as f64 / 10.0).min(100.0), // Normalize to percentage
        }
    } else {
        // Fall back to mock data
        tracing::debug!("No real metrics found for resource utilization, using mock data");
        ResourceUtilization {
            cpu_utilization: 68.5,
            memory_utilization: 72.3,
            disk_utilization: 45.8,
            network_utilization: 38.2,
        }
    };

    Ok(Json(utilization))
}

pub async fn export_performance_report(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ExportQuery>,
) -> Result<(StatusCode, String), StatusCode> {
    // Generate real report from metrics
    let vms = state.store.list_vms().unwrap_or_default();
    let total_vms = vms.len();
    let running_vms = vms.iter().filter(|vm| matches!(vm.state, vm_model::VMState::Running)).count();

    // Calculate averages
    let mut total_cpu = 0.0;
    let mut total_memory = 0.0;
    let mut total_network = 0.0;
    let mut count = 0;
    let mut top_cpu_vms = Vec::new();

    for vm in &vms {
        let metrics_key = format!("metrics/vm/{}/1h", vm.name);
        if let Ok(Some(performance)) = state.store.get_entity::<VMPerformance>("performance", &metrics_key) {
            if let Some(latest_metric) = performance.metrics.last() {
                total_cpu += latest_metric.cpu_usage;
                total_memory += latest_metric.memory_usage;
                total_network += (latest_metric.network_rx + latest_metric.network_tx) as f64 / (1024.0 * 1024.0);
                count += 1;

                top_cpu_vms.push((vm.name.clone(), latest_metric.cpu_usage));
            }
        }
    }

    // Sort top CPU VMs
    top_cpu_vms.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    top_cpu_vms.truncate(5);

    let avg_cpu = if count > 0 { total_cpu / count as f64 } else { 0.0 };
    let avg_memory = if count > 0 { total_memory / count as f64 } else { 0.0 };
    let avg_network = if count > 0 { total_network / count as f64 } else { 0.0 };

    let now = Utc::now();
    let report = format!(
r#"Performance Analytics Report
============================

Generated: {}
Time Range: {}

## Summary

- Total VMs: {}
- Running VMs: {}
- Average CPU Usage: {:.1}%
- Average Memory Usage: {:.1}%
- Average Network Traffic: {:.1} MB/s

## Top VMs by CPU Usage

{}"#,
        now.to_rfc3339(),
        query.range,
        total_vms,
        running_vms,
        avg_cpu,
        avg_memory,
        avg_network,
        if !top_cpu_vms.is_empty() {
            top_cpu_vms.iter()
                .enumerate()
                .map(|(i, (name, cpu))| format!("{}. {}: {:.1}%", i + 1, name, cpu))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            "No metrics available".to_string()
        }
    );

    Ok((StatusCode::OK, report))
}
