# VM Migration

Zyvor Fabric migrates a VM between hosts by copying its disk and configuration over SSH with
`rsync` -- there's no shared storage requirement and no memory-state transfer. `live` and `offline`
are two modes of the same rsync-based copy, not two different technologies:

- **Offline** -- stop the VM, `rsync` its data to the target, done.
- **Live** -- `rsync` the data across in the background while the VM keeps running, then pause it
  briefly for a final sync and cutover. Downtime is whatever that last sync takes, not the whole
  transfer.

---

## Start a Migration

```bash
curl -X POST http://localhost:9095/api/migrations \
  -H "Content-Type: application/json" \
  -d '{
    "vm_name": "myvm",
    "target_host": "node2",
    "migration_type": "live",
    "compress": true,
    "bandwidth_mbps": 100
  }'
```

`migration_type` is `"live"`, `"offline"`, or `"storage"`. `compress` and `bandwidth_mbps` are both
optional and map straight to `rsync -z` / `rsync --bwlimit`. `target_host` must be reachable over
SSH (key-based, no password prompt) as whatever user runs `zyvor-fabricd` -- that reachability is
checked before anything else happens.

## Track and Cancel

```bash
curl http://localhost:9095/api/migrations              # all migrations
curl http://localhost:9095/api/migrations/{id}          # one migration's status
curl -X POST http://localhost:9095/api/migrations/{id}/cancel
```

```json
{
  "id": "…",
  "vm_name": "myvm",
  "target_host": "node2",
  "migration_type": "live",
  "state": "syncing",
  "progress_percent": 60,
  "bytes_transferred": 1932735283,
  "started": "2026-09-02T02:00:00Z",
  "completed": null,
  "error": null
}
```

`state` moves through `pending` -> `precheck` -> `syncing` -> `switching` -> `completed` (or
`failed` / `cancelled`).

Two related read-only endpoints: `GET /api/migrations/history` (past migrations) and
`GET /api/migrations/readiness` (checks whether `rsync` and SSH connectivity are actually available
on this host before you try).

---

## Known Gap: Target-Side Start

Pausing the source VM for the final sync goes through the active `VmDriver` on this host (FluxVM
or machinectl, whichever is configured) -- that part is driver-generic. Starting the VM on the
*target* node after cutover still shells `ssh <target> machinectl start ...` directly, because a
local `Arc<dyn VmDriver>` only talks to this host's own backend, not a remote one. Migrating **onto**
a host running the FluxVM driver doesn't work end to end today -- the source-side pause does, the
target-side start doesn't.

---

## Requirements

- Key-based SSH from the source host to the target host (no shared storage, no cluster membership).
- `rsync` installed on both ends.
- Enough free disk on the target for the VM's full disk image.

---

## Prometheus Metrics

> **Not yet implemented.** The daemon's Prometheus exporter currently only exports VM-count and
> lifecycle metrics (`zyvor_fabricd_vms_total`, `_vms_running`, `_vms_stopped`,
> `_vm_{starts,stops,creates,deletes}_total`) -- no migration-specific series exist yet. Poll
> `GET /api/migrations` for live progress in the meantime (see the JSON example above).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Migration fails at the pre-check step | Confirm `ssh <target_host> echo ok` works non-interactively (key-based, `BatchMode=yes`) |
| Migration fails during sync | Check `journalctl -u zyvor-fabricd`, verify `rsync` is installed on both hosts |
| Insufficient disk space | Check `df -h /var/lib/zyvor-fabricd` on the target node |
| VM won't start on the target after cutover | See [Known Gap](#known-gap-target-side-start) above -- this step isn't driver-generic yet |
