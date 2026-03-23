# VM Migration

vmspawnd supports live (zero-downtime) and offline VM migration between cluster nodes.

---

## Migration Types

| | Live | Offline |
|---|---|---|
| **Downtime** | ~1-2 seconds | Full stop/start |
| **Requires shared storage** | Yes (or high-bandwidth network) | No |
| **CPU compatibility** | Same architecture required | Not required |
| **Best for** | Production workloads | Large VMs, local storage |

---

## Live Migration

Migrate a running VM with minimal downtime. Memory is copied iteratively while the VM continues to run.

### Basic

```bash
# CLI
vmctl migrate myvm --to node2 --live

# API
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": true}'
```

### With Compression and Bandwidth Limit

```bash
vmctl migrate myvm --to node2 --live --compress --bandwidth 100

# API equivalent
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "live": true,
    "compress": true,
    "bandwidth_mbps": 100
  }'
```

### Live Migration Process

1. **Pre-copy** -- Copy all memory pages while the VM runs
2. **Iterative copy** -- Re-copy pages that changed since the last pass
3. **Stop-and-copy** -- Brief pause (~1-2s), copy final state
4. **Resume** -- Start VM on the target node
5. **Cleanup** -- Remove VM from the source node

---

## Offline Migration

Stop the VM, copy its disk and configuration to the target, then start it there.

```bash
# CLI
vmctl migrate myvm --to node2 --offline

# API
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": false}'
```

---

## Track Progress

```bash
# CLI
vmctl migrate status myvm

# API
curl http://localhost:9095/api/vms/myvm/migrate/status
```

```json
{
  "vm_name": "myvm",
  "status": "copying",
  "progress_percent": 45,
  "error": null
}
```

### Cancel a Migration

```bash
vmctl migrate cancel myvm

curl -X POST http://localhost:9095/api/vms/myvm/migrate/cancel
```

---

## Shared Storage Setup

Live migration requires that both nodes can access the same VM disk. Two common approaches:

### NFS

On the NFS server:
```bash
# /etc/exports
/var/lib/vmspawnd/images 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
```

```bash
sudo exportfs -ra
```

On each vmspawnd node:
```bash
sudo mount node1:/var/lib/vmspawnd/images /var/lib/vmspawnd/images

# Persist across reboots
echo "node1:/var/lib/vmspawnd/images /var/lib/vmspawnd/images nfs defaults 0 0" \
  | sudo tee -a /etc/fstab
```

### Ceph/RBD

```toml
# /etc/vmspawnd/vmspawnd.toml
[storage]
backend = "rbd"
pool = "vmspawnd"
monitors = ["mon1:6789", "mon2:6789", "mon3:6789"]
```

---

## Network Requirements

| | Minimum | Recommended |
|---|---|---|
| **Live migration bandwidth** | 1 Gbps | 10 Gbps |
| **Offline migration bandwidth** | 100 Mbps | 1 Gbps |
| **Live migration latency** | < 5ms RTT | < 1ms RTT |
| **Offline migration latency** | < 100ms RTT | < 10ms RTT |

Required ports: SSH (22) for rsync, vmspawnd API (8080).

---

## Pre-Migration Checklist

```bash
vmctl node status node2          # Target node is healthy
vmctl node resources node2       # Sufficient CPU/memory available
ping -c 3 node2                  # Network connectivity
ssh node2 echo "OK"              # SSH access works
```

---

## Advanced Options

### Auto-Converge

Throttles VM CPU to reduce the memory dirty rate, improving convergence for write-heavy workloads:

```bash
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": true, "auto_converge": true}'
```

### Memory Dirty Rate Limit

```bash
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": true, "max_dirty_rate_mbps": 50}'
```

### CPU Model Compatibility

For heterogeneous clusters, specify a common CPU model:

```bash
vmctl migrate myvm --to node2 --live --cpu-model Nehalem
```

---

## Monitoring

### Migration Statistics

```bash
curl http://localhost:9095/api/vms/myvm/migrate/stats
```

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

---

## Automated Migration

### Load-Based Auto-Migration

```bash
curl -X POST http://localhost:9095/api/cluster/config \
  -H "Content-Type: application/json" \
  -d '{
    "auto_migrate": true,
    "target_utilization": 70,
    "check_interval_seconds": 300
  }'
```

### Scheduled Migration

```bash
curl -X POST http://localhost:9095/api/vms/myvm/migrate/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "scheduled_time": "2026-02-19T02:00:00Z",
    "live": true
  }'
```

---

## Performance Reference

| VM Memory | Network | Live Downtime | Total Time |
|-----------|---------|:-------------:|:----------:|
| 2 GB | 1 Gbps | 1-2s | ~30s |
| 8 GB | 1 Gbps | 2-3s | ~90s |
| 16 GB | 10 Gbps | 1-2s | ~20s |
| 64 GB | 10 Gbps | 3-5s | ~60s |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Migration fails | Check logs (`journalctl -u vmspawnd`), verify network connectivity and SSH access |
| High downtime | Reduce memory dirty rate, enable auto-converge, increase bandwidth, enable compression |
| Incompatible CPUs | Use a lowest-common-denominator CPU model (`--cpu-model Nehalem`) |
| Insufficient disk space | Check `df -h /var/lib/vmspawnd` on the target node |

---

## Best Practices

1. **Test in staging first** before migrating production workloads
2. **Use shared storage** (NFS or Ceph) for seamless live migration
3. **Dedicate a network** for migration traffic to avoid impacting VM I/O
4. **Migrate during low-traffic periods** to minimize dirty page rate
5. **Monitor metrics** during migration to catch problems early
6. **Keep the source VM available** until the target is verified
