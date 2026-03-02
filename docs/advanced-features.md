# Advanced Features

## WebSocket Console

Real-time console access via WebSocket, providing an interactive terminal session to any running VM.

### Backend

WebSocket endpoint: `ws://localhost:8080/ws/console/:vmname`

Implemented in `backend/vmspawnd/src/websocket.rs`

The server authenticates the WebSocket upgrade request, attaches to the VM's serial console, and relays bidirectional I/O between the client and the VM.

### Frontend

Uses xterm.js for terminal emulation in the browser.

```typescript
const ws = new WebSocket(`ws://localhost:8080/ws/console/myvm?token=${token}`)
term.onData(data => ws.send(data))
ws.onmessage = event => term.write(event.data)
```

### Usage

1. Navigate to VM details
2. Click "Console" button
3. Interactive terminal opens in the browser

## VNC/noVNC Integration

Graphical console access via VNC, proxied over WebSocket for browser-based display.

### Backend

WebSocket VNC proxy: `ws://localhost:8080/ws/vnc/:vmname`

Implemented in `backend/vnc-proxy/src/lib.rs`

### How It Works

```
Browser (noVNC over WebSocket) <-> vnc-proxy <-> VNC Server (TCP port 5900+)
```

The VNC proxy translates between the WebSocket transport used by the browser and the raw TCP connection to the VM's VNC server. This avoids exposing VNC ports directly and allows TLS termination at the daemon level.

### Configuration

VNC is automatically configured per VM on ports 5900+. Each VM gets a unique VNC display number.

### Usage

1. Navigate to VM console
2. Click "VNC" tab
3. Graphical display appears in the browser via noVNC

## cloud-init Support

Automate VM initialization with cloud-init for unattended provisioning of users, packages, network configuration, and custom scripts.

### API Endpoint

```
POST /api/vms/:name/cloud-init
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

### Implementation

- Generates an ISO image with NoCloud datasource containing meta-data, user-data, and optional network-config
- Attaches the ISO as a CD-ROM drive to the VM
- cloud-init inside the guest reads the configuration on first boot
- Supports both cloud-init v1 and v2 network configuration formats

## TPM/vTPM Support

Virtual Trusted Platform Module for secure boot, disk encryption, and remote attestation.

### Requirements

```bash
sudo apt install swtpm swtpm-tools
# or on Fedora:
sudo dnf install swtpm swtpm-tools
```

### API

Implemented in `backend/tpm-support/src/lib.rs`

### Features

- TPM 1.2 and 2.0 support
- Automatic state management and lifecycle tied to VM lifecycle
- EK (Endorsement Key) and platform certificates
- Per-VM isolated TPM instances
- Persistent TPM state across VM reboots
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

## Kubernetes Operator

Manage VMs as native Kubernetes resources using a custom controller and CRD.

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
# Install CRD
kubectl apply -f operator/crd.yaml

# Install operator
helm install vmspawnd-operator operator/charts/vmspawnd-operator
```

### Usage

```bash
# Create VM
kubectl apply -f vm-example.yaml

# List VMs
kubectl get vm

# Get VM details
kubectl describe vm ubuntu-vm

# Delete VM
kubectl delete vm ubuntu-vm
```

### Architecture

```
Kubernetes API
      |
      v
  Controller (watches VirtualMachine resources)
      |
      v
  vmspawnd REST API
      |
      v
  Virtual Machine
```

The operator continuously reconciles the desired state declared in VirtualMachine resources with the actual VM state managed by vmspawnd. It handles creation, updates, deletion, and status reporting.

### Features

- Declarative VM management via `kubectl`
- Status subresource reflects actual VM state
- Supports all VM options: cloud-init, TPM, VNC, resource limits
- Helm chart for production deployment with RBAC and resource limits
- Leader election for high-availability operator deployments

## Terraform Provider

Declarative VM provisioning via HashiCorp Terraform.

### Usage

```hcl
provider "vmspawnd" {
  url   = "http://localhost:8080"
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

### Features

- Full CRUD lifecycle for VMs
- Import existing VMs into Terraform state
- Plan/apply workflow with accurate diffs
- Supports cloud-init, TPM, VNC, tags, and resource pool assignment

## Metrics and Monitoring

### Prometheus Integration

The daemon exposes a Prometheus-compatible metrics endpoint.

Endpoint: `GET /metrics`

Metrics include:

- `vmspawnd_vms_total` -- Total number of VMs
- `vmspawnd_vms_running` -- Number of currently running VMs
- `vmspawnd_vm_cpu_usage` -- Per-VM CPU utilization (labeled by VM name)
- `vmspawnd_vm_memory_usage` -- Per-VM memory utilization
- `vmspawnd_vm_disk_read_bytes` -- Per-VM disk read throughput
- `vmspawnd_vm_disk_write_bytes` -- Per-VM disk write throughput
- `vmspawnd_vm_network_rx_bytes` -- Per-VM network receive throughput
- `vmspawnd_vm_network_tx_bytes` -- Per-VM network transmit throughput
- `vmspawnd_api_requests_total` -- Total API requests (labeled by method and path)
- `vmspawnd_api_request_duration_seconds` -- API request latency histogram

### Prometheus Configuration

```yaml
scrape_configs:
  - job_name: vmspawnd
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Grafana Dashboard

A pre-built Grafana dashboard is included for VM monitoring. It provides:

- VM overview panel with running/stopped/error counts
- Per-VM CPU and memory utilization graphs
- Network and disk I/O graphs
- API request rate and latency panels
- Alert panels for resource threshold violations

Import the dashboard JSON from `monitoring/grafana-dashboard.json`.

## High Availability

Multi-node deployment for fault tolerance and zero-downtime operation.

### Architecture

- **etcd-based state store** -- Replaces the single-node JSON file store with a distributed etcd backend for consistent, replicated state across nodes.
- **Multi-node support** -- Multiple vmspawnd instances can run concurrently, each managing VMs on its respective host.
- **VM migration** -- Live migration of running VMs between hosts with minimal downtime.
- **Automatic failover** -- If a node becomes unreachable, its VMs are automatically restarted on healthy nodes.
- **Health monitoring** -- Nodes exchange heartbeats and health status. Unhealthy nodes are fenced to prevent split-brain scenarios.

### Configuration

```toml
[ha]
enabled = true
etcd_endpoints = ["http://etcd1:2379", "http://etcd2:2379", "http://etcd3:2379"]
node_name = "node-01"
heartbeat_interval = "5s"
failover_timeout = "30s"
```

### Requirements

- etcd cluster (3+ nodes recommended for quorum)
- Network connectivity between all vmspawnd nodes
- Shared or replicated storage for VM disk images (if live migration is used)
