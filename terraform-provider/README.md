# Terraform Provider for vmspawnd

Provision and manage vmspawnd virtual machines using HashiCorp Terraform. Supports the full VM lifecycle with plan/apply workflow, cloud-init, TPM, and VNC configuration.

## Installation

```hcl
terraform {
  required_providers {
    vmspawnd = {
      source  = "ssahani/vmspawnd"
      version = "~> 0.1"
    }
  }
}
```

## Provider Configuration

```hcl
provider "vmspawnd" {
  endpoint = "http://localhost:9095"
  # token  = var.vmspawnd_token    # Required when auth is enabled
}
```

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `endpoint` | Yes | -- | vmspawnd API URL |
| `token` | No | -- | JWT or API key for authentication |

## Resources

### vmspawnd_vm

Manages a virtual machine through its full lifecycle (create, update, delete).

```hcl
resource "vmspawnd_vm" "web_server" {
  name   = "web-server"
  image  = "/var/lib/vmspawnd/images/ubuntu-22.04.qcow2"
  cpus   = 4
  memory = 4096

  cloud_init = {
    user_data = <<-EOF
      #cloud-config
      packages:
        - nginx
        - qemu-guest-agent
      runcmd:
        - systemctl enable --now nginx
        - systemctl start qemu-guest-agent
    EOF
  }

  tpm = {
    enabled = true
    version = "2.0"
  }

  vnc = {
    enabled = true
  }
}
```

#### Argument Reference

| Argument | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | string | Yes | -- | VM name (must be unique) |
| `image` | string | Yes | -- | Path to VM disk image |
| `cpus` | number | No | 2 | Number of vCPUs |
| `memory` | number | No | 2048 | Memory in MB |
| `cloud_init` | object | No | -- | cloud-init configuration block |
| `tpm` | object | No | -- | TPM configuration block |
| `vnc` | object | No | -- | VNC configuration block |

#### Attribute Reference

| Attribute | Description |
|-----------|-------------|
| `state` | Current VM state (running, stopped, paused) |
| `ip_address` | Primary IP address of the VM |

## Data Sources

### vmspawnd_vm

Read information about an existing VM.

```hcl
data "vmspawnd_vm" "existing" {
  name = "my-vm"
}

output "vm_state" {
  value = data.vmspawnd_vm.existing.state
}

output "vm_ip" {
  value = data.vmspawnd_vm.existing.ip_address
}
```

## Multi-VM Example

```hcl
variable "app_servers" {
  default = ["app-1", "app-2", "app-3"]
}

resource "vmspawnd_vm" "app" {
  for_each = toset(var.app_servers)

  name   = each.key
  image  = "/var/lib/vmspawnd/images/ubuntu-22.04.qcow2"
  cpus   = 2
  memory = 4096

  cloud_init = {
    user_data = templatefile("cloud-init.yaml.tpl", {
      hostname = each.key
    })
  }
}
```

## Development

### Build the Provider

```bash
go build -o terraform-provider-vmspawnd
```

### Install Locally

```bash
mkdir -p ~/.terraform.d/plugins/ssahani/vmspawnd/0.1.0/linux_amd64
cp terraform-provider-vmspawnd ~/.terraform.d/plugins/ssahani/vmspawnd/0.1.0/linux_amd64/
```

### Run Tests

```bash
go test ./...
```
