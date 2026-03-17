# Storage Management

vmspawnd supports multiple storage backends and provides a unified API for volume management, snapshots, and cloning.

---

## Storage Backends

| Backend | Description | Best For |
|---------|-------------|----------|
| **Local** | Default filesystem storage | Single-node, development |
| **NFS** | Network filesystem | Shared storage, multi-node |
| **LVM** | Logical Volume Manager | Flexible local storage |
| **LVM-thin** | Thin-provisioned LVM | Overcommitted storage |
| **ZFS** | ZFS datasets with replication | Snapshots, data integrity |
| **Ceph/RBD** | Distributed block storage | HA, multi-node, production |

### Configuration

```toml
# /etc/vmspawnd/vmspawnd.toml

# Local (default)
[storage]
backend = "local"
path = "/var/lib/vmspawnd/volumes"

# NFS
[storage]
backend = "nfs"
server = "nfs.example.com"
export = "/exports/vmspawnd"
mount_point = "/mnt/vmspawnd"

# Ceph/RBD
[storage]
backend = "rbd"
pool = "vmspawnd"
monitors = ["mon1.example.com", "mon2.example.com"]
```

See [NFS_STORAGE_GUIDE.md](NFS_STORAGE_GUIDE.md) for detailed NFS setup.

---

## Volumes

### Create

```bash
curl -X POST http://localhost:8080/api/volumes \
  -H "Content-Type: application/json" \
  -d '{"name": "data-volume", "size_gb": 100, "format": "qcow2"}'
```

### List

```bash
curl http://localhost:8080/api/volumes
```

### Resize

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/resize \
  -H "Content-Type: application/json" \
  -d '{"size_gb": 200}'
```

### Clone

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/clone \
  -H "Content-Type: application/json" \
  -d '{"name": "data-volume-copy"}'
```

---

## Snapshots

### Create

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/snapshots \
  -H "Content-Type: application/json" \
  -d '{"name": "backup-2026-02-18"}'
```

### List

```bash
curl http://localhost:8080/api/volumes/data-volume/snapshots
```

### Restore

```bash
curl -X POST http://localhost:8080/api/volumes/data-volume/restore \
  -H "Content-Type: application/json" \
  -d '{"snapshot_id": "abc123"}'
```

---

## Ceph/RBD

### CLI (`vmctl`)

```bash
# Create a Ceph storage pool
vmctl ceph create my-pool \
  --monitors=10.0.0.1,10.0.0.2,10.0.0.3 \
  --pool=rbd \
  --user=admin \
  --keyring=/etc/ceph/ceph.client.admin.keyring

# Health and stats
vmctl ceph health my-pool
vmctl ceph stats my-pool

# RBD image management
vmctl ceph images my-pool
vmctl ceph create-image my-pool vm-disk-01 --size=10240
vmctl ceph delete-image my-pool vm-disk-01

# Export as YAML
vmctl ceph pools -o yaml
```

### API

```bash
# Create pool
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

# Health, stats, images
curl http://localhost:8080/api/storage/pools/my-pool/health
curl http://localhost:8080/api/storage/pools/my-pool/stats
curl http://localhost:8080/api/storage/pools/my-pool/images

# Create RBD image
curl -X POST http://localhost:8080/api/storage/pools/my-pool/images \
  -H "Content-Type: application/json" \
  -d '{"name": "vm-disk-01", "size_mb": 10240}'
```

### Web UI

Navigate to **Storage Pools** > **Create Pool** > select **Ceph**. Configure monitor addresses, pool name, user, and keyring. Ceph pools display health status (Ok/Warn/Error) in the pool list.

---

## Disk Formats

| Format | Snapshots | Performance | Thin Provisioning | Compatibility |
|--------|:---------:|:-----------:|:-----------------:|:-------------:|
| **qcow2** | Yes | Good | Yes | QEMU (default) |
| **raw** | No | Best | No | Universal |
| **vmdk** | No | Good | Varies | VMware |
| **vdi** | No | Good | Varies | VirtualBox |

---

## Best Practices

1. **Use qcow2** for production -- supports snapshots, compression, and thin provisioning
2. **Use raw** for performance-critical workloads where snapshot support is not needed
3. **Take snapshots before major changes** -- they are fast and cheap with qcow2
4. **Monitor disk usage** -- set up alerts to prevent running out of space
5. **Use thin provisioning** to overcommit storage where workloads permit
6. **Back up important volumes** regularly and test restores
