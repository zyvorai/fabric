# Deployment Guide

This section covers how to deploy vmspawn in various environments, from development
workstations to production clusters.

---

## Documents

| Document                                          | Description                                |
|---------------------------------------------------|--------------------------------------------|
| [Production Deployment](production.md)            | Full production deployment guide covering system requirements, installation, configuration, security hardening, backup, and monitoring. |
| [Systemd Service Configuration](systemd-service.md) | Detailed systemd unit file with socket activation, resource limits, sandboxing, and journald integration. |

---

## Deployment Modes

vmspawn supports two deployment modes:

### Standalone Mode

A single vmspawnd instance manages VMs on the local host. This is the default
mode and is suitable for:

- Development and testing
- Single-server deployments
- Edge or branch office nodes

```toml
[controller]
enabled = false
mode = "standalone"
```

### Controller Mode

A vmspawnd instance acts as a cluster controller, managing VMs across multiple
hosts via the host-agent. This mode enables:

- Multi-host VM placement
- Live migration between hosts
- Distributed Resource Scheduling (DRS)
- High Availability (HA) failover
- Site recovery and replication

```toml
[controller]
enabled = true
mode = "controller"
cluster_name = "production-cluster"
datacenter_name = "dc-east-1"
```

---

## Quick Start

For a minimal deployment on a single host:

```bash
# 1. Build
cd backend && cargo build --release

# 2. Create directories
sudo mkdir -p /var/lib/vmspawnd/images /etc/vmspawnd

# 3. Write minimal config
sudo tee /etc/vmspawnd/vmspawnd.toml << 'EOF'
[daemon]
listen = "127.0.0.1:9095"

[storage]
path = "/var/lib/vmspawnd"

[network]
bridge = "br0"
EOF

# 4. Run
sudo ./target/release/vmspawnd
```

The daemon will start listening on `127.0.0.1:9095`. Authentication is enabled
by default; the generated admin password will be written to
`/var/lib/vmspawnd/.admin_password`.

---

## Next Steps

- See [Production Deployment](production.md) for hardened production setup
- See [Systemd Service Configuration](systemd-service.md) for systemd integration
- See [../development/building.md](../development/building.md) for build instructions
