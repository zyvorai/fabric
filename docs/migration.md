# VM Migration Guide

## Overview

vmspawnd supports both live (zero-downtime) and offline VM migration between nodes.

## Migration Types

### Live Migration

Migrate running VM with minimal downtime (~1-2 seconds).

**Requirements:**
- Shared storage (NFS, Ceph) OR
- High-bandwidth network for disk sync
- Same CPU architecture on source and target

### Offline Migration

Stop VM, copy data, start on target.

**Advantages:**
- Works with local storage
- Faster for large VMs
- No CPU compatibility required

## Live Migration

### Basic Live Migration

```bash
curl -X POST http://localhost:8080/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "live": true
  }'
```

### With Compression

```bash
curl -X POST http://localhost:8080/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "live": true,
    "compress": true,
    "bandwidth_mbps": 100
  }'
```

### Using vmctl

```bash
# Live migrate
vmctl migrate myvm --to node2 --live

# With options
vmctl migrate myvm \
  --to node2 \
  --live \
  --compress \
  --bandwidth 100
```

## Offline Migration

```bash
# Stop VM, migrate, start
vmctl migrate myvm --to node2 --offline

# API
curl -X POST http://localhost:8080/api/vms/myvm/migrate \
  -d '{"target_node": "node2", "live": false}'
```

## Migration Status

### Check Progress

```bash
# CLI
vmctl migrate status myvm

# API
curl http://localhost:8080/api/vms/myvm/migrate/status
```

Response:
```json
{
  "vm_name": "myvm",
  "status": "copying",
  "progress_percent": 45,
  "error": null
}
```

### Cancel Migration

```bash
# CLI
vmctl migrate cancel myvm

# API
curl -X POST http://localhost:8080/api/vms/myvm/migrate/cancel
```

## Shared Storage Setup

### NFS

#### Server (node1)

```bash
# Install NFS
sudo apt install nfs-kernel-server

# Configure exports
sudo vi /etc/exports
```

Add:
```
/var/lib/vmspawnd/images 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
```

```bash
# Apply changes
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

#### Client (node2)

```bash
# Install NFS client
sudo apt install nfs-common

# Mount NFS share
sudo mount node1:/var/lib/vmspawnd/images /var/lib/vmspawnd/images

# Auto-mount on boot
echo "node1:/var/lib/vmspawnd/images /var/lib/vmspawnd/images nfs defaults 0 0" | sudo tee -a /etc/fstab
```

### Ceph/RBD

```toml
[storage]
backend = "rbd"
pool = "vmspawnd"
monitors = ["mon1:6789", "mon2:6789", "mon3:6789"]
```

## Network Requirements

### Bandwidth

Recommended bandwidth:

- **Live migration**: 1 Gbps minimum, 10 Gbps recommended
- **Offline migration**: 100 Mbps minimum

### Latency

- **Live migration**: <5ms RTT
- **Offline migration**: <100ms RTT

### Ports

Ensure these ports are open:
- SSH (22) - for rsync
- vmspawnd API (8080)

## Pre-Migration Checks

```bash
# Verify target node is healthy
vmctl node status node2

# Check available resources
vmctl node resources node2

# Verify network connectivity
ping -c 3 node2

# Test SSH access
ssh node2 echo "OK"
```

## Migration Process

### Live Migration Steps

1. **Pre-copy**: Copy memory pages while VM runs
2. **Iterative copy**: Copy changed pages
3. **Stop-and-copy**: Brief pause, copy final state
4. **Resume**: Start VM on target
5. **Cleanup**: Remove VM from source

### Offline Migration Steps

1. **Stop VM** on source node
2. **Copy disk** images to target
3. **Copy configuration** to target
4. **Start VM** on target node
5. **Verify** VM is running
6. **Cleanup** source node

## Advanced Options

### CPU Compatibility

For live migration, CPUs must be compatible:

```bash
# Check CPU flags
cat /proc/cpuinfo | grep flags

# Use CPU model
curl -X POST /api/vms/myvm/migrate \
  -d '{
    "target_node": "node2",
    "live": true,
    "cpu_model": "host-passthrough"
  }'
```

### Memory Dirty Rate

Limit memory dirty rate for faster convergence:

```bash
curl -X POST /api/vms/myvm/migrate \
  -d '{
    "target_node": "node2",
    "live": true,
    "max_dirty_rate_mbps": 50
  }'
```

### Auto-Converge

Enable auto-converge for better success rate:

```bash
curl -X POST /api/vms/myvm/migrate \
  -d '{
    "target_node": "node2",
    "live": true,
    "auto_converge": true
  }'
```

## Monitoring

### Migration Metrics

```bash
# Get migration statistics
curl http://localhost:8080/api/vms/myvm/migrate/stats
```

Response:
```json
{
  "total_bytes": 4294967296,
  "transferred_bytes": 1932735283,
  "remaining_bytes": 2362232013,
  "transfer_rate_mbps": 125,
  "downtime_ms": 1500,
  "duration_seconds": 45
}
```

### Prometheus Metrics

```
vmspawnd_migration_duration_seconds
vmspawnd_migration_downtime_seconds
vmspawnd_migration_total_bytes
vmspawnd_migration_success_total
vmspawnd_migration_failure_total
```

## Troubleshooting

### Migration Fails

```bash
# Check logs
sudo journalctl -u vmspawnd -f

# Verify connectivity
ping node2
ssh node2 echo "OK"

# Check disk space
ssh node2 df -h /var/lib/vmspawnd
```

### High Downtime

If live migration downtime is too high:

1. Reduce memory dirty rate
2. Enable auto-converge
3. Increase bandwidth limit
4. Use compression

### Incompatible CPUs

```bash
# Use compatible CPU model
--cpu-model Nehalem  # Lowest common denominator
```

## Best Practices

1. **Test first**: Try migration in staging
2. **Shared storage**: Use for live migration
3. **Network**: Dedicated migration network
4. **Timing**: Migrate during low-traffic periods
5. **Monitoring**: Watch metrics during migration
6. **Rollback**: Keep source until target verified
7. **Documentation**: Document node topology

## Automated Migration

### Load Balancing

```bash
# Enable auto-migration
curl -X POST http://localhost:8080/api/cluster/config \
  -d '{
    "auto_migrate": true,
    "target_utilization": 70,
    "check_interval_seconds": 300
  }'
```

### Scheduled Migration

```bash
# Schedule migration
curl -X POST http://localhost:8080/api/vms/myvm/migrate/schedule \
  -d '{
    "target_node": "node2",
    "scheduled_time": "2026-02-19T02:00:00Z",
    "live": true
  }'
```

## Performance

### Typical Migration Times

| VM Size | Network | Live Downtime | Total Time |
|---------|---------|---------------|------------|
| 2GB RAM | 1 Gbps | 1-2s | 30s |
| 8GB RAM | 1 Gbps | 2-3s | 90s |
| 16GB RAM | 10 Gbps | 1-2s | 20s |
| 64GB RAM | 10 Gbps | 3-5s | 60s |

### Optimization Tips

1. **Pre-copy iterations**: Reduce for faster migration
2. **Compression**: Enable for slow networks
3. **Huge pages**: Better memory performance
4. **CPU pinning**: Reduces migration overhead
5. **Network tuning**: Increase TCP buffer sizes
