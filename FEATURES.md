# Zyvor Fabric Feature Reference

## Project Statistics

- 40 backend crates
- 165 Rust source files, 130 TypeScript files
- ~87,000 lines of code (60K Rust + 27K TypeScript)
- 480+ REST API endpoints + 3 WebSocket endpoints
- 37 web pages + 20 network/security sub-pages
- 20+ React components + reusable UI subcomponents
- 3 RBAC roles (Admin, User, Viewer)
- 4 disk formats (qcow2, raw, vmdk, vdi)
- 6 storage backends (Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD)

---

## VM Management

- Create, start, stop, restart, delete, clone VMs
- VM templates
- VM state persistence
- VM driver: [Ephemera](https://github.com/hypersdk/ephemera), a disposable-VM engine with no systemd dependency (QEMU/Cloud Hypervisor/Firecracker)
- CPU and memory configuration (`--cpus`, `--ram`)
- Direct kernel boot (`--linux`, `--initrd`)
- TAP and user mode networking (`--network-tap`, `--network-user-mode`)
- Firmware selection (`--firmware`)
- Bind mounts as launch-time virtiofs shares (`--bind`, `--bind-ro`) — declared at VM create time, auto-mounted in the guest via cloud-init
- Core VM lifecycle, cgroup resource control (CPU/memory/IO/pids/cpuset, freeze/thaw), log streaming, CPU/memory/disk/NIC hotplug, image management, and interactive shell/console (real PTY, over the guest vsock agent)
- Multiple disk formats (qcow2, raw)
- VM tagging and grouping
- VM scheduling (once, daily, weekly)
- Lifecycle management
- Hotplug (CPU, memory, disk, NIC)

## User Interfaces

### CLI (zyvorctl)

- 15+ subcommand groups (vm, policy, firewall, service, qos, dns, vpn, mirror, nat, monitor, ceph, net)
- Output formats: table, JSON, YAML (`-o json|yaml|table`)
- Declarative config import: `zyvorctl apply -f config.yaml`
- Config export: `zyvorctl export <resource> -o yaml`
- Ceph management: pool create, health, stats, RBD image CRUD
- Color output and progress indicators

### TUI (zyvorctl-tui)

- 8 views (Dashboard, VMs, Logs, Metrics, Network, Net Security, Storage, Help)
- Real-time updates from live API data
- Keyboard navigation with vim-style bindings
- Net Security view with 9 sub-tabs (Policies, Firewall, Services, QoS, DNS, VPN, Mirror, NAT, Monitor)
- Storage view with Ceph pool details, RBD images, and health status
- Logs view with live audit log entries
- Network view with live bridge, VLAN, and link data
- Status colors and auto-refresh

### Web UI (React)

- 37 pages + 20 network/security sub-pages
- 20+ React components + reusable UI subcomponents
- Dashboard with real-time statistics
- Cilium-style network security page with 9 tabs, label selector editors, create modals
- VM list with quick actions
- VM details, creation wizard
- Ceph storage pool creation with monitor/pool/user/keyring config
- Live logs from audit API (no mock data)
- Storage management with live pool and volume data from API
- Settings with dynamically populated storage pool dropdown
- First-run "Getting Started" panel on the dashboard when no VMs exist yet, linking straight to VM creation, templates, the API playground, and access control
- Search, live relative timestamps ("3m ago"), and one-click copy on IDs/paths/URLs across high-traffic list pages (VMs, backups, schedules, certificates, notifications, audit logs, webhooks, storage pools)
- Undo window on VM deletion — confirming delete shows a few seconds' grace with an Undo button before the VM is actually removed
- Dark theme, responsive layout
- TailwindCSS styling

## Console Access

### WebSocket Console

- Real-time browser-based terminal via xterm.js
- PTY streaming over Ephemera's vsock guest agent
- Full terminal emulation

### VNC

- VNC WebSocket proxy with noVNC web client
- Per-VM VNC configuration
- Dynamic port assignment

## Cloud-Init

- NoCloud ISO generation
- User-data and meta-data support
- Network configuration
- SSH key injection
- Package installation
- Custom script execution

## TPM / vTPM

- TPM 1.2 and 2.0 support
- swtpm integration
- Per-VM TPM instances
- TPM state persistence
- EK and platform certificates

## GPU Passthrough

- NVIDIA and AMD support
- VFIO integration

## Live Migration

- Cross-host VM migration

## Security

### Authentication

- JWT-based authentication with auto-generated signing secret (persisted to `/var/lib/zyvor-fabricd/.jwt_secret`, mode `0600`)
- Auto-generated admin password on first startup (written to `/var/lib/zyvor-fabricd/.admin_password`, mode `0600`)
- Configurable via `ZYVOR_FABRICD_JWT_SECRET` and `ZYVOR_FABRICD_ADMIN_PASSWORD` environment variables
- User management with SQLite backend
- Password hashing (bcrypt with DEFAULT_COST)
- Token generation, validation, and configurable expiration
- API key support for service-to-service auth

### Authorization (RBAC)

- Admin role (full access)
- User role (read/write)
- Viewer role (read-only)
- Resource-level authorization

### Infrastructure

- TLS/HTTPS support
- Certificate management
- Encryption at rest
- Security middleware with per-endpoint role checks
- Input validation on all user-facing parameters (VM names, IP addresses, file paths, storage identifiers)
- Parameterized SQL queries (no injection risk)
- No shell pipelines — all subprocess calls use direct argument passing
- CIDR validation on network policy rules
- Storage name validation (LVM, ZFS, NFS)

### Audit Logging

- Structured logging with tracing
- Audit logging for all operations with export
- User action tracking
- Resource modification logs
- Security event logging

## Storage

### Backends

- Local filesystem
- NFS
- LVM and LVM-thin
- ZFS (with replication)
- Ceph/RBD (cluster health, stats, RBD image management)
- Distributed storage

### Volume Operations

- Create, delete, resize, clone, attach, detach volumes
- Volume info retrieval
- Multiple formats (qcow2, raw, vmdk, vdi)

### Snapshots

- Create, list, restore snapshots
- Internal qcow2 snapshots

### Backup and Restore

- Full and incremental backups

## Networking

### Network Configuration

- Multiple network interfaces per VM
- Bridge management (create/delete)
- VLAN support
- MAC address generation
- MTU configuration

### Port Forwarding

- TCP and UDP protocol support
- nftables integration
- Forwards bind `0.0.0.0`, so they're reachable from any client on the network, not just from the host itself
- Set at VM creation via the Create VM wizard's "Expose ports" section (with a one-click Expose SSH (22) preset), or added/removed later for a running or stopped VM from its Network tab
- Adding or removing a forward on a running VM restarts it automatically to apply the change

### Network Modes

- NAT mode (default) — private, outbound-only address; reachability limited to explicit port forwards
- Bridged mode — VM gets its own address on the local network via a dedicated network namespace, veth pair, and per-namespace dnsmasq DHCP server, instead of sharing the host's NAT
  - DHCP addressing (default) — the guest leases an address automatically
  - Static addressing — the address is baked in via a generated cloud-init netplan config at boot, for guests that don't run a DHCP client or need a predictable address before first boot
- Isolated mode
- VLAN isolation

### Network Security (Cilium-style)

- **Network Policies** -- Label-based ingress/egress rules with direction badges, priority, and enforcement status
- **VM Firewall** -- Per-VM profiles with rule builder (protocol/port/CIDR/action), zones, and VM assignments
- **Service Mesh** -- Virtual IP services with load balancing (round-robin, least-conn, random, IP-hash), backend management
- **QoS / Traffic Shaping** -- Guaranteed/max rate with burst, priority-based bandwidth management, label selectors
- **DNS Policy** -- Zone management with record types (A/AAAA/CNAME/MX/TXT/SRV/PTR), upstream servers, domain blocking
- **VPN Mesh** -- WireGuard tunnels with peer editor, network topology selector (full-mesh, hub-spoke, point-to-point)
- **Packet Mirror** -- Direction selector (ingress/egress/both), collector target, protocol/port/CIDR filters
- **NAT Gateway** -- Rule types (masquerade/SNAT/DNAT/hairpin), IP pool editor, gateway configuration
- **Network Monitor** -- Threshold builder (metric/value/unit/direction/severity), live metrics, alert management

### VPN Mesh

- WireGuard-based VPN tunnels
- Point-to-point, hub-spoke, and full-mesh topologies
- Auto-mesh via label selectors
- Persistent keepalive

### Packet Mirror

- Traffic mirroring via tc mirred
- Per-VM tap interface mirroring
- Ingress, egress, and bidirectional capture
- Protocol and port filtering

### NAT Gateway

- Masquerade NAT for VM internet access
- SNAT with IP address pools
- DNAT for inbound port forwarding
- Hairpin NAT for internal loopback
- nftables-based enforcement (`vmspawnd_nat` table)

### Network Monitor

- Per-VM bandwidth monitoring
- Real-time rx/tx byte and packet rates
- Threshold-based alerts (bps, kbps, mbps, gbps)
- Alert severities (info, warning, critical)
- Log, event, and webhook alert actions
- sysfs counter collection

## High Availability

### Clustering

- etcd integration
- Multi-node support
- Leader election
- Node registration
- Heartbeat mechanism
- Health monitoring

### Failover

- Automatic leader election
- Node health checks
- Cluster state management
- Distributed configuration

### Fault Tolerance and Recovery

- Fault tolerance
- Replication
- Site recovery

## Resource Management

- Resource quotas
- Resource pools
- Autoscaling
- Performance analytics
- Predictive DRS (4 algorithms)
- Datacenters management

## Notifications

- Email
- Slack
- Webhook
- Microsoft Teams

## Content and Image Management

- Content library
- Image builder

## Host Agent

- Per-host agent for distributed management

## Ecosystem Integration

### Kubernetes Operator

- Custom Resource Definition (CRD)
- Controller implementation
- Status reporting and event handling
- Helm charts
- Automatic reconciliation
- cloud-init, TPM, and VNC integration

### Terraform Provider

- Resource: zyvor_fabric_vm
- Data source: vmspawnd_vms
- Example configurations

### Monitoring

- Prometheus metrics (`/metrics` endpoint)
- VM count and state metrics
- Operation counters (starts, stops, creates, deletes)
- Grafana dashboard and alert rules

## REST API (480+ Endpoints)

### WebSocket Endpoints

- `WS /ws/console/:name` -- Console
- `WS /ws/vnc/:name` -- VNC
- `WS /ws/events` -- Events

### Examples

- `GET /api/vms` -- List VMs
- `POST /api/vms` -- Create VM
- `GET /api/vms/:name` -- Get VM details
- `DELETE /api/vms/:name` -- Delete VM
- `POST /api/vms/:name/start` -- Start VM
- `POST /api/vms/:name/stop` -- Stop VM
- `POST /api/vms/:name/restart` -- Restart VM
- `GET /api/vms/:name/metrics` -- Get metrics
- `POST /api/vms/:name/cloud-init` -- Configure cloud-init
- `GET /api/cluster/nodes` -- List cluster nodes
- `GET /api/cluster/leader` -- Get current leader
- `GET /metrics` -- Prometheus metrics
- `GET /health` -- Health check

## Deployment

### Installation

- Build from source
- Optional systemd service (not required — the daemon runs fine under any supervisor, or in the foreground)
- Make install script
- Helm charts (for operator)

### Configuration

- TOML configuration file
- Environment variables
- Command-line arguments
- Runtime configuration

## Build and Development

- Cargo workspace (40 crates)
- npm/Vite for web UI
- GitHub Actions CI/CD
- Automated builds, formatting checks, linting
- Makefile for common tasks
- Docker support
