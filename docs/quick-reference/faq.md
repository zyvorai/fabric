# Frequently Asked Questions

---

## General

### What is vmspawn?

vmspawn is an open-source virtual machine management platform built in Rust. It
provides a REST API, web UI, and CLI for managing the full lifecycle of virtual
machines on Linux hosts using systemd-vmspawn, systemd-machined, QEMU, and KVM.

### How is vmspawn different from libvirt/virt-manager?

vmspawn is built natively on systemd's machine management infrastructure rather
than libvirt. It uses `systemd-vmspawn` for VM execution, `systemd-machined` for
machine registration, and `systemd-networkd` for network configuration. This
provides tighter systemd integration, journald logging, and cgroup-based resource
management without the libvirt abstraction layer.

### What hypervisor does vmspawn use?

vmspawn uses QEMU with KVM hardware acceleration. VMs are launched via
`systemd-vmspawn`, which handles the QEMU process lifecycle, resource allocation,
and systemd integration.

### What operating systems can vmspawn manage?

vmspawn can run any operating system that QEMU/KVM supports, including Linux,
Windows, FreeBSD, and others. The host must be Linux with systemd 254 or later.

### How many VMs can vmspawn manage?

There is no hard-coded limit. The practical limit depends on host hardware
resources (CPU, memory, disk, network). The per-VM lock map is pruned at 10,000
entries, and the WebSocket connection limit is 50 concurrent sessions. The
pagination API supports listing up to 1,000 VMs per request.

### Is vmspawn production-ready?

vmspawn includes production-grade features: JWT authentication with RBAC, audit
logging, input validation and sanitization, per-VM locking, graceful shutdown,
Prometheus metrics, and comprehensive error handling. It has undergone multiple
rounds of security auditing. See the production deployment guide for recommended
configuration.

---

## Architecture

### Why is the backend written in Rust?

Rust provides memory safety without garbage collection, strong type system
guarantees, excellent async performance via Tokio, and low resource overhead.
These properties are well-suited for a systems management daemon that handles
concurrent VM operations, network configuration, and real-time event streaming.

### What is the role of systemd-machined?

`systemd-machined` is a systemd service that maintains a registry of locally
running virtual machines and containers. vmspawn uses it (via D-Bus) to query
VM state, list machines, access properties, and manage machine lifecycle. The
`MachinectlDriver` crate implements the `VMDriver` trait using this interface.

### What is the role of systemd-vmspawn?

`systemd-vmspawn` is a systemd tool that launches QEMU virtual machines with
proper systemd integration: cgroup placement, journal logging, machine
registration, and resource management. vmspawn's `vmspawn-driver` crate builds
the command-line invocation with all supported options from systemd v260.

### Why are there 46 crates?

The workspace is organized into fine-grained crates to enforce clear module
boundaries, enable independent compilation and testing, and prevent circular
dependencies. Each crate has a focused responsibility: networking crates handle
their specific protocol, management crates handle their specific domain, and
driver crates abstract the hypervisor interface.

### How does the background task system work?

vmspawnd uses the `spawn_bg!` macro to launch background tasks. Each task
receives a cloned `Arc<AppState>` and a `CancellationToken`. Tasks run as
independent Tokio tasks and are cancelled during graceful shutdown. There are
20+ background tasks handling reconciliation, monitoring, health checking,
auto-healing, and scheduled operations.

### How does the state store work?

The state store uses atomic JSON file writes (write to `.tmp` file, then
`rename()`) for crash safety. VM state is also cached in an
`Arc<RwLock<HashMap>>` for fast reads. Entity IDs are validated to prevent path
traversal. Each entity type is stored in its own subdirectory under
`/var/lib/vmspawnd/`.

---

## Security

### How does authentication work?

vmspawnd supports multiple authentication methods:
1. **Built-in**: Users stored in a SQLite database with bcrypt password hashing
2. **PAM**: Authentication delegated to the system PAM stack
3. **LDAP**: Bind authentication against an LDAP directory
4. **OIDC**: Token-based authentication with OpenID Connect providers

All authenticated sessions use JWT tokens with configurable expiration.

### What are the RBAC roles?

