# vmspawnd

A virtual machine management platform built on systemd-vmspawn and systemd-machined, written in Rust with a React web frontend.

## Overview

vmspawnd provides VM lifecycle management through three interfaces: a CLI (`vmctl`), a terminal UI (`vmctl-tui`), and a web dashboard (React). The backend exposes 480+ REST API endpoints and 3 WebSocket endpoints for console access, VNC proxying, and real-time events.

**Codebase:** 40 backend crates, 165 Rust source files, 130 TypeScript/React source files (~87,000 LOC: 60K Rust, 27K TypeScript).

## Architecture

```
User Interfaces:
  vmctl (CLI) -- JSON/YAML/table output, 15+ subcommand groups
  vmctl-tui (Terminal UI - 8 views)
  Web UI (React - 37+ pages, 20+ sub-pages)
  Kubernetes Operator
  Terraform Provider
        |
        v
  vmspawnd daemon (REST API + WebSocket)
        |
        +-- WebSocket Console (xterm.js)
        +-- VNC Proxy (noVNC)
        +-- cloud-init Generator
        +-- TPM Manager (swtpm)
        +-- Prometheus Exporter
        |
        v
  VM Drivers:
    systemd-vmspawn
    systemd-machined
```

## Features

### Core VM Management
- Create, start, stop, restart, delete VMs
- Cloning (full and linked) with snapshot support
- Templates for rapid deployment
- Multiple disk formats (qcow2, raw, vmdk, vdi)
- Real-time metrics collection

### Interfaces
- **CLI** (`vmctl`) -- scriptable command-line tool with `-o json|yaml|table` output, `vmctl apply -f config.yaml` for declarative config import, 15+ subcommand groups (vm, policy, firewall, service, qos, dns, vpn, mirror, nat, monitor, ceph, net)
- **TUI** (`vmctl-tui`) -- k9s-style terminal UI with 8 views (Dashboard, VMs, Logs, Metrics, Network, Net Security, Storage, Help), vim-style navigation, live API data
- **Web UI** -- React dashboard with 37 main pages + 20 network/security sub-pages, Cilium-style network policy editor, command palette (Ctrl/Cmd+K), bulk operations, keyboard shortcuts

### Console and Display
- WebSocket terminal console via xterm.js
- VNC graphical console via noVNC proxy

### Security and Authentication
- JWT authentication with SQLite user storage
- Role-Based Access Control (Admin / User / Viewer)
- TLS/HTTPS support
- Audit logging with filtering and export (JSON/CSV)
- Certificate management
- Encryption at rest

### Network Security (Cilium-style)
- **Network Policies** -- label-based ingress/egress rules with priority and enforcement
- **VM Firewall** -- per-VM firewall profiles, zones, and assignments with nftables
- **Service Mesh** -- virtual IP load-balanced services (round-robin, least-conn, random, IP-hash)
- **QoS / Traffic Shaping** -- guaranteed/max rate, burst, priority-based bandwidth management
- **DNS Policy** -- zone management, upstream servers, domain blocking
- **VPN Mesh** -- WireGuard tunnels (point-to-point, hub-spoke, full-mesh)
- **Packet Mirror** -- traffic capture with direction/protocol/CIDR filtering
- **NAT Gateway** -- masquerade, SNAT, DNAT, hairpin NAT via nftables
- **Network Monitor** -- per-VM bandwidth tracking with threshold alerts

### Storage
- Local filesystem, NFS, LVM, LVM-thin, ZFS, Ceph/RBD backends
- Volume CRUD with attach/detach, resize, clone
- Snapshot create/restore
- Ceph cluster health, stats, and RBD image management

### Organization and Governance
- Tagging with predefined colors and custom tags, tag-based filtering and grouping
- Resource quotas (CPU, memory, disk, VM count) with enforcement
- Resource pools and datacenters

### Automation
- VM scheduling (once, daily, weekly) with automated operations
- Backup and restore with retention policies, incremental backups, compression
- Lifecycle management

### Monitoring and Analytics
- Performance analytics dashboard with historical tracking
- Prometheus metrics exporter
- Resource utilization monitoring and recommendations
- Report export (PDF/CSV)

### Notifications
- Multi-channel: Email, Slack, Webhook, Microsoft Teams
- Event-based alert rules with severity levels

### Cloud and Virtualization
- cloud-init integration
- TPM/vTPM support (1.2 and 2.0)
- GPU passthrough (NVIDIA/AMD)
- Live migration
- Image builder and content library

### High Availability and Resilience
- HA clustering via etcd
- Predictive DRS (Distributed Resource Scheduling)
- Fault tolerance
- Distributed storage and replication
- Site recovery

### Integrations
- Kubernetes operator
- Terraform provider
- Prometheus metrics

## Quick Start

### Build from source

```bash
# Build backend (Rust)
cd backend
cargo build --release

# Build web UI (React)
cd ../web
npm install
npm run build

# Install system-wide
sudo make install
```

### Run the daemon

```bash
# Via systemd
sudo systemctl enable --now vmspawnd

# Or run directly
sudo ./backend/target/release/vmspawnd

# View logs
sudo journalctl -u vmspawnd -f
```

### CLI usage

