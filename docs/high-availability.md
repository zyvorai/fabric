# High Availability

Zyvor Fabric supports multi-node clustering via etcd for fault-tolerant VM management with automatic leader election and failover.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Node 1      │     │     Node 2      │     │     Node 3      │
│    (Leader)     │     │   (Follower)    │     │   (Follower)    │
│                 │     │                 │     │                 │
│  Zyvor Fabric       │     │  Zyvor Fabric       │     │  Zyvor Fabric       │
│  VMs: A, B      │     │  VMs: C, D      │     │  VMs: E, F      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                         ┌───────▼───────┐
                         │  etcd cluster  │
                         │  (3+ nodes)    │
                         └───────────────┘
```

**How it works:**
- Each node runs a Zyvor Fabric instance managing local VMs
- etcd stores cluster state, leader election, and VM placement metadata
- The leader handles write operations; followers replicate state
- On leader failure, a new leader is elected automatically

---

## Setup

### 1. Install and Configure etcd

Install etcd on all cluster nodes:

```bash
sudo apt install etcd    # Debian/Ubuntu
sudo dnf install etcd    # Fedora/RHEL
```

Configure each node in `/etc/default/etcd`. Example for Node 1:

```
ETCD_NAME="node1"
ETCD_INITIAL_ADVERTISE_PEER_URLS="http://192.168.1.10:2380"
ETCD_LISTEN_PEER_URLS="http://192.168.1.10:2380"
ETCD_LISTEN_CLIENT_URLS="http://192.168.1.10:2379,http://127.0.0.1:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://192.168.1.10:2379"
ETCD_INITIAL_CLUSTER="node1=http://192.168.1.10:2380,node2=http://192.168.1.11:2380,node3=http://192.168.1.12:2380"
ETCD_INITIAL_CLUSTER_STATE="new"
ETCD_INITIAL_CLUSTER_TOKEN="Zyvor Fabric-cluster"
```

Start etcd:

```bash
sudo systemctl enable --now etcd
```

### 2. Configure Zyvor Fabric for HA

On each node, edit `/etc/vmspawnd/vmspawnd.toml`:

```toml
[daemon]
listen = "0.0.0.0:8080"
node_id = "node1"                    # Unique per node
hostname = "node1.example.com"

[ha]
enabled = true
etcd_endpoints = [
  "http://192.168.1.10:2379",
  "http://192.168.1.11:2379",
  "http://192.168.1.12:2379"
]
heartbeat_interval_seconds = 5
leader_election = true
```

Restart Zyvor Fabric on each node:

```bash
sudo systemctl restart Zyvor Fabric
```

---

## Leader Election

### Check the Current Leader

```bash
curl http://localhost:9095/api/cluster/leader
```

```json
{
  "node_id": "node1",
  "hostname": "node1.example.com",
  "is_leader": true
}
```

### Trigger Manual Failover

```bash
curl -X POST http://localhost:9095/api/cluster/resign-leadership
```

### Automatic Failover

When the leader fails:
1. Follower nodes detect the missing heartbeat
2. A new leader is elected via etcd
3. VMs continue running on their respective nodes
4. API requests are automatically routed to the new leader

---

## VM Placement

### Automatic (Default)

VMs are placed on the least-loaded node:

```bash
curl -X POST http://localhost:9095/api/vms \
  -H "Content-Type: application/json" \
  -d '{"name": "myvm", "image": "/path/to/image.qcow2"}'
```

### Manual

Specify a target node:

```bash
curl -X POST http://localhost:9095/api/vms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "myvm",
    "image": "/path/to/image.qcow2",
    "node_id": "node2"
  }'
```

---

## VM Migration

### Live Migration

Zero-downtime migration of a running VM (requires shared storage or high-bandwidth network):

```bash
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": true}'
```

### Offline Migration

Stop, copy, and restart on the target node:

```bash
curl -X POST http://localhost:9095/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{"target_node": "node2", "live": false}'
```

See [migration.md](migration.md) for advanced options, status tracking, and performance tuning.

---

## Health Checks

### Node Status

```bash
curl http://localhost:9095/api/cluster/nodes
```

```json
[
  {
    "id": "node1",
    "hostname": "node1.example.com",
    "is_leader": true,
    "is_healthy": true,
    "last_heartbeat": "2026-02-18T12:00:00Z"
  },
  {
    "id": "node2",
    "hostname": "node2.example.com",
    "is_leader": false,
    "is_healthy": true,
    "last_heartbeat": "2026-02-18T12:00:01Z"
  }
]
```

---

## Monitoring

### Prometheus Metrics

```bash
curl http://localhost:9095/metrics | grep cluster
```

Key metrics:
- `vmspawnd_cluster_nodes_total` -- Total cluster node count
- `vmspawnd_cluster_leader{node="..."}` -- Current leader
- `vmspawnd_cluster_node_health{node="..."}` -- Per-node health status

### Prometheus Alert Rules

```yaml
groups:
  - name: Zyvor Fabric-cluster
    rules:
      - alert: ClusterLeaderDown
        expr: vmspawnd_cluster_leader == 0
        for: 1m
        annotations:
          summary: "No cluster leader elected"

      - alert: ClusterNodeUnhealthy
        expr: vmspawnd_cluster_node_health == 0
        for: 2m
        annotations:
          summary: "Cluster node {{ $labels.node }} is unhealthy"
```

---

## Disaster Recovery

### Backup etcd

```bash
etcdctl snapshot save /backup/etcd-$(date +%Y%m%d).db
```

### Restore etcd

```bash
etcdctl snapshot restore /backup/etcd-20260218.db
```

### Backup VM State

```bash
curl http://localhost:9095/api/backup/export > Zyvor Fabric-backup.json
```

### Restore VM State

```bash
curl -X POST http://localhost:9095/api/backup/import \
  -H "Content-Type: application/json" \
  -d @Zyvor Fabric-backup.json
```

---

## Best Practices

1. **Use an odd number of nodes** (3, 5, 7) for proper quorum
2. **Monitor etcd health** -- etcd is the single source of truth for cluster state
3. **Test failover regularly** in a staging environment before relying on it in production
4. **Use shared storage** (NFS, Ceph) for VM images when live migration is needed
5. **Back up etcd** on a regular schedule and store snapshots off-site
6. **Use a dedicated network** between nodes for heartbeat and migration traffic
7. **Enable geographic distribution** for disaster recovery across failure domains
