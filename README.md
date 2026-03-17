# vmspawnd

**A production-grade virtual machine management platform built on systemd-vmspawn and systemd-machined.**

Manage VMs through a CLI, terminal UI, web dashboard, Kubernetes operator, or Terraform provider -- all backed by a single Rust daemon with 480+ REST API endpoints.

```
                        +-----------+    +-----------+    +----------+
                        |   vmctl   |    | vmctl-tui |    |  Web UI  |
                        |   (CLI)   |    |   (TUI)   |    | (React)  |
                        +-----+-----+    +-----+-----+    +----+-----+
                              |                |               |
                    +---------+----------+     |      +--------+
                    |         |          |     |      |
               +----v----+   |   +------v-----v------v-------+
               |   K8s   |   |   |       vmspawnd daemon      |
               |Operator |   |   |   REST API + WebSocket      |
               +---------+   |   +---+----+----+----+----+----+
                              |       |    |    |    |    |
               +-----------+  |       |    |    |    |    |
               | Terraform |--+       |    |    |    |    |
               | Provider  |         |    |    |    |    |
               +-----------+         |    |    |    |    |
                                      |    |    |    |    |
         +----------------------------+    |    |    |    +------------------+
         |              +------------------+    |    +--------+             |
         v              v                       v             v             v
   +-----------+  +-----------+           +-----------+  +---------+  +-----------+
   | cloud-init|  |VNC Proxy  |           |Prometheus |  |   TPM   |  | WebSocket |
   | Generator |  | (noVNC)   |           | Exporter  |  | Manager |  |  Console  |
   +-----------+  +-----------+           +-----------+  +---------+  +-----------+
                                                |
                                    +-----------v-----------+
                                    |   systemd-vmspawn     |
                                    |   systemd-machined    |
                                    +-----------------------+
```

---

## Highlights

| | |
|---|---|
| **40 Rust crates** | Modular workspace -- networking, storage, security, HA, and more |
| **480+ REST endpoints** | Complete API coverage with 3 WebSocket channels |
| **~87,000 LOC** | 60K Rust + 27K TypeScript across 295 source files |
| **5 interfaces** | CLI, TUI, Web UI, Kubernetes Operator, Terraform Provider |
| **Enterprise features** | RBAC, audit logging, HA clustering, live migration, GPU passthrough |

---

## Features

### VM Lifecycle
- Create, start, stop, restart, pause, resume, delete
- Full and linked cloning with snapshot support
- Templates for rapid deployment
- Multiple disk formats: qcow2, raw, vmdk, vdi
- Declarative config via `vmctl apply -f config.yaml`

### Interfaces

**CLI** (`vmctl`) -- Scriptable command-line tool with `-o json|yaml|table` output and 15+ subcommand groups (vm, policy, firewall, service, qos, dns, vpn, mirror, nat, monitor, ceph, net).

**TUI** (`vmctl-tui`) -- k9s-style terminal dashboard with 8 views (Dashboard, VMs, Logs, Metrics, Network, Net Security, Storage, Help), vim keybindings, sparkline graphs, and live API data.

**Web UI** -- React dashboard with 37+ pages and 20+ network/security sub-pages, command palette (`Ctrl/Cmd+K`), bulk operations, dark theme, and WebSocket-driven real-time updates.

**Kubernetes Operator** -- Manage VMs as `VirtualMachine` CRDs with auto-reconciliation.

**Terraform Provider** -- Declarative VM provisioning with full plan/apply workflow.

### Console Access
- WebSocket terminal via xterm.js
- VNC graphical console via noVNC proxy

### Security
- JWT authentication with SQLite user store
- Role-Based Access Control (Admin / User / Viewer)
- TLS/HTTPS with certificate management
- Audit logging with filtering and export (JSON/CSV)
- Encryption at rest
- API keys for service-to-service auth

### Networking
- **Network Policies** -- Cilium-style label-based ingress/egress rules
- **VM Firewall** -- Per-VM firewall profiles and zones via nftables
- **Service Mesh** -- Virtual IP load balancing (round-robin, least-conn, random, IP-hash)
- **QoS / Traffic Shaping** -- Guaranteed/max rate, burst, priority-based bandwidth
- **DNS Policy** -- Zone management, upstream servers, domain blocking
- **VPN Mesh** -- WireGuard tunnels (point-to-point, hub-spoke, full-mesh)
- **Packet Mirror** -- Traffic capture with direction/protocol/CIDR filtering
- **NAT Gateway** -- Masquerade, SNAT, DNAT, hairpin NAT via nftables
- **Network Monitor** -- Per-VM bandwidth tracking with threshold alerts

### Storage
- Backends: Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD
- Volume CRUD with attach/detach, resize, clone
- Snapshot create/restore
- Ceph cluster health, stats, and RBD image management

### Cloud and Virtualization
- cloud-init integration (NoCloud datasource)
- TPM/vTPM support (1.2 and 2.0 via swtpm)
- GPU passthrough (NVIDIA, AMD, Intel GVT-g)
- Live and offline VM migration

