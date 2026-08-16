# Zyvor Fabric Kubernetes Operator

Manage virtual machines as native Kubernetes resources. The operator watches `VirtualMachine` custom resources and reconciles them against the Zyvor Fabric API, handling creation, updates, deletion, and status reporting automatically.

## Features

- Declarative VM management via `kubectl`
- cloud-init, TPM, and VNC support in CRD spec
- Auto-reconciliation -- continuously ensures desired state matches actual state
- Status subresource reflects real-time VM state
- Helm chart with RBAC and resource limits for production deployment
- Leader election for high-availability operator deployments

## Quick Start

### Install the CRD and Operator

```bash
# Install CRD
kubectl apply -f https://raw.githubusercontent.com/ssahani/zyvor-fabric/main/operator/crd.yaml

# Install operator via Helm
helm repo add zyvor-fabric https://ssahani.github.io/zyvor-fabric
helm install zyvor-fabricd-operator zyvor-fabric/zyvor-fabricd-operator
```

### Create a VM

Define a `VirtualMachine` resource:

```yaml
apiVersion: Zyvor Fabric.io/v1alpha1
kind: VirtualMachine
metadata:
  name: my-vm
spec:
  image: /var/lib/zyvor-fabricd/images/ubuntu-22.04.qcow2
  cpus: 2
  memory: 2048
  cloudInit:
    userData: |
      #cloud-config
      packages:
        - qemu-guest-agent
      runcmd:
        - systemctl start qemu-guest-agent
  tpm:
    enabled: true
    version: "2.0"
  vnc:
    enabled: true
```

Apply it:

```bash
kubectl apply -f vm.yaml
```

### Manage VMs with kubectl

```bash
kubectl get vm                  # List all VMs
kubectl describe vm my-vm       # Detailed status and events
kubectl delete vm my-vm         # Delete a VM
```

## Architecture

```
Kubernetes API Server
        |
        v
  Operator Controller
  (watches VirtualMachine CRs)
        |
        v
  Zyvor Fabric REST API
        |
        v
  Virtual Machines
```

The operator runs a reconciliation loop that:
1. Watches for `VirtualMachine` resource changes
2. Compares desired spec against actual VM state in Zyvor Fabric
3. Creates, updates, or deletes VMs to match the declared state
4. Reports VM status back to the Kubernetes status subresource

## CRD Spec Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `image` | string | Yes | -- | Path to VM disk image |
| `cpus` | integer | No | 2 | Number of vCPUs |
| `memory` | integer | No | 2048 | Memory in MB |
| `cloudInit.userData` | string | No | -- | cloud-init user-data (cloud-config YAML) |
| `tpm.enabled` | boolean | No | false | Enable virtual TPM |
| `tpm.version` | string | No | "2.0" | TPM version (1.2 or 2.0) |
| `vnc.enabled` | boolean | No | false | Enable VNC display |

## Configuration

The operator is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ZYVOR_FABRICD_URL` | `http://zyvor-fabricd:8080` | URL of the zyvor-fabricd API |
| `RUST_LOG` | `info` | Log level (trace, debug, info, warn, error) |

## Development

```bash
# Build the operator
cd operator
cargo build --release

# Run locally (requires kubeconfig and Zyvor Fabric access)
cargo run

# Build Docker image
docker build -t zyvor-fabricd-operator:latest .

# Run tests
cargo test
```
