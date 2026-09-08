# Service Fabric phase 3 — shipped as v3

The phase-3 candidates below landed as **Service Fabric schema v3**
([ebpf-service-fabric.md](ebpf-service-fabric.md)). This page is retained as an
archive so older links keep working.

## Shipped (P0)

1. **Forward conntrack/backend pinning** — Maglev affinity maps; TCP/UDP timeouts; GC/pressure.
2. **Backend health + graceful drain** — `ready` / `draining` / `unhealthy`, drain deadlines, TCP active health.
3. **VIP advertisement** — FluxVM atomic snapshot; Fabric `advertise` + lease-gated ECMP/BGP intent.
4. **HA service state** — `EdgeLease`, `withdraw_node()`, optional whitelisted conntrack export/import.

## Still open (was P1 → phase 4)

5. EDT bandwidth scheduling per service/identity.
6. Socket-level acceleration where the host owns sockets.
7. L7 redirect contract to Envoy.
8. OTLP/Hubble-grade service flow events and explicit drop reasons.
9. BPF host-routing fast path / `bpf_redirect_neigh` where supported.

See [service-fabric-phase4.md](service-fabric-phase4.md).