There are three roles:
- **Admin**: Full access to all operations including user management
- **User**: Can create, start, stop, and manage VMs and resources
- **Viewer**: Read-only access to VM listings, metrics, and logs

### How are JWT tokens secured?

JWT tokens are signed with a secret that is either set explicitly via the
`VMSPAWND_JWT_SECRET` environment variable or auto-generated and persisted to
`/var/lib/vmspawnd/.jwt_secret` (file permissions 0600). Tokens include a unique
JTI (JWT ID) that enables per-token revocation. The default expiration is 24 hours.

### How are passwords stored?

User passwords are hashed with bcrypt before storage in the SQLite database. The
admin password is either set via the `VMSPAWND_ADMIN_PASSWORD` environment variable
or auto-generated and written to `/var/lib/vmspawnd/.admin_password` (file
permissions 0600). Passwords are never logged.

### How is input validation handled?

All user-supplied input is validated before use:
- VM names: 1-64 characters, alphanumeric plus `.`, `-`, `_`, must start with
  alphanumeric
- Entity names: 1-128 characters, alphanumeric plus `.`, `-`, `_`, space
- Entity IDs: No `/`, `\`, `..`, or null bytes (prevents path traversal)
- Resource limits: CPUs 1-256, memory 64MB-1TB, disk 1-10TB
- Error messages are sanitized for non-admin users to prevent information leakage

---

## Networking

### What networking modes are supported?

vmspawn supports:
- **Bridge mode**: VMs connect to a host bridge (br0) for direct network access
- **TAP mode**: Individual TAP devices for per-VM network isolation
- **VLAN**: 802.1Q VLAN tagging for network segmentation
- **VXLAN**: Overlay networking for multi-host environments
- **WireGuard VPN mesh**: Encrypted overlay networks
- **macvtap**: Direct hardware passthrough for performance
- **SR-IOV**: Hardware-assisted virtual functions for near-native performance
- **Bond**: Link aggregation for redundancy

### How does the firewall work?

vmspawn provides per-VM firewall management:
1. Create firewall profiles with ingress/egress rules
2. Assign profiles to VMs
3. Rules are enforced via nftables
4. A background reconciler ensures rules stay in sync

### Can VMs communicate across hosts?

Yes, using VXLAN tunnels, WireGuard VPN mesh, or physical network bridging. The
service mesh provides service discovery and load balancing across hosts.

---

## Storage

### What storage backends are supported?

vmspawn supports six storage pool types:
- **Local**: Directory on the host filesystem
- **NFS**: Network File System mounts
- **LVM**: Logical Volume Manager
- **LVM-Thin**: Thin-provisioned LVM (supports overcommit)
- **ZFS**: ZFS pools with compression and data integrity
- **Ceph**: Distributed Ceph RBD for multi-node environments

### What image formats are supported?

- Raw disk images (`.raw`)
- QCOW2 (`.qcow2`) -- with snapshot and thin provisioning support
- OVA import (`.ova`)
- VMDK import (`.vmdk`)
- VDI import (`.vdi`)

### Can I resize a VM's disk while it is running?

Yes. The `/api/v1/vms/{name}/disk/resize` endpoint supports online disk resize
for running VMs. The guest OS must support online resize (most modern Linux
distributions do).

### How do snapshots work?

vmspawn snapshots capture the VM's disk state at a point in time. Snapshots are
stored as metadata in the state store and the actual disk delta is managed by the
underlying storage backend (e.g., QCOW2 overlay or LVM snapshot). You can revert
to any snapshot, and snapshot trees are supported.

---

## Operations

### How do I access a VM's console?

Two methods:
1. **Text console**: WebSocket connection at `/api/v1/ws/{vm_name}/console` using
   xterm.js in the web UI
2. **Graphical console**: VNC proxy via noVNC in the web UI, connecting through
   the VNC port assigned to the VM

### How do I monitor VM performance?

Multiple monitoring options:
- **Per-VM metrics**: `GET /api/v1/vms/{name}/metrics`
- **System analytics**: `GET /api/v1/analytics/system`
- **Prometheus endpoint**: `GET /metrics` for integration with Prometheus/Grafana
- **Network metrics**: `GET /api/v1/network-metrics/{name}`
- **Web UI dashboards**: Real-time charts via Recharts

### How do backups work?

vmspawn provides an API-driven backup system:
- Create on-demand backups via `POST /api/v1/backups`
- Schedule automated backups with backup policies (cron syntax)
- Restore from any backup via `POST /api/v1/backups/restore`
- Track backup jobs and view statistics

### Can I automate VM operations?

Yes, several automation features:
- **Schedules**: Cron-like scheduled operations (start, stop, backup)
- **Autoscale**: Automatic VM scaling based on resource utilization
- **DRS**: Automated VM placement and migration for load balancing
- **Auto-healing**: Automatic restart of failed VMs
- **Declarative specs**: Apply YAML/JSON VM specifications via
  `POST /api/v1/vms/apply`

### How does live migration work?

VMs can be migrated between hosts via `POST /api/v1/migrations`. The migration
process:
1. Pre-copy memory pages to the destination
2. Pause the VM briefly for final sync
3. Resume on the destination host
4. Clean up on the source host

Progress can be tracked via `GET /api/v1/migrations/{id}` and cancelled via
`POST /api/v1/migrations/{id}/cancel`.

### How do I enable 2FA?

Enable TOTP-based two-factor authentication in the configuration file:

```toml
[auth.totp]
enabled = true
```

Then each user sets up 2FA by calling `POST /api/v1/auth/2fa/setup`, which
returns a TOTP secret and provisioning URI for an authenticator app. After
scanning the QR code, the user confirms with `POST /api/v1/auth/2fa/verify`.
Subsequent logins require a `totp_code` field in addition to the username
and password. Backup codes are provided during setup for account recovery.

### How do I export a VM to OVA format?

Export a VM to an OVA archive for portability:

```bash
# Start the export
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/export/ova \
  -H "Authorization: Bearer $TOKEN" | jq .

