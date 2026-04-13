# vmspawn Quick Reference

One-page cheat sheet for common operations with vmspawn.

---

## Authentication

```bash
# Log in and get a JWT token
TOKEN=$(curl -s http://127.0.0.1:9095/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "YOUR_PASSWORD"}' | jq -r '.token')

# Check current user
curl -s http://127.0.0.1:9095/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## VM Lifecycle

### Create a VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/v1/vms \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-vm",
    "image": "fedora-40.raw",
    "cpus": 2,
    "memory": 2048,
    "disk": 20,
    "hostname": "my-vm.local",
    "tags": ["web", "production"]
  }' | jq .
```

### List VMs

```bash
# List all VMs
curl -s http://127.0.0.1:9095/api/v1/vms \
  -H "Authorization: Bearer $TOKEN" | jq .

# With pagination
curl -s "http://127.0.0.1:9095/api/v1/vms?offset=0&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Get VM Details

```bash
curl -s http://127.0.0.1:9095/api/v1/vms/my-vm \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Start a VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/start \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Stop a VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/stop \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Restart a VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/restart \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Pause / Resume

```bash
# Pause
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/pause \
  -H "Authorization: Bearer $TOKEN" | jq .

# Resume
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/resume \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Clone a VM

```bash
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/clone \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-vm-clone"}' | jq .
```

### Delete a VM

```bash
curl -s -X DELETE http://127.0.0.1:9095/api/v1/vms/my-vm \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Snapshots

```bash
# Create a snapshot
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/snapshots \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "Before upgrade"}' | jq .

# List snapshots
curl -s http://127.0.0.1:9095/api/v1/vms/my-vm/snapshots \
  -H "Authorization: Bearer $TOKEN" | jq .

# Revert to a snapshot
curl -s -X POST http://127.0.0.1:9095/api/v1/vms/my-vm/snapshots/SNAPSHOT_ID/revert \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Images

```bash
# List available images
curl -s http://127.0.0.1:9095/api/v1/images \
  -H "Authorization: Bearer $TOKEN" | jq .

# List cloud images available for download
curl -s http://127.0.0.1:9095/api/v1/images/cloud \
  -H "Authorization: Bearer $TOKEN" | jq .

# Download a cloud image
curl -s -X POST http://127.0.0.1:9095/api/v1/images/cloud/download \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://download.fedoraproject.org/pub/fedora/linux/releases/40/Cloud/x86_64/images/Fedora-Cloud-Base-40-1.14.x86_64.raw.xz", "name": "fedora-40"}' | jq .
```

---

## Metrics and Monitoring

```bash
# Get VM metrics
curl -s http://127.0.0.1:9095/api/v1/vms/my-vm/metrics \
  -H "Authorization: Bearer $TOKEN" | jq .

# System performance
curl -s http://127.0.0.1:9095/api/v1/analytics/system \
  -H "Authorization: Bearer $TOKEN" | jq .

# Prometheus metrics (no auth required)
curl -s http://127.0.0.1:9095/metrics

# Network metrics
curl -s http://127.0.0.1:9095/api/v1/network-metrics/my-vm \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Networking

```bash
# List bridges
curl -s http://127.0.0.1:9095/api/v1/networkd/bridges \
  -H "Authorization: Bearer $TOKEN" | jq .

# List network interfaces (via netlink)
curl -s http://127.0.0.1:9095/api/v1/networkd/netlink/interfaces \
  -H "Authorization: Bearer $TOKEN" | jq .

# Create a VLAN
curl -s -X POST http://127.0.0.1:9095/api/v1/networkd/vlans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "vlan100", "vlan_id": 100, "parent": "eth0"}' | jq .

# List firewall profiles
curl -s http://127.0.0.1:9095/api/v1/firewall-profiles \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Backups

```bash
# Create a backup
curl -s -X POST http://127.0.0.1:9095/api/v1/backups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vm_name": "my-vm", "description": "Weekly backup"}' | jq .

