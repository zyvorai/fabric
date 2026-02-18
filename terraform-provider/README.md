# Terraform Provider for vmspawnd

Manage vmspawnd Virtual Machines using Terraform.

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
  endpoint = "http://localhost:8080"
  # Optional: authentication token
  # token = var.vmspawnd_token
}
```

## Resources

### vmspawnd_vm

Create and manage virtual machines.

```hcl
resource "vmspawnd_vm" "web_server" {
  name   = "web-server"
  image  = "/var/lib/vmspawnd/images/ubuntu-22.04.qcow2"
  cpus   = 2
  memory = 2048

  cloud_init = {
    user_data = <<-EOF
      #cloud-config
      packages:
        - nginx
      runcmd:
        - systemctl start nginx
    EOF
  }
}
```

## Attributes

- `name` - (Required) VM name
- `image` - (Required) Path to VM image
- `cpus` - (Optional) Number of CPUs (default: 2)
- `memory` - (Optional) Memory in MB (default: 2048)
- `cloud_init` - (Optional) cloud-init configuration
- `tpm` - (Optional) TPM configuration
- `vnc` - (Optional) VNC configuration

## Data Sources

### vmspawnd_vm

Read existing VM information.

```hcl
data "vmspawnd_vm" "existing" {
  name = "my-vm"
}

output "vm_state" {
  value = data.vmspawnd_vm.existing.state
}
```

## Development

To build the provider:

```bash
go build -o terraform-provider-vmspawnd
```

To use locally:

```bash
mkdir -p ~/.terraform.d/plugins/ssahani/vmspawnd/0.1.0/linux_amd64
cp terraform-provider-vmspawnd ~/.terraform.d/plugins/ssahani/vmspawnd/0.1.0/linux_amd64/
```
