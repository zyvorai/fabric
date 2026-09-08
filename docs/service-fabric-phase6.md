# Service Fabric Phase 6

## Shipped (v6 on main)

The additive tranche from the v6 merge kit is **on `main`**. BPF **schema 4** is
unchanged; FluxVM **program generation 6** gates pin reload + fail-closed policy
restore.

| Item | Status |
|------|--------|
| Identity-aware service policy (ipcache → FluxVM `spol` / `sid4` / `sid6`) | shipped |
| Default allow/deny, allow/deny identities, audit-only | shipped |
| Envoy HTTP/gRPC transparent redirect contract (TC owner; XDP `XDP_PASS`) | shipped |
| Bypass-mark loop prevention | shipped |
| Fabric multi-node policy fan-out with snapshot/rollback | shipped |
| HA mutation queue on FluxVM (`fluxvm_haq`) + userspace drain | shipped |
| v5 snapshot-diff retained as HA correctness backstop | shipped |

Operator doc: [ebpf-service-fabric.md](ebpf-service-fabric.md) · FluxVM:
[service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
[phase 6 notes](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric-phase6.md).

## Remaining candidates

Still open after v6:

1. **cgroup/connect socket acceleration** for eligible node-local host workloads, with VM TAP/TC/XDP as canonical fallback.
2. **Adaptive BPF map sizing and pressure controller** (controlled program reload — `max_entries` is an object ABI property).
3. **RSS/multi-queue and offload validation** (GRO/GSO/checksum, XDP native/generic).
4. **Performance qualification lab**: p50/p99 latency, PPS/Gbps, CPU/Mpps, EDT fairness, host-routing gain, failover loss window and HA replay lag.
5. **Multi-site anycast / ClusterMesh-like identity coordination** in Fabric (site fencing, route-domain ownership).

Ownership remains unchanged: FluxVM owns local packet/runtime mechanics; Fabric owns distributed leases, routing, service discovery, multi-site policy and HA coordination.
