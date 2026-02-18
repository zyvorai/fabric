# vmspawnd Architecture

## Overview

vmspawnd is a modern virtual machine management daemon designed as a lightweight replacement for libvirtd. It follows a modular architecture with clear separation of concerns.

## Components

### 1. Core Daemon (vmspawnd)

The main daemon process that:
- Manages VM lifecycle
- Exposes REST API
- Integrates with systemd
- Maintains VM state

### 2. VM Drivers

**vmspawn-driver**: Integration with systemd-vmspawn
- Creates and manages VMs
- Starts/stops VMs via systemd
- Retrieves metrics

**systemd-driver**: Low-level systemd integration
- Machine management via `machinectl`
- System integration

### 3. State Management

**state-store**: Persistent VM state
- JSON-based storage
- In-memory caching
- File-based persistence

**vm-model**: VM data structures
- VM definition
- State enums
- Request/response types

### 4. CLI Tools

**vmctl**: Command-line interface
- List/create/start/stop VMs
- Table-based output
- REST API client

**vmctl-tui**: Terminal UI
- Real-time VM monitoring
- Interactive controls
- Built with ratatui

### 5. Web UI

React-based web interface:
- Dashboard
- VM management
- Metrics visualization
- Console access (planned)

## Data Flow

```
User → CLI/TUI/Web → REST API → Daemon → Driver → systemd-vmspawn → VM
                                    ↓
                                State Store
```

## Technology Stack

- **Backend**: Rust, Axum, Tokio
- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **TUI**: ratatui, crossterm
- **VM Backend**: systemd-vmspawn, machinectl

## API Design

RESTful API with JSON payloads:
- `/api/vms` - VM collection
- `/api/vms/:name` - Individual VM
- `/api/vms/:name/{action}` - VM actions

## Storage

VM state stored in `/var/lib/vmspawnd/`:
- `{vmname}.json` - VM metadata
- `images/` - VM disk images

## systemd Integration

- `vmspawnd.service` - Main daemon
- `vm@.service` - Per-VM service template
- Uses systemd-machined for VM management

## Security

- Runs as root (required for VM management)
- systemd security features
- No exposed credentials
- Local-only by default

## Future Extensions

- WebSocket for real-time updates
- VNC/noVNC integration
- cloud-init support
- TPM/vTPM support
- Kubernetes operator
- Terraform provider
