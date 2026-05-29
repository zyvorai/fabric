// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod auth;
pub mod capabilities;

// Phase 1 API modules for advanced features
pub mod analytics;
pub mod audit;
pub mod autoscale;
pub mod backups;
pub mod declarative;
pub mod events;
pub mod firmware;
pub mod hotplug;
pub mod images;
pub mod machined;
pub mod migration;
pub mod network_cloud;
pub mod network_cloud_discover;
pub mod notifications;
pub mod profiles;
pub mod quotas;
pub mod schedules;
pub mod settings;
pub mod snapshots;
pub mod storage;
pub mod system;
pub mod templates;
pub mod vm_advanced;
pub mod volumes;
pub mod zones;

// Phase 2 API modules for enterprise features
pub mod certificates;
pub mod content_library;
pub mod datacenter;
pub mod distributed_storage;
pub mod drs;
pub mod fault_tolerance;
pub mod lifecycle;
pub mod network_policy;
pub mod networkd;
pub mod networkd_discover;
pub mod replication_api;
pub mod resource_pools;
pub mod site_recovery_api;
pub mod vm_encryption;

// Phase 3 API modules for networking features
pub mod dns_policy;
pub mod service_mesh;
pub mod traffic_shaping;
pub mod vm_firewall;

// Phase 4 API modules for advanced networking
pub mod nat_gateway;
pub mod net_monitor;
pub mod net_security_discover;
pub mod packet_mirror;
pub mod vpn_mesh;

// Phase 5 API modules for platform features
pub mod tenant;

// Phase 6 API modules: 2FA, export, secrets, logs
pub mod billing;
pub mod config_snapshot;
pub mod db_migrations;
pub mod export;
pub mod external_auth;
pub mod logs;
pub mod resource_policy;
pub mod secrets;
pub mod vm_power;
pub mod webhook_retry;

// Phase 3 infrastructure modules
pub mod compliance;
pub mod host_insight;
pub mod processes;
pub mod usb;
pub mod ux_extensions;
