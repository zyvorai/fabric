# Zyvor Fabric Tutorials

Step-by-step guides for learning the Zyvor Fabric VM management platform.
Each tutorial builds on concepts from the previous one, but they can also be
followed independently.

## Prerequisites

All tutorials assume:

- Zyvor Fabric is running on a Linux host with systemd v260+
- You have a valid JWT token (see Tutorial 06 for authentication details)
- `curl` and `jq` are installed
- The host has KVM support (`/dev/kvm` exists)

Set these shell variables before starting any tutorial:

```bash
export VMSPAWN_HOST="http://localhost:3000"
export TOKEN="your-jwt-token-here"
```

---

## Tutorial Index

| #  | Title                          | Level        | Time   | Description                                                        |
|----|--------------------------------|--------------|--------|--------------------------------------------------------------------|
| 01 | [Your First VM](01-first-vm.md)                  | Beginner     | 30 min | Create, start, connect to, and tear down a VM end-to-end.          |
| 02 | [VM Networking](02-networking.md)                 | Intermediate | 45 min | Bridges, VLANs, bonds, port forwarding, network policies, and DNS. |
| 03 | [Snapshots & Backups](03-snapshots-backups.md)    | Intermediate | 30 min | Point-in-time snapshots, backup policies, and disaster recovery.   |
| 04 | [Advanced VM Configuration](04-advanced-vm-options.md) | Intermediate | 40 min | VMStartOptions, hotplug, disk resize, cloud-init, and credentials. |
| 05 | [Multi-Node Clustering](05-clustering.md)         | Advanced     | 60 min | Datacenters, clusters, resource pools, migration, HA, and DRS.     |
| 06 | [Security Hardening](06-security-hardening.md)    | Advanced     | 45 min | PAM auth, RBAC, JWT, firewalls, encryption, certs, and auditing.   |

---

## Conventions Used

- **`$VMSPAWN_HOST`** -- Base URL of the Zyvor Fabric API (default `http://localhost:3000`)
- **`$TOKEN`** -- A valid JWT bearer token obtained via `/api/auth/login`
- All `curl` examples include `-s` (silent) and pipe through `jq` for readability
- Response bodies show the **essential fields**; actual responses may include additional metadata
- UUIDs in examples are illustrative; your IDs will differ

## Quick Authentication Setup

```bash
# Log in and capture the token
TOKEN=$(curl -s "$VMSPAWN_HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}' | jq -r '.token')

echo "$TOKEN"
```

---

## Feedback

Found an issue or have a suggestion? Open an issue on the project repository.
