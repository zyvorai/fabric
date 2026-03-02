# vmspawnd Feature Reference

## Project Statistics

- 36 backend crates
- 142 Rust source files, 117 TypeScript files
- ~119,000 lines of code (96K Rust + 23K TypeScript)
- 480+ REST API endpoints + 3 WebSocket endpoints
- 36 web pages + 10 network sub-pages
- 20 React components + 4 UI subcomponents
- 3 RBAC roles (Admin, User, Viewer)
- 4 disk formats (qcow2, raw, vmdk, vdi)

---

## VM Management

- Create, start, stop, restart, delete, clone VMs
- VM templates
- VM state persistence
- systemd-vmspawn and systemd-machined integration
- CPU and memory configuration
- Multiple disk formats (qcow2, raw, vmdk, vdi)
- VM tagging and grouping
- VM scheduling (once, daily, weekly)
- Lifecycle management
- Hotplug (CPU, memory, disk, NIC)

## User Interfaces

### CLI (vmctl)

- Tabular and JSON output
- Color output
- Progress indicators

### TUI (vmctl-tui)

- 7 views
- Real-time updates
- Keyboard navigation with vim-style bindings
- Status colors and auto-refresh

### Web UI (React)

- 36 pages + 10 network sub-pages
- 20 React components + 4 UI subcomponents
- Dashboard with real-time statistics
- VM list with quick actions
- VM details, creation wizard
- Dark theme, responsive layout
- TailwindCSS styling

## Console Access

### WebSocket Console

- Real-time browser-based terminal via xterm.js
- PTY streaming from machinectl
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

- JWT-based authentication
- User management
- Password hashing (bcrypt)
- Token generation, validation, and expiration
- API key support

### Authorization (RBAC)

- Admin role (full access)
- User role (read/write)
- Viewer role (read-only)
- Resource-level authorization

### Infrastructure

- TLS/HTTPS support
- Certificate management
- Encryption
- Security middleware
- Request validation

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
- Ceph/RBD
- Distributed storage
- Thin provisioning

### Volume Operations

- Create, delete, resize, clone volumes
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
- iptables integration

### Network Modes

- NAT mode
- Bridged mode
- Isolated mode
- VLAN isolation

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

- Resource: vmspawnd_vm
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
- systemd service
- Make install script
- Helm charts (for operator)

### Configuration

- TOML configuration file
- Environment variables
- Command-line arguments
- Runtime configuration

## Build and Development

- Cargo workspace
- npm/Vite for web UI
- GitHub Actions CI/CD
- Automated builds, formatting checks, linting
- Makefile for common tasks
- Docker support
