terraform {
  required_providers {
    vmspawnd = {
      source  = "ssahani/vmspawnd"
      version = "~> 0.1"
    }
  }
}

provider "vmspawnd" {
  endpoint = "http://localhost:8080"
}

resource "vmspawnd_vm" "example" {
  name   = "terraform-vm"
  image  = "/var/lib/vmspawnd/images/ubuntu-22.04.qcow2"
  cpus   = 4
  memory = 4096

  cloud_init = {
    user_data = <<-EOF
      #cloud-config
      users:
        - name: ubuntu
          sudo: ALL=(ALL) NOPASSWD:ALL
          shell: /bin/bash
      packages:
        - qemu-guest-agent
    EOF
  }

  tpm = {
    enabled = true
    version = "2.0"
  }

  vnc = {
    enabled = true
    port    = 5900
  }
}

output "vm_name" {
  value = vmspawnd_vm.example.name
}

output "vm_state" {
  value = vmspawnd_vm.example.state
}