# List backups
curl -s http://127.0.0.1:9095/api/v1/backups \
  -H "Authorization: Bearer $TOKEN" | jq .

# Restore a backup
curl -s -X POST http://127.0.0.1:9095/api/v1/backups/restore \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"backup_id": "BACKUP_ID"}' | jq .
```

---

## Templates

```bash
# Create a template from a VM
curl -s -X POST http://127.0.0.1:9095/api/v1/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "web-server-template", "source_vm": "my-vm"}' | jq .

# Deploy a VM from a template
curl -s -X POST http://127.0.0.1:9095/api/v1/templates/TEMPLATE_ID/deploy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vm_name": "web-server-2"}' | jq .
```

---

## System Information

```bash
# CPU topology
curl -s http://127.0.0.1:9095/api/v1/system/cpu/topology \
  -H "Authorization: Bearer $TOKEN" | jq .

# NUMA topology
curl -s http://127.0.0.1:9095/api/v1/system/numa/topology \
  -H "Authorization: Bearer $TOKEN" | jq .

# System memory
curl -s http://127.0.0.1:9095/api/v1/system/memory \
  -H "Authorization: Bearer $TOKEN" | jq .

# Firmware capabilities
curl -s http://127.0.0.1:9095/api/v1/system/firmware/capabilities \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Configuration Quick Reference

### vmspawnd.toml

```toml
[daemon]
listen = "127.0.0.1:9095"       # Bind address
cors_origins = ["http://..."]    # Allowed CORS origins

[storage]
path = "/var/lib/vmspawnd"       # State directory
image_path = "/var/lib/vmspawnd/images"  # VM images

[network]
bridge = "br0"                   # Default bridge
networkd_config_dir = "/etc/systemd/network"
networkd_file_prefix = "50-vmspawnd-"

[auth]
enabled = true                   # Enable authentication
db_path = "/var/lib/vmspawnd/auth.db"
token_expiration_hours = 24      # JWT lifetime

[controller]
enabled = false                  # Multi-host mode
mode = "standalone"              # or "controller"
```

### Environment Variables

| Variable                  | Purpose                              |
|---------------------------|--------------------------------------|
| `VSPAWN_LOG_LEVEL`        | Log level: trace/debug/info/warn/error |
| `RUST_LOG`                | Fallback log filter                  |
| `VMSPAWND_JWT_SECRET`     | JWT signing secret                   |
| `VMSPAWND_ADMIN_PASSWORD` | Initial admin password               |

---

## Troubleshooting Quick Reference

### Daemon will not start

```bash
# Check for port conflicts
ss -tlnp | grep 9095

# Check systemd service status
sudo systemctl status vmspawnd
journalctl -u vmspawnd -n 50

# Check config file syntax
cat /etc/vmspawnd/vmspawnd.toml | toml-lint  # or just try to start
```

### VM will not start

```bash
# Check KVM availability
ls -la /dev/kvm

# Check systemd-machined
systemctl status systemd-machined

# Check the VM state and last error
curl -s http://127.0.0.1:9095/api/v1/vms/my-vm \
  -H "Authorization: Bearer $TOKEN" | jq '.last_error'

# Check systemd journal for vmspawn errors
journalctl -u vmspawnd --since "5 min ago" | grep -i error
```

### Authentication failures

```bash
# Read the auto-generated admin password
sudo cat /var/lib/vmspawnd/.admin_password

# Verify JWT secret exists
sudo ls -la /var/lib/vmspawnd/.jwt_secret

# Check auth config
grep -A5 '\[auth\]' /etc/vmspawnd/vmspawnd.toml
```

### Network issues

```bash
# Check bridge exists
ip link show br0

# Check systemd-networkd status
networkctl status

# List managed network files
curl -s http://127.0.0.1:9095/api/v1/networkd/files \
  -H "Authorization: Bearer $TOKEN" | jq .

# Reload networkd
curl -s -X POST http://127.0.0.1:9095/api/v1/networkd/reload \
  -H "Authorization: Bearer $TOKEN" | jq .
```
