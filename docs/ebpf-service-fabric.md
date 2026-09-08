# Fabric ↔ FluxVM Service Fabric v3

Fabric owns **distributed** service intent; FluxVM owns **node-local** TC/XDP
execution and maps. Fabric never invokes `bpftool`, `tc`, `ip`, or writes
`/sys/fs/bpf` (including Cilium private maps).

FluxVM reference: [service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
Boundary: [FLUXVM-FABRIC-BOUNDARY.md](FLUXVM-FABRIC-BOUNDARY.md) ·
Examples: [examples/service-fabric-v3/](examples/service-fabric-v3/) ·
Next: [service-fabric-phase4.md](service-fabric-phase4.md).

## Fabric v3 responsibilities

- define dual-stack NAT/DSR service intent;
- select service-edge nodes;
- maintain edge leases/epochs;
- set `advertise=true` only on nodes with an active lease;
- withdraw advertisement before maintenance or fencing;
- turn active leases plus FluxVM local readiness snapshots into ECMP/BGP VIP intent;
- snapshot prior node state and roll back partial fan-out;
- optionally replicate FluxVM's whitelisted service conntrack state to standby edges;
- prepare DSR VIP ownership/direct-return routing on backends.

## Lease model

An `EdgeLease` contains `service`, `node`, `epoch`, and `expires_unix_ms`.
Expired leases never advertise. Duplicate live leases for the same node and
leases that refer to nodes outside the selected edge set are rejected.

Multiple valid leases intentionally represent ECMP/anycast service edges.

## Fencing sequence

1. stop renewing the node's edge lease;
2. call `withdraw_node()` so FluxVM publishes VIP withdrawal;
3. allow routing convergence;
4. optionally replicate conntrack to the successor;
5. fence/stop the old edge;
6. activate/renew the successor lease.

## Fabric REST (proxied)

| Method | Path | Role |
|--------|------|------|
| `GET/POST` | `/api/dataplane/services` | List / upsert Maglev service via `service-lb` |
| `GET/DELETE` | `/api/dataplane/services/{name}` | Get / delete |
| `GET` | `/api/dataplane/services/status` | Host service dataplane (`schema_version`) |
| `GET` | `/api/dataplane/services/stats` | Counters |
| `GET` | `/api/dataplane/services/health` | Backend health report |
| `POST` | `/api/dataplane/services/health/reconcile` | Run TCP probes |
| `POST` | `/api/dataplane/services/conntrack/gc` | Expire affinity / reverse NAT |
| `GET` | `/api/dataplane/services/advertisements` | VIP advertise snapshot |

Upsert body mirrors FluxVM schema v3 (see
[ha-draining-service.json](examples/service-fabric-v3/ha-draining-service.json)).

## CLI

```bash
zyvorctl dataplane service list
zyvorctl dataplane service apply --file docs/examples/service-fabric-v3/ha-draining-service.json
zyvorctl dataplane service status
zyvorctl dataplane service health
zyvorctl dataplane service reconcile
zyvorctl dataplane service gc
zyvorctl dataplane service advertisements
zyvorctl dataplane service delete payments
```

## Console

**Infrastructure → Edge Dataplane → Services** (`/app/edge-dataplane`):

- Maglev service CRUD with mode / exposure / SNAT / advertise / backend `state`;
- host Service Fabric schema badge;
- health report + reconcile;
- advertisements JSON + conntrack GC.

## Ownership reminder

| Plane | Owner |
|-------|--------|
| Service intent, leases, fan-out, BGP/ECMP policy | Fabric (`service-lb`) |
| TC/XDP programs, Maglev tables, fct/nat maps, health execution, ads file | FluxVM |
| Per-VM L3/L4 policy (Network Fabric schema v4) | FluxVM (orthogonal) |
