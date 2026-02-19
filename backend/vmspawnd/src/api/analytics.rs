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
    State(_state): State<Arc<AppState>>,
    Path(vm_name): Path<String>,
    Query(query): Query<TimeRangeQuery>,
) -> Result<Json<VMPerformance>, StatusCode> {
    // TODO: Load real metrics from state store or metrics database

    let duration = parse_time_range(&query.range);
    let count = match query.range.as_str() {
        "1h" => 60,
        "6h" => 72,
        "24h" => 96,
        "7d" => 168,
        "30d" => 720,
        _ => 96,
    };

    let metrics = generate_mock_metrics(count, duration.num_minutes() / count as i64);

    let performance = VMPerformance {
        vm_name,
        metrics,
    };

    Ok(Json(performance))
}

pub async fn get_system_performance(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<TimeRangeQuery>,
) -> Result<Json<Vec<SystemPerformance>>, StatusCode> {
    // TODO: Load real system metrics from state store

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
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<PerformanceInsight>>, StatusCode> {
    // TODO: Generate real insights from metrics analysis

    let insights = vec![
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

    Ok(Json(insights))
}

pub async fn get_top_vms_by_resource(
    State(_state): State<Arc<AppState>>,
    Query(query): Query<TopResourceQuery>,
) -> Result<Json<Vec<TopVMResource>>, StatusCode> {
    // TODO: Calculate from real metrics

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
    Ok(Json(limited_vms))
}

pub async fn get_resource_utilization(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<ResourceUtilization>, StatusCode> {
    // TODO: Calculate from real metrics

    let utilization = ResourceUtilization {
        cpu_utilization: 68.5,
        memory_utilization: 72.3,
        disk_utilization: 45.8,
        network_utilization: 38.2,
    };

    Ok(Json(utilization))
}

pub async fn export_performance_report(
    State(_state): State<Arc<AppState>>,
    Query(_query): Query<ExportQuery>,
) -> Result<(StatusCode, String), StatusCode> {
    // TODO: Generate real report from metrics

    // For now, return a simple text report
    let report = r#"
Performance Analytics Report
============================

Generated: 2026-02-19T00:00:00Z
Time Range: Last 24 hours

## Summary

- Total VMs: 12
- Running VMs: 8
- Average CPU Usage: 68.5%
- Average Memory Usage: 72.3%
- Average Network Traffic: 450 MB/s

## Top VMs by CPU Usage

1. web-server-01: 92.5%
2. database-01: 78.3%
3. app-server-02: 65.7%

## Performance Insights

- CRITICAL: web-server-01 high CPU usage (92.5%)
- WARNING: database-01 high memory usage (88.3%)
- INFO: test-server-03 underutilized (12.5% CPU)

## Recommendations

1. Scale web-server-01 horizontally or add more vCPUs
2. Increase memory for database-01
3. Consider downsizing test-server-03
"#;

    Ok((StatusCode::OK, report.to_string()))
}
