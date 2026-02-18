# Advanced Features

## WebSocket Console

Real-time console access via WebSocket.

### Backend

WebSocket endpoint: `ws://localhost:8080/ws/console/:vmname`

Implemented in `backend/vmspawnd/src/websocket.rs`

### Frontend

Uses xterm.js for terminal emulation.

```typescript
const ws = new WebSocket(`ws://localhost:8080/ws/console/myvm`)
term.onData(data => ws.send(data))
ws.onmessage = event => term.write(event.data)
```

### Usage

1. Navigate to VM details
2. Click "Console" button
3. Interactive terminal opens

## VNC/noVNC Integration

Graphical console access via VNC.

### Backend

WebSocket VNC proxy: `ws://localhost:8080/ws/vnc/:vmname`

Implemented in `backend/vnc-proxy/src/lib.rs`

### How It Works

```
Browser (WebSocket) <-> vnc-proxy <-> VNC Server (TCP)
```

### Configuration

VNC is automatically configured per VM on ports 5900+

### Usage

1. Navigate to VM console
2. Click "VNC" tab
3. Graphical display appears

## cloud-init Support

Automate VM initialization with cloud-init.

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

- Generates ISO image with NoCloud datasource
- Attaches as CD-ROM to VM
- cloud-init reads config on first boot

## TPM/vTPM Support

Virtual Trusted Platform Module for secure boot and attestation.

### Requirements

```bash
sudo apt install swtpm swtpm-tools
```

### API

Implemented in `backend/tpm-support/src/lib.rs`

### Features

- TPM 1.2 and 2.0 support
- Automatic state management
- EK and platform certificates
- Per-VM TPM instances

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

Manage VMs as Kubernetes resources.

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
      ↓
  Controller
      ↓
  vmspawnd API
      ↓
  Virtual Machine
```

The operator watches VirtualMachine resources and reconciles them with vmspawnd.

## Metrics & Monitoring

### Prometheus Integration (Planned)

Endpoint: `/metrics`

Metrics:
- `vmspawnd_vms_total`
- `vmspawnd_vms_running`
- `vmspawnd_vm_cpu_usage`
- `vmspawnd_vm_memory_usage`

### Grafana Dashboard (Planned)

Pre-built dashboard for VM monitoring.

## High Availability (Planned)

- etcd-based state store
- Multi-node support
- VM migration
- Automatic failover
