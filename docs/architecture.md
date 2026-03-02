# vmspawnd Architecture

## Overview

vmspawnd is a comprehensive virtual machine management platform built in Rust. It serves as a modern, modular replacement for libvirtd, providing VM lifecycle management through a rich REST and WebSocket API, a React-based web UI, a CLI, a TUI, a Kubernetes operator, and a Terraform provider.

## Codebase Structure

The backend is organized as a Cargo workspace containing 32 crates. This modular design enforces clear separation of concerns and allows individual components to be developed, tested, and versioned independently.

### Backend Crates (Cargo Workspace)

The workspace is divided into the following functional areas:

**Core Daemon**
- `vmspawnd` -- Main daemon process. Initializes the Axum HTTP/WebSocket server, loads configuration, registers routes, and orchestrates all subsystems.

**VM Drivers**
- `vmspawn-driver` -- Integration with systemd-vmspawn for VM creation and management.
- `systemd-driver` -- Low-level systemd and machinectl integration for machine management.

**State and Models**
- `state-store` -- Persistent VM state management with JSON-based storage, in-memory caching, and file-based persistence.
- `vm-model` -- Core data structures: VM definitions, state enums, request/response types.

**Networking**
- Network configuration, bridge management, and virtual networking crates.

**Storage**
- Disk image management, volume provisioning, and distributed storage support.

**Security**
- `tpm-support` -- Virtual TPM (vTPM) management with swtpm integration (TPM 1.2 and 2.0).
- Certificate management and encryption crates.

**Console and Display**
- `vnc-proxy` -- WebSocket-to-TCP VNC proxy for noVNC graphical console access.
- WebSocket console handler for interactive terminal sessions via xterm.js.

**Cloud-Init**
- ISO generation with NoCloud datasource for automated VM initialization.

**Monitoring and Metrics**
- Prometheus metrics exporter (`/metrics` endpoint).
- Analytics and audit logging subsystems.

**Advanced Features**
- Snapshots, backups, replication, and site recovery.
- DRS (Distributed Resource Scheduler) and fault tolerance.
- Autoscaling, hotplug, and resource pool management.
- Image builder, content library, and VM templates.
- Scheduling, quotas, notifications, and tagging.
- Lifecycle management and datacenter abstractions.

**CLI and TUI**
- `vmctl` -- Command-line interface for scripting and interactive use.
- `vmctl-tui` -- Terminal UI built with ratatui and crossterm for real-time VM monitoring and management.

**Infrastructure Integrations**
- `vmspawnd-operator` -- Kubernetes operator that manages VMs as custom resources (CRD: `VirtualMachine`).
- `vmspawnd-terraform` -- Terraform provider for declarative VM provisioning.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | Rust |
| Web framework | Axum |
| Async runtime | Tokio |
| Frontend | React 18, TypeScript, Vite, TailwindCSS |
| TUI | ratatui, crossterm |
| VM backend | systemd-vmspawn, machinectl |
| Metrics | Prometheus |
| Container orchestration | Kubernetes (operator) |
| IaC | Terraform (provider) |

## API Surface

The daemon exposes:

- **435 REST endpoints** covering VM management, snapshots, storage, networking, auth, quotas, schedules, audit, analytics, backups, notifications, templates, tags, cloning, DRS, fault tolerance, replication, site recovery, content library, lifecycle, certificates, encryption, resource pools, distributed storage, datacenters, machines, events, autoscaling, hotplug, and image building.
- **3 WebSocket endpoints** for real-time console access, VNC proxying, and live event streaming.

All endpoints use JSON payloads and follow RESTful conventions.

## User Interfaces

### Web UI

A React-based single-page application with 36+ pages and 20+ reusable components:
- Dashboard with real-time statistics
- VM management (list, detail, create, console, VNC)
- Storage, networking, and metrics views
- WebSocket integration for live updates
- Command palette, toast notifications, dark theme

### CLI (vmctl)

Full-featured command-line client for scripting and automation. Supports all API operations with table-formatted output.

### TUI (vmctl-tui)

Interactive terminal UI with 7 views (Dashboard, VMs, Logs, Metrics, Network, Storage, Help), vim-style navigation, search, bulk operations, auto-refresh, and sparkline graphs.

## Data Flow

```
User --> CLI / TUI / Web UI
              |
              v
        REST API / WebSocket (Axum + Tokio)
              |
              v
         Core Daemon (vmspawnd)
           /      \
          v        v
    VM Drivers    State Store (/var/lib/vmspawnd/)
        |
        v
  systemd-vmspawn --> Virtual Machines
```

Kubernetes and Terraform integrations communicate with the daemon through the same REST API.

## Storage Layout

VM state and artifacts are stored under `/var/lib/vmspawnd/`:

- `{vmname}.json` -- VM metadata and configuration
- `images/` -- VM disk images
- `tpm/` -- Per-VM vTPM state directories
- `snapshots/` -- VM snapshot data
- `backups/` -- Backup archives

## systemd Integration

- `vmspawnd.service` -- Main daemon unit
- `vm@.service` -- Per-VM service template
- Uses systemd-machined for machine registration and management

## Security

- Runs as root (required for VM management and networking)
- systemd hardening directives applied to service units
- Token-based API authentication
- TLS support for production deployments
- vTPM for guest attestation and secure boot
- Audit logging for all administrative actions

## High Availability

- etcd-based state store for multi-node deployments
- VM migration between hosts
- Automatic failover and health monitoring
