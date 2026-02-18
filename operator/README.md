## Kubernetes Operator for vmspawnd

Manage Virtual Machines as Kubernetes resources.

### Features

- Declarative VM management
- cloud-init integration
- TPM support
- VNC support
- Auto-reconciliation

### Installation

```bash
# Install CRD
kubectl apply -f https://raw.githubusercontent.com/ssahani/vmspawn/main/operator/crd.yaml

# Install operator via Helm
helm repo add vmspawnd https://ssahani.github.io/vmspawn
helm install vmspawnd-operator vmspawnd/vmspawnd-operator
```

### Usage

Create a VM:

```yaml
apiVersion: vmspawnd.io/v1alpha1
kind: VirtualMachine
metadata:
  name: my-vm
spec:
  image: /var/lib/vmspawnd/images/ubuntu-22.04.qcow2
  cpus: 2
  memory: 2048
```

```bash
kubectl apply -f vm.yaml
kubectl get vm
kubectl describe vm my-vm
```

### Development

```bash
# Build
cargo build --release

# Build Docker image
docker build -t vmspawnd-operator:latest .

# Run locally
cargo run
```

### Configuration

Set environment variables:

- `VMSPAWND_URL`: URL of vmspawnd API (default: http://vmspawnd:8080)
- `RUST_LOG`: Logging level (default: info)
