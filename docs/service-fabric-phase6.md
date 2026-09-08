# Service Fabric Phase 6

## Shipped (v6+ on main)

BPF **schema 4** is unchanged. FluxVM **program generation 7** covers connect /
pressure / offload status. Fabric adds minimal multi-site fencing.

| Item | Status |
|------|--------|
| Identity-aware service policy | shipped (v6) |
| Envoy L7 redirect + bypass mark | shipped (v6) |
| Fabric multi-node policy fan-out | shipped (v6) |
| HA mutation queue on FluxVM | shipped (v6) |
| Opt-in cgroup/connect4 (fail-open to TC/XDP) | shipped (FluxVM gen7) |
| Adaptive map pressure controller | shipped (FluxVM gen7) |
| RSS/offload / XDP mode in `services/status` | shipped (FluxVM gen7) |
| Perf lab harness | shipped (`scripts/test-service-fabric-perf.sh`) |
| Multi-site anycast fencing (`site_id` / `route_domain`) | shipped (minimal) |
| Site-scoped identity policy fan-out | shipped (minimal) |

Operator doc: [ebpf-service-fabric.md](ebpf-service-fabric.md) · FluxVM:
[service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
[phase 6](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric-phase6.md).

### Multi-site slice (minimal)

- Missing `site_id` / `route_domain` = default single-site domain (backward compatible).
- Anycast VIP advertise uses only owning-domain leases; cross-site leases are ignored.
- Leased apply refuses `advertise=true` without an owning-domain lease.
- Policy fan-out with a set `site_id` targets only matching leased nodes; unresolved
  identities stay fail-closed on the node (no ClusterMesh datapath).

## Remaining candidates

1. **cgroup/connect6** + TC affinity parity for connect acceleration.
2. **Published map-tier ELF variants** (`-DFLUXVM_MAP_TIER=L`) — label/pressure exist; alternate objects not yet shipped.
3. **CI PPS / EDT / failover SLO gates** (harness exists; not SLO-bound in CI).
4. **Full ClusterMesh-like remote identity directory** across sites.

Ownership remains unchanged: FluxVM owns local packet/runtime mechanics; Fabric owns distributed leases, routing, service discovery, multi-site policy and HA coordination.
