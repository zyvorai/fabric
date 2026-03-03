# Storage Management

## Volume Operations

### Create Volume

```bash
curl -X POST http://localhost:8080/api/volumes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "data-volume",
    "size_gb": 100,
    "format": "qcow2"
  }'
```

### List Volumes

```bash
curl http://localhost:8080/api/volumes
```

### Clone Volume

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/clone \
  -H "Content-Type: application/json" \
  -d '{"name": "data-volume-copy"}'
```

### Resize Volume

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/resize \
  -H "Content-Type: application/json" \
  -d '{"size_gb": 200}'
```

## Snapshots

### Create Snapshot

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/snapshots \
  -H "Content-Type: application/json" \
  -d '{"name": "backup-2026-02-18"}'
```

### List Snapshots

```bash
curl http://localhost:8080/api/volumes/data-volume/snapshots
```

### Restore from Snapshot

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/restore \
  -H "Content-Type: application/json" \
  -d '{"snapshot_id": "abc123"}'
```

## Storage Backends

### Local Storage

Default storage backend using local filesystem.

Configuration:
```toml
[storage]
backend = "local"
path = "/var/lib/vmspawnd/volumes"
```

### NFS Storage

Network filesystem for shared storage.

Configuration:
```toml
[storage]
backend = "nfs"
server = "nfs.example.com"
export = "/exports/vmspawnd"
mount_point = "/mnt/vmspawnd"
```

### Ceph/RBD Storage

Distributed storage for high availability.

Configuration:
```toml
[storage]
backend = "rbd"
pool = "vmspawnd"
monitors = ["mon1.example.com", "mon2.example.com"]
```

#### CLI (vmctl)

```bash
# Create a Ceph storage pool
vmctl ceph create my-pool \
  --monitors=10.0.0.1,10.0.0.2,10.0.0.3 \
  --pool=rbd \
  --user=admin \
  --keyring=/etc/ceph/ceph.client.admin.keyring

# Check cluster health
vmctl ceph health my-pool

# Get pool statistics
vmctl ceph stats my-pool

# List RBD images
vmctl ceph images my-pool

# Create an RBD image (10 GB)
vmctl ceph create-image my-pool vm-disk-01 --size=10240

# Delete an RBD image
vmctl ceph delete-image my-pool vm-disk-01

# Delete a Ceph pool
vmctl ceph delete my-pool

# Export pool config as YAML
vmctl ceph pools -o yaml
```

#### API

```bash
# Create Ceph pool
curl -X POST http://localhost:8080/api/storage/pools/ceph \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-pool",
    "monitors": ["10.0.0.1", "10.0.0.2", "10.0.0.3"],
    "pool_name": "rbd",
    "user": "admin",
    "keyring": "/etc/ceph/ceph.client.admin.keyring",
    "auto_start": true
  }'

# Get Ceph health
curl http://localhost:8080/api/storage/pools/my-pool/health

# Get Ceph stats
curl http://localhost:8080/api/storage/pools/my-pool/stats

# List RBD images
curl http://localhost:8080/api/storage/pools/my-pool/images

# Create RBD image
curl -X POST http://localhost:8080/api/storage/pools/my-pool/images \
  -H "Content-Type: application/json" \
  -d '{"name": "vm-disk-01", "size_mb": 10240}'
```

#### Web UI

Navigate to **Storage Pools** and click **Create Pool**. Select **Ceph** as the pool type and fill in:
- Monitor addresses (comma-separated)
- Ceph pool name (e.g., `rbd`)
- User (optional, defaults to `admin`)
- Keyring path (optional)

Ceph pools show health status (Ok/Warn/Error) in the pool list.

### LVM Storage

Logical Volume Manager for flexible storage management.

### LVM-thin Storage

Thin-provisioned LVM for overcommitted storage.

### ZFS Storage

ZFS pool and dataset storage with replication support.

## Volume Formats

- **qcow2**: QEMU Copy-On-Write (default, supports snapshots)
- **raw**: Raw disk image (best performance)
- **vmdk**: VMware disk format
- **vdi**: VirtualBox disk format

## Best Practices

1. **Use qcow2** for production (snapshots, compression)
2. **Use raw** for performance-critical workloads
3. **Regular snapshots** before major changes
4. **Monitor disk usage** to prevent running out of space
5. **Use thin provisioning** to save space
6. **Backup important volumes** regularly