### High Availability
- etcd-based clustering with leader election
- Predictive DRS (Distributed Resource Scheduling)
- Fault tolerance and automatic failover
- Distributed storage, replication, and site recovery

### Monitoring and Automation
- Prometheus metrics exporter with per-VM resource tracking
- Analytics dashboard with historical data and report export (PDF/CSV)
- Multi-channel notifications: Email, Slack, Webhook, Microsoft Teams
- VM scheduling (once, daily, weekly) and lifecycle automation
- Backup/restore with retention policies and incremental backups
- Resource quotas, pools, and datacenter abstractions
- Tagging with color-coded labels and tag-based filtering

---

## Quick Start

### Prerequisites

- Linux with systemd (systemd-vmspawn, systemd-machined)
- Rust toolchain (for building from source)
- Node.js 18+ (for building the web UI)

### Build

```bash
# Backend
cd backend && cargo build --release

# Web UI
cd ../web && npm install && npm run build

# Install system-wide
sudo make install
```

### Run

```bash
# Via systemd (recommended)
sudo systemctl enable --now vmspawnd

# Or run directly
sudo ./backend/target/release/vmspawnd

# Check logs
sudo journalctl -u vmspawnd -f
```

### Use

```bash
# Create and start a VM
vmctl create myvm --image=/path/to/image.qcow2 --cpus=4 --memory=4096
vmctl start myvm

# Check status
vmctl list
vmctl info myvm
vmctl metrics myvm

# Declarative config
vmctl apply -f vm-config.yaml
vmctl export vms -o yaml

# Network security
vmctl policy list
vmctl firewall list
vmctl firewall assign myvm --profile=web-profile

# Ceph storage
vmctl ceph create my-pool --monitors=10.0.0.1,10.0.0.2 --pool=rbd
vmctl ceph health my-pool

# TUI
vmctl-tui

# Web UI
# Open http://localhost:8080
```

---

## Configuration

Create `/etc/vmspawnd/vmspawnd.toml`:

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

A default `admin` user is created on first startup when authentication is enabled.

### RBAC Roles

| Role | Read | Write | Delete | Manage Users |
|--------|------|-------|--------|--------------|
| Admin  | Yes  | Yes   | Yes    | Yes          |
| User   | Yes  | Yes   | No     | No           |
| Viewer | Yes  | No    | No     | No           |

---

## API

All `/api/*` routes (except `/api/auth/login`) require a JWT token via `Authorization: Bearer <token>`.

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
WS     /ws/events                   Real-time event stream

GET    /metrics                     Prometheus metrics
GET    /health                      Health check
```

The full API surface covers 480+ REST endpoints. See [docs/api.md](docs/api.md) for the complete reference.

---

## Documentation

### Getting Started
- [docs/architecture.md](docs/architecture.md) -- System design and crate structure
- [docs/api.md](docs/api.md) -- Complete API reference (480+ endpoints)

### User Interfaces
- [docs/tui.md](docs/tui.md) -- Terminal UI guide
- [docs/web-ui.md](docs/web-ui.md) -- Web interface guide

### Operations
- [docs/security.md](docs/security.md) -- Authentication, RBAC, TLS, and audit logging
- [docs/storage.md](docs/storage.md) -- Storage backends and volume management
- [docs/networking.md](docs/networking.md) -- Networking, VPN mesh, NAT, and firewalls
- [docs/high-availability.md](docs/high-availability.md) -- HA clustering with etcd
- [docs/migration.md](docs/migration.md) -- Live and offline VM migration
- [docs/gpu-passthrough.md](docs/gpu-passthrough.md) -- GPU passthrough setup

### Advanced Guides
- [docs/advanced-features.md](docs/advanced-features.md) -- cloud-init, TPM, VNC, metrics
- [docs/NFS_STORAGE_GUIDE.md](docs/NFS_STORAGE_GUIDE.md) -- NFS storage pools
- [docs/CPU_NUMA_OPTIMIZATION_GUIDE.md](docs/CPU_NUMA_OPTIMIZATION_GUIDE.md) -- CPU pinning and NUMA tuning

### Integrations
- [operator/README.md](operator/README.md) -- Kubernetes operator
- [terraform-provider/README.md](terraform-provider/README.md) -- Terraform provider

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | [Rust](https://www.rust-lang.org/) |
| Web framework | [Axum](https://github.com/tokio-rs/axum) + [Tokio](https://tokio.rs/) |
| Terminal UI | [ratatui](https://github.com/ratatui-org/ratatui) + [crossterm](https://github.com/crossterm-rs/crossterm) |
| Web UI | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) + [TailwindCSS](https://tailwindcss.com/) |
| Terminal emulator | [xterm.js](https://xtermjs.org/) |
| VNC client | [noVNC](https://novnc.com/) |
| VM backend | [systemd-vmspawn](https://www.freedesktop.org/software/systemd/man/latest/systemd-vmspawn.html) + [systemd-machined](https://www.freedesktop.org/software/systemd/man/latest/systemd-machined.html) |
| Monitoring | [Prometheus](https://prometheus.io/) |

## License

MIT -- see [LICENSE](LICENSE).