# Download the OVA file
curl -s http://127.0.0.1:9095/api/v1/vms/my-vm/export/ova/download \
  -H "Authorization: Bearer $TOKEN" -o my-vm.ova
```

The OVA archive includes the VM disk image, an OVF descriptor with hardware
configuration, and a manifest file. The exported OVA can be imported into
vmspawn, VMware, or VirtualBox.

### How do I manage secrets?

vmspawn includes a built-in secrets manager for storing credentials, API keys,
and certificates. Secrets are encrypted at rest and accessible only to
authorized users.

```bash
# Create a secret
curl -s -X POST http://127.0.0.1:9095/api/v1/secrets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "db-pass", "value": "s3cret", "description": "DB password"}' | jq .

# List secrets (values are never exposed)
curl -s http://127.0.0.1:9095/api/v1/secrets \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Secrets can be injected into VMs via cloud-init or systemd credentials using
`POST /api/v1/vms/{name}/secrets`.

### How do I scan for compliance?

vmspawn supports compliance scanning against security baselines such as CIS
Benchmarks, DISA STIG, and PCI-DSS:

```bash
# List available profiles
curl -s http://127.0.0.1:9095/api/v1/compliance/profiles \
  -H "Authorization: Bearer $TOKEN" | jq .

# Scan a VM
curl -s -X POST http://127.0.0.1:9095/api/v1/compliance/scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vm_name": "my-vm", "profile_id": "cis-level1"}' | jq .
```

Scans produce findings with severity levels (critical, high, medium, low) and
remediation guidance. Enable automatic scanning with `compliance.auto_scan = true`
in the configuration file.

### How do I set up billing?

Enable billing and configure pricing in the configuration file:

```toml
[billing]
enabled = true
currency = "USD"
billing_cycle = "monthly"
cpu_rate = 0.01        # per vCPU per hour
memory_rate = 0.005    # per GB per hour
storage_rate = 0.0001  # per GB per hour
```

Once enabled, vmspawn meters resource usage per VM. View usage with
`GET /api/v1/billing/usage`, list invoices with `GET /api/v1/billing/invoices`,
and configure custom pricing tiers with `POST /api/v1/billing/pricing`.

### How do I view VM logs?

vmspawn provides centralized log aggregation for all VMs:

