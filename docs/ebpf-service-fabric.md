# Fabric ↔ FluxVM Service Fabric v5

Fabric owns **distributed** service intent; FluxVM owns **node-local** TC/XDP
execution and maps. Fabric never invokes `bpftool`, `tc`, `ip`, or writes
`/sys/fs/bpf` (including Cilium private maps).

The **BPF ABI remains schema 4**. v5 adds state-plane/HA semantics around that ABI.

FluxVM reference: [service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
Boundary: [FLUXVM-FABRIC-BOUNDARY.md](FLUXVM-FABRIC-BOUNDARY.md) ·
Examples: [examples/service-fabric-v3/](examples/service-fabric-v3/) ·
Shipped: [phase4](service-fabric-phase4.md) · [phase5](service-fabric-phase5.md) ·
Next: [phase6](service-fabric-phase6.md).

## Fabric v5 responsibilities

Everything from v4, plus:

- durable edge leases with epoch high-water marks (no ABA reuse);
- withdraw-before-release replacement sequencing;
- state-before-advertise staging for replacements;
- sequence/ack HA delta replication with full-snapshot fallback on gaps;
- source journal ack advances only to the **minimum** target cursor.

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
| `GET` | `/api/dataplane/services/flows` | FluxScope service flows |
| `POST` | `/api/dataplane/services/telemetry/export` | OTLP/HTTP JSON export |
| `GET` | `/api/dataplane/services/{name}/conntrack/delta` | HA delta export |
| `POST` | `/api/dataplane/services/{name}/conntrack/delta/import` | Apply HA delta |
| `POST` | `/api/dataplane/services/{name}/conntrack/delta/ack` | Advance source watermark |

## CLI

```bash
zyvorctl dataplane service list
zyvorctl dataplane service apply --file docs/examples/service-fabric-v3/ha-draining-service.json
zyvorctl dataplane service status
zyvorctl dataplane service flows
zyvorctl dataplane service delta payments --after-seq 0
zyvorctl dataplane service delete payments
```

## Ownership reminder

| Plane | Owner |
|-------|--------|
| Service intent, leases, fan-out, BGP/ECMP, HA replication cursors | Fabric (`service-lb`) |
| TC/XDP programs, Maglev tables, fct/nat/edt/sflows, delta journal | FluxVM |
| Per-VM L3/L4 policy (Network Fabric schema v4) | FluxVM (orthogonal) |
