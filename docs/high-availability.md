# High Availability Guide

## Architecture

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Node 1    │       │   Node 2    │       │   Node 3    │
│  (Leader)   │       │  (Follower) │       │  (Follower) │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       └─────────────────────┴─────────────────────┘
                             │
                        ┌────▼────┐
                        │  etcd   │
                        │ cluster │
                        └─────────┘
```

## Setup etcd Cluster

### Install etcd

```bash
# On all nodes
sudo apt install etcd

# Configure etcd
sudo vi /etc/default/etcd
```

Node 1:
```
ETCD_NAME="node1"
ETCD_INITIAL_ADVERTISE_PEER_URLS="http://192.168.1.10:2380"
ETCD_LISTEN_PEER_URLS="http://192.168.1.10:2380"
ETCD_LISTEN_CLIENT_URLS="http://192.168.1.10:2379,http://127.0.0.1:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://192.168.1.10:2379"
ETCD_INITIAL_CLUSTER="node1=http://192.168.1.10:2380,node2=http://192.168.1.11:2380,node3=http://192.168.1.12:2380"
ETCD_INITIAL_CLUSTER_STATE="new"
ETCD_INITIAL_CLUSTER_TOKEN="vmspawnd-cluster"
```

### Start etcd

```bash
sudo systemctl start etcd
sudo systemctl enable etcd
```

## Configure vmspawnd for HA

`/etc/vmspawnd/vmspawnd.toml`:

```toml
[daemon]
listen = "0.0.0.0:8080"
node_id = "node1"
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

## Leadership Election

vmspawnd uses etcd for leader election:

1. Each node attempts to acquire leadership
2. Leader handles write operations
3. Followers replicate state
4. On leader failure, new leader elected

### Check Leader

```bash
curl http://localhost:8080/api/cluster/leader
```

Response:
```json
{
  "node_id": "node1",
  "hostname": "node1.example.com",
  "is_leader": true
}
```

### Manual Failover

```bash
# Trigger leadership re-election
curl -X POST http://localhost:8080/api/cluster/resign-leadership
```

## VM Placement

### Automatic Placement

vmspawnd automatically places VMs on least-loaded node:

```bash
# VM will be placed on optimal node
curl -X POST http://localhost:8080/api/vms \
  -d '{"name": "myvm", "image": "..."}'
```

### Manual Placement

```bash
curl -X POST http://localhost:8080/api/vms \
  -d '{
    "name": "myvm",
    "image": "...",
    "node_id": "node2"
  }'
```

## VM Migration

### Live Migration

```bash
curl -X POST http://localhost:8080/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "live": true
  }'
```

### Offline Migration

```bash
curl -X POST http://localhost:8080/api/vms/myvm/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "target_node": "node2",
    "live": false
  }'
```

## Health Checks

### Node Health

```bash
curl http://localhost:8080/api/cluster/nodes
```

Response:
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

### Automatic Failover

If leader fails:
1. Follower nodes detect missing heartbeat
2. New leader elected
3. VMs remain running on their nodes
4. API requests automatically routed to new leader

## Monitoring

### Cluster Metrics

```bash
# Prometheus metrics include:
# - vmspawnd_cluster_nodes_total
# - vmspawnd_cluster_leader{node="node1"}
# - vmspawnd_cluster_node_health{node="node1"}
curl http://localhost:8080/metrics | grep cluster
```

### Alerts

Configure Prometheus alerts:

```yaml
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

## Best Practices

1. **Use odd number of nodes** (3, 5, 7) for quorum
2. **Monitor etcd health** regularly
3. **Test failover** in staging environment
4. **Use shared storage** (NFS, Ceph) for VM images
5. **Regular backups** of etcd data
6. **Geographic distribution** for disaster recovery
7. **Network redundancy** between nodes

## Disaster Recovery

### Backup etcd

```bash
etcdctl snapshot save backup.db
```

### Restore etcd

```bash
etcdctl snapshot restore backup.db
```

### Backup VM State

```bash
# Backup all VM configurations
curl http://localhost:8080/api/backup/export > vmspawnd-backup.json
```

### Restore VM State

```bash
curl -X POST http://localhost:8080/api/backup/import \
  -d @vmspawnd-backup.json
```
