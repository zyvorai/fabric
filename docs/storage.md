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
