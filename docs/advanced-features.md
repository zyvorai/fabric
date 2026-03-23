# Advanced Features

## WebSocket Console

Real-time interactive terminal access to any running VM via WebSocket.

**Endpoint:** `ws://localhost:9095/ws/console/:vmname`

The server authenticates the WebSocket upgrade, attaches to the VM's serial console, and relays bidirectional I/O between the client and the VM.

### Browser (xterm.js)

```typescript
const ws = new WebSocket(`ws://localhost:9095/ws/console/myvm?token=${token}`)
term.onData(data => ws.send(data))
ws.onmessage = event => term.write(event.data)
```

### Web UI

1. Navigate to VM details
2. Click **Console**
3. Interactive terminal opens in the browser

---

## VNC / noVNC Integration

Graphical console access via VNC, proxied over WebSocket for browser-based display.

**Endpoint:** `ws://localhost:9095/ws/vnc/:vmname`

```
Browser (noVNC over WebSocket) <-> vnc-proxy <-> VNC Server (TCP 5900+)
```

The proxy translates between WebSocket (browser) and raw TCP (VNC server), avoiding direct VNC port exposure and enabling TLS termination at the daemon level.

Each VM gets a unique VNC display number on ports 5900+.

### Web UI

1. Navigate to VM console
2. Click **VNC** tab
3. Graphical display appears via noVNC

---

## cloud-init

Automated VM initialization with users, packages, network configuration, and custom scripts.

### API

```
POST /api/vms/:name/cloud-init
```

```json
{
  "instance_id": "vm1",
  "hostname": "vm1",
  "user_data": "#cloud-config\n...",
  "network_config": "..."
}
```

### Example User Data

```yaml
#cloud-config
users:
  - name: ubuntu
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ssh-rsa AAAA...
packages:
  - qemu-guest-agent
  - docker.io
runcmd:
  - systemctl start qemu-guest-agent
```

### How It Works

1. vmspawnd generates an ISO with NoCloud datasource (meta-data, user-data, optional network-config)
2. The ISO is attached as a CD-ROM drive to the VM
3. cloud-init inside the guest reads the config on first boot
4. Supports both v1 and v2 network configuration formats

---

## TPM / vTPM

Virtual Trusted Platform Module for secure boot, disk encryption, and remote attestation.

### Requirements

```bash
sudo dnf install swtpm swtpm-tools    # Fedora/RHEL
sudo apt install swtpm swtpm-tools    # Debian/Ubuntu
```

### Capabilities

- TPM 1.2 and 2.0 support
- Automatic lifecycle tied to VM lifecycle
- EK (Endorsement Key) and platform certificates
- Per-VM isolated TPM instances with persistent state
- Compatible with Windows BitLocker and Linux LUKS

### Usage

```rust
let tpm_manager = TPMManager::new("/var/lib/vmspawnd/tpm")?;
let tpm_dir = tpm_manager.create_vtpm(&config).await?;
let pid = tpm_manager.start_swtpm("myvm", TPMVersion::TPM20).await?;
```

### QEMU Integration

```bash
-chardev socket,id=chrtpm,path=/var/lib/vmspawnd/tpm/myvm/swtpm-sock
-tpmdev emulator,id=tpm0,chardev=chrtpm
-device tpm-tis,tpmdev=tpm0
```

---

## Kubernetes Operator

Manage VMs as native Kubernetes resources.

### CRD

```yaml
apiVersion: vmspawnd.io/v1alpha1
kind: VirtualMachine
metadata:
  name: ubuntu-vm
spec:
  image: /path/to/image.qcow2
  cpus: 4
  memory: 4096
  cloudInit:
    userData: |
      #cloud-config
      ...
  tpm:
    enabled: true
  vnc:
    enabled: true
```

### Installation

```bash
kubectl apply -f operator/crd.yaml
helm install vmspawnd-operator operator/charts/vmspawnd-operator
```

### Usage

```bash
kubectl apply -f vm-example.yaml
kubectl get vm
kubectl describe vm ubuntu-vm
kubectl delete vm ubuntu-vm
```

### Architecture

```
Kubernetes API --> Controller (watches VirtualMachine CRs) --> vmspawnd REST API --> VMs
```

The operator continuously reconciles desired state with actual VM state, handling creation, updates, deletion, and status reporting.

See [operator/README.md](../operator/README.md) for full documentation.

---

## Terraform Provider

Declarative VM provisioning via HashiCorp Terraform.

```hcl
provider "vmspawnd" {
  url   = "http://localhost:9095"
  token = var.vmspawnd_token
}

resource "vmspawnd_vm" "web" {
  name   = "web-server"
  image  = "/var/lib/vmspawnd/images/ubuntu-22.04.qcow2"
  cpus   = 4
  memory = 4096

  cloud_init {
    user_data = file("cloud-init.yaml")
  }

  tpm {
    enabled = true
    version = "2.0"
  }
}
```

Features: full CRUD lifecycle, import existing VMs, plan/apply workflow with diffs, cloud-init/TPM/VNC/tags support.

See [terraform-provider/README.md](../terraform-provider/README.md) for full documentation.

---

## Prometheus Metrics

**Endpoint:** `GET /metrics`

### VM Metrics

| Metric | Description |
|--------|-------------|
| `vmspawnd_vms_total` | Total VM count |
| `vmspawnd_vms_running` | Running VM count |
| `vmspawnd_vm_cpu_usage` | Per-VM CPU utilization |
| `vmspawnd_vm_memory_usage` | Per-VM memory utilization |
| `vmspawnd_vm_disk_read_bytes` | Per-VM disk read throughput |
| `vmspawnd_vm_disk_write_bytes` | Per-VM disk write throughput |
| `vmspawnd_vm_network_rx_bytes` | Per-VM network receive |
| `vmspawnd_vm_network_tx_bytes` | Per-VM network transmit |

### API Metrics

| Metric | Description |
|--------|-------------|
| `vmspawnd_api_requests_total` | Total API requests (by method, path) |
| `vmspawnd_api_request_duration_seconds` | Request latency histogram |

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: vmspawnd
    static_configs:
      - targets: ['localhost:9095']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Grafana Dashboard

Import the pre-built dashboard from `monitoring/grafana-dashboard.json` for:
- VM overview panel with running/stopped/error counts
- Per-VM CPU and memory graphs
- Network and disk I/O graphs
- API request rate and latency panels
- Alert panels for resource threshold violations

---

## High Availability

Multi-node deployment for fault-tolerant operation.

- **etcd-based state store** for consistent, replicated state
- **Multi-node support** with concurrent vmspawnd instances
- **Live migration** of running VMs between hosts
- **Automatic failover** on node failure
- **Health monitoring** with heartbeats and fencing

```toml
[ha]
enabled = true
etcd_endpoints = ["http://etcd1:2379", "http://etcd2:2379", "http://etcd3:2379"]
node_name = "node-01"
heartbeat_interval = "5s"
failover_timeout = "30s"
```

Requirements: etcd cluster (3+ nodes), network connectivity between nodes, shared/replicated storage for live migration.

See [high-availability.md](high-availability.md) for the full setup guide.
