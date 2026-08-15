# Ansible Collection for Zyvor Fabric

Ansible collection for automating Zyvor Fabric virtual machine management. Provides modules for VM lifecycle, snapshots, networking, and configuration management.

## Planned Module Structure

```
ansible/
  plugins/
    modules/
      zyvor_fabric_vm.py           # Create/delete/start/stop VMs
      vmspawnd_vm_info.py      # Gather VM facts
      vmspawnd_snapshot.py     # Create/delete/revert snapshots
      vmspawnd_network.py      # Configure VM networking
      vmspawnd_image.py        # Manage VM images
      vmspawnd_template.py     # Deploy from templates
    module_utils/
      vmspawnd_api.py          # Shared API client
  roles/
    vm_provision/              # Role to provision a VM with cloud-init
    vm_backup/                 # Role to create and manage backups
  playbooks/
    site.yml                   # Example multi-VM deployment
```

## Example Playbook

```yaml
- hosts: localhost
  collections:
    - Zyvor Fabric.Zyvor Fabric

  tasks:
    - name: Create a web server VM
      zyvor_fabric_vm:
        name: web-server
        image: /var/lib/zyvor-fabricd/images/ubuntu-22.04.qcow2
        cpus: 4
        memory: 4096
        state: started
        endpoint: http://localhost:9095
        token: "{{ vmspawnd_token }}"

    - name: Take a snapshot
      vmspawnd_snapshot:
        vm_name: web-server
        name: pre-deploy
        endpoint: http://localhost:9095
        token: "{{ vmspawnd_token }}"
```

## Development

This collection targets the Zyvor Fabric REST API. Each module uses the shared
`vmspawnd_api.py` client utility which handles authentication, error handling,
and request construction against the `/api/v1/` endpoints.

### Prerequisites

- Python 3.9+
- Ansible 2.14+
- `requests` Python library
- Running Zyvor Fabric instance

### Testing

```bash
ansible-test units
ansible-test integration
```
