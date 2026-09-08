# Service Fabric Phase 6

## Shipped (v6+ on main)

BPF **schema 4** is unchanged. FluxVM **program generation 8** covers
connect{4,6} + affinity, map-tier ELFs, and pressure/offload status. Fabric adds
minimal multi-site fencing and a ClusterMesh-like remote identity directory.

| Item | Status |
|------|--------|
| Identity-aware service policy | shipped (v6) |
| Envoy L7 redirect + bypass mark | shipped (v6) |
| Fabric multi-node policy fan-out | shipped (v6) |
| HA mutation queue on FluxVM | shipped (v6) |
| Opt-in cgroup/connect4+connect6 + Maglev affinity | shipped (FluxVM gen8) |
| Adaptive map pressure controller | shipped (FluxVM gen7+) |
| Compile-time map tier ELFs (`S`/`M`/`L`) | shipped (FluxVM gen8) |
| RSS/offload / XDP mode in `services/status` | shipped (FluxVM gen7+) |
| Perf lab + SLO harness (`SLO_*` / `test-service-fabric-slo.sh`) | shipped |
| Multi-site anycast fencing (`site_id` / `route_domain`) | shipped (minimal) |
| Site-scoped identity policy fan-out | shipped (minimal) |
| **ClusterMesh-like identity directory (minimal)** | shipped |

Operator doc: [ebpf-service-fabric.md](ebpf-service-fabric.md) · FluxVM:
[service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
[phase 6](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric-phase6.md).

### Multi-site slice (minimal)

- Missing `site_id` / `route_domain` = default single-site domain (backward compatible).
- Anycast VIP advertise uses only owning-domain leases; cross-site leases are ignored.
- Leased apply refuses `advertise=true` without an owning-domain lease.
- Policy fan-out with a set `site_id` targets only matching leased nodes; unresolved
  identities stay fail-closed on the node (no full mesh datapath).

### ClusterMesh-like identity directory (minimal)

Fabric owns a durable remote identity catalog keyed by `(route_domain, identity_id)`:

`RemoteIdentity { identity_id, site_id, route_domain, cidrs[], labels{}, updated_unix_ms }`.

- Sites publish/pull via Fabric REST (`/api/dataplane/remote-identities…`).
- `reconcile` fans CIDRs into FluxVM remote ipcache (`POST /v1/network/ipcache/remote`)
  on target nodes; delete unfans (`DELETE /v1/network/ipcache/remote/{identity}`).
- Policy apply merges directory entries referenced by `allow_identities` /
  `deny_identities` into node ipcache before fan-out. Same-domain resolve helpers
  ignore cross-domain rows; residual gaps stay fail-closed on FluxVM compile.
- **Out of scope:** full mesh datapath / ClusterMesh connectivity.

## Remaining candidates

1. **Automated multi-queue RSS affinity tests** under load (channels in status; no PPS gate in CI).
2. **Broader CI SLO numbers** (CPU/Mpps, EDT fairness, failover loss) — hooks exist; thresholds are operator-set.
3. **Full mesh datapath** beyond the identity directory.

Ownership remains unchanged: FluxVM owns local packet/runtime mechanics; Fabric owns distributed leases, routing, discovery, multi-site policy/HA, and the remote identity directory.