```bash
# VM management
vmctl list
vmctl list -o json                    # JSON output
vmctl list -o yaml                    # YAML output
vmctl create myvm --image=/path/to/image.qcow2 --cpus=4 --memory=4096
vmctl start myvm
vmctl stop myvm
vmctl info myvm
vmctl metrics myvm
vmctl delete myvm

# Declarative config (JSON/YAML)
vmctl apply -f vm-config.yaml         # Create resource from file
vmctl export vms -o yaml              # Export all VMs as YAML

# Network security
vmctl policy list                     # List network policies
vmctl firewall list                   # List firewall profiles
vmctl firewall assign myvm --profile=web-profile
vmctl service list                    # List service mesh services
vmctl vpn tunnels                     # List VPN tunnels
vmctl nat rules                       # List NAT rules
vmctl monitor alerts                  # Show bandwidth alerts

# Ceph storage
vmctl ceph create my-pool --monitors=10.0.0.1,10.0.0.2 --pool=rbd
vmctl ceph health my-pool
vmctl ceph images my-pool
vmctl ceph create-image my-pool myimg --size=10240

# Networking
vmctl net bridges                     # List bridges
vmctl net links                       # Show link status
```

### TUI usage

```bash
vmctl-tui
```

Keyboard shortcuts: `1`-`7` switch views, `?` help, `j`/`k` navigate, `s` start, `t` stop, `r` restart, `d` delete, `R` refresh, `q` quit. Net Security view: `h`/`l` switch tabs, `S` sync, `d` delete.

### Web UI

Access at `http://localhost:8080` (or HTTPS if TLS is configured).

## Configuration

`/etc/vmspawnd/vmspawnd.toml`:

```toml
[daemon]
listen = "0.0.0.0:8080"

[storage]
path = "/var/lib/vmspawnd"
image_path = "/var/lib/vmspawnd/images"

[network]
bridge = "br0"

[auth]
enabled = true
jwt_secret = "change-me-in-production"
db_path = "/var/lib/vmspawnd/auth.db"
default_admin_password = "admin"
token_expiration_hours = 24
```

When authentication is enabled, a default `admin` user is created on first startup.

### RBAC Roles

| Role | Read | Write | Manage Users |
|------|------|-------|--------------|
| Admin | Yes | Yes | Yes |
| User | Yes | Yes | No |
| Viewer | Yes | No | No |

## API

All `/api/*` routes (except `/api/auth/login`) require a JWT token in the `Authorization: Bearer <token>` header.

```
POST   /api/auth/login              Login, returns JWT
GET    /api/auth/me                 Current user info

GET    /api/vms                     List VMs
GET    /api/vms/:name               VM details
POST   /api/vms                     Create VM
DELETE /api/vms/:name               Delete VM
POST   /api/vms/:name/start         Start VM
POST   /api/vms/:name/stop          Stop VM
POST   /api/vms/:name/restart       Restart VM
GET    /api/vms/:name/metrics       VM metrics
POST   /api/vms/:name/cloud-init    Configure cloud-init

WS     /ws/console/:name            Console WebSocket
WS     /ws/vnc/:name                VNC WebSocket proxy
WS     /ws/events                   Real-time events

GET    /metrics                     Prometheus metrics
GET    /health                      Health check
```

The full API surface covers 480+ REST endpoints. See [docs/api.md](docs/api.md) for the complete reference.

## Documentation

### Getting Started
- [QUICKSTART.md](QUICKSTART.md) -- Quick start guide
- [CONTRIBUTING.md](CONTRIBUTING.md) -- Contributing guidelines
- [FEATURES.md](FEATURES.md) -- Feature overview

### Architecture and API
- [docs/architecture.md](docs/architecture.md) -- System design
- [docs/api.md](docs/api.md) -- API reference

### User Interfaces
- [docs/tui.md](docs/tui.md) -- Terminal UI guide
- [docs/web-ui.md](docs/web-ui.md) -- Web interface guide

### Features
- [docs/advanced-features.md](docs/advanced-features.md) -- Advanced features
- [docs/security.md](docs/security.md) -- Security configuration
- [docs/storage.md](docs/storage.md) -- Storage management
- [docs/networking.md](docs/networking.md) -- Networking setup
- [docs/high-availability.md](docs/high-availability.md) -- HA clustering
- [docs/gpu-passthrough.md](docs/gpu-passthrough.md) -- GPU passthrough
- [docs/migration.md](docs/migration.md) -- Live migration

### Specialized Guides
- [docs/NFS_STORAGE_GUIDE.md](docs/NFS_STORAGE_GUIDE.md) -- NFS storage setup
- [docs/CPU_NUMA_OPTIMIZATION_GUIDE.md](docs/CPU_NUMA_OPTIMIZATION_GUIDE.md) -- CPU and NUMA optimization

### Integrations
- [operator/README.md](operator/README.md) -- Kubernetes operator
- [terraform-provider/README.md](terraform-provider/README.md) -- Terraform provider

## Built With

- [Rust](https://www.rust-lang.org/) / [Axum](https://github.com/tokio-rs/axum) -- Backend
- [ratatui](https://github.com/ratatui-org/ratatui) -- Terminal UI
- [React](https://react.dev/) / [TailwindCSS](https://tailwindcss.com/) -- Web UI
- [xterm.js](https://xtermjs.org/) -- Terminal emulator
- [noVNC](https://novnc.com/) -- VNC client
- [systemd](https://systemd.io/) -- vmspawn and machined
- [Prometheus](https://prometheus.io/) -- Monitoring

## License

MIT -- see [LICENSE](LICENSE).