```bash
# Get logs for a specific VM
curl -s http://127.0.0.1:9095/api/v1/logs/my-vm \
  -H "Authorization: Bearer $TOKEN" | jq .

# Search across all VM logs
curl -s "http://127.0.0.1:9095/api/v1/logs?query=error&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Logs can also be streamed in real-time via SSE at
`GET /api/v1/logs/{vm_name}/stream`. Logs are sourced from the systemd journal
for each VM's machine scope.

### How do I connect iSCSI storage?

Enable and configure iSCSI in the configuration file:

```toml
[storage.iscsi]
enabled = true
initiator_name = "iqn.2026-01.com.example:vmspawnd"
```

Then discover and connect to iSCSI targets:

```bash
# Discover targets on a portal
curl -s -X POST http://127.0.0.1:9095/api/v1/iscsi/discover \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"portal": "192.168.1.100:3260"}' | jq .

# Log in to a target
curl -s -X POST http://127.0.0.1:9095/api/v1/iscsi/login \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"portal": "192.168.1.100:3260", "target": "iqn.2026-01.com.example:storage"}' | jq .
```

Connected iSCSI LUNs can be used as storage pool backends for VM disks.

### What is split-brain protection?

Split-brain occurs when cluster nodes lose communication and each partition
believes it is the sole authority, leading to conflicting state changes.
vmspawn prevents split-brain using quorum-based fencing:

- A cluster requires a majority of nodes (quorum) to accept write operations
- Nodes that lose quorum are automatically fenced and stop serving requests
- VMs on fenced nodes are restarted on healthy nodes after a configurable timeout
- The etcd-based leader election ensures only one controller is active at a time

Configure split-brain protection in the controller section:

```toml
[controller]
enabled = true
mode = "controller"
quorum_required = true
fencing_timeout_seconds = 30
```

---

## Configuration

### Where does vmspawnd look for its config file?

vmspawnd checks the following paths in order, using the first one found:
1. `/etc/vmspawnd/vmspawnd.toml`
2. `configs/vmspawnd.toml` (relative to working directory)
3. `vmspawnd.toml` (relative to working directory)

If no config file is found, default values are used.

### Can I run vmspawnd without authentication?

Yes, set `auth.enabled = false` in the configuration file. This is acceptable for
local development but is strongly discouraged for any deployment accessible on a
network.

### How do I change the listen address?

Set `daemon.listen` in `vmspawnd.toml`:
```toml
[daemon]
listen = "0.0.0.0:9095"   # Listen on all interfaces
```

For external access, always use a reverse proxy with TLS termination.

### How do I configure CORS for the web UI?

Set `daemon.cors_origins` in `vmspawnd.toml`:
```toml
[daemon]
cors_origins = ["https://vmspawn.example.com", "http://localhost:5173"]
```

---

## Troubleshooting

### vmspawnd fails to start with "Failed to initialize machined D-Bus driver"

`systemd-machined` is not running or not installed. Start it:
```bash
sudo systemctl start systemd-machined
```

### VMs fail to start with permission errors

Ensure the vmspawnd process has access to `/dev/kvm`:
```bash
sudo chmod 666 /dev/kvm
# Or add the vmspawnd user to the kvm group:
sudo usermod -aG kvm vmspawnd
```

### "Token expired" errors after daemon restart

If the JWT secret was not persisted (file write failed), tokens from the previous
session are invalid. Either:
- Set `VMSPAWND_JWT_SECRET` explicitly in the environment
- Ensure `/var/lib/vmspawnd/.jwt_secret` is writable

### Web UI shows "Network Error" or CORS errors

Check that `daemon.cors_origins` includes the URL where the web UI is served.
If using the Vite dev server, add `http://localhost:5173`.

### VM state shows "Unknown"

The VM may have been started outside of vmspawn, or `systemd-machined` may have
lost track of it. Check with `machinectl list` and verify the VM is registered.

### High memory usage from vmspawnd process

The vmspawnd process itself should use well under 1 GB. If memory is high:
- Check the number of cached entities in the state store
- Check WebSocket connection count (max 50)
- Check the broadcast channel for slow consumers
- Review background task logs for runaway loops

### Audit logs growing too large

Export and archive old audit logs:
```bash
curl -s http://127.0.0.1:9095/api/v1/audit/logs/export \
  -H "Authorization: Bearer $TOKEN" > audit-archive.json
```

Consider implementing log rotation or external log shipping.
