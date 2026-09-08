# Service Fabric Phase 6

## Shipped (v6+ on main)

BPF **schema 4** is unchanged. FluxVM **program generation 8** covers
connect{4,6} + affinity, map-tier ELFs, and pressure/offload status. Fabric adds
minimal multi-site fencing, a ClusterMesh-like remote identity directory, and
**full mesh datapath v1** via remote backends (no Geneve/VXLAN tunnels).

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
| **Full mesh datapath (remote backends)** | shipped (v1) |
| Geneve / VXLAN service tunnels | N/A (L3/anycast + remote backends) |

Operator doc: [ebpf-service-fabric.md](ebpf-service-fabric.md) · FluxVM:
[service-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric.md) ·
[phase 6](https://github.com/zyvorai/fluxvm/blob/main/docs/service-fabric-phase6.md).

### Multi-site slice (minimal)

- Missing `site_id` / `route_domain` = default single-site domain (backward compatible).
- Anycast VIP advertise uses only owning-domain leases; cross-site leases are ignored.
- Leased apply refuses `advertise=true` without an owning-domain lease.
- Policy fan-out with a set `site_id` targets only matching leased nodes; unresolved
  identities stay fail-closed on the node.

### ClusterMesh-like identity directory (minimal)

Fabric owns a durable remote identity catalog keyed by `(route_domain, identity_id)`:

`RemoteIdentity { identity_id, site_id, route_domain, cidrs[], labels{}, updated_unix_ms }`.

- Sites publish/pull via Fabric REST (`/api/dataplane/remote-identities…`).
- `reconcile` fans CIDRs into FluxVM remote ipcache (`POST /v1/network/ipcache/remote`)
  on target nodes; delete unfans (`DELETE /v1/network/ipcache/remote/{identity}`).
- Policy apply merges directory entries referenced by `allow_identities` /
  `deny_identities` into node ipcache before fan-out. Same-domain resolve helpers
  ignore cross-domain rows; residual gaps stay fail-closed on FluxVM compile.

### Full mesh datapath v1 (remote backends)

Fabric owns a durable remote backend catalog keyed by
`(route_domain, service, address:port)` under
`{storage}/service-fabric/remote-backends.json`:

`RemoteBackend { service, site_id, route_domain, address, port, weight, state, labels{}, updated_unix_ms }`.

- Sites publish/pull via Fabric REST (`/api/dataplane/remote-backends…`).
- `reconcile` merges same-domain **Ready** remotes into existing FluxVM Maglev
  service upserts on owning-domain nodes (local backends preserved; colliding
  `(address, port)` never clobbers local). Draining/Unhealthy remotes are not
  injected (Maglev already excludes non-Ready).
- Cross-domain remotes are ignored (same fencing as identities).
- Delete removes the catalog row and re-reconciles so the backend drops from the
  next Maglev upsert.
- **Tunnels still N/A** — datapath is L3/anycast VIP + remote endpoint merge, not
  Geneve/VXLAN overlays.

## Remaining candidates

1. Stricter multi-queue RSS affinity proofs (pin flows, assert queue mapping) — under-load PPS + best-effort multi-queue RX shipped.
2. Higher lab Mpps/CPU ceilings beyond the universal CI floor (`SLO_MPPS_MIN=0.01`).
3. Richer remote-backend lifecycle (weighted drain handoff, multi-VIP, optional tunnel datapath) if operators need more than L3/anycast mesh.

Ownership remains unchanged: FluxVM owns local packet/runtime mechanics; Fabric owns distributed leases, routing, discovery, multi-site policy/HA, remote identity directory, and remote backend mesh.
