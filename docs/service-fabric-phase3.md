# Service Fabric Phase 3 candidates

The cumulative v2 kit intentionally stops after dual-stack DSR/SNAT/XDP and distributed rollout. The next coherent set should focus on connection lifecycle and cloud-network integration rather than adding unrelated BPF hooks.

## P0

1. **Forward conntrack/backend pinning**
   - Preserve the selected backend for established NAT flows across backend/Maglev changes.
   - TCP-state-aware timeout classes; UDP idle timeout.
   - Explicit conntrack GC/pressure metrics.

2. **Backend health + graceful drain**
   - active/passive probes;
   - `ready`, `draining`, `unhealthy` state;
   - stop new selection while retaining established-flow affinity;
   - drain deadlines and forced removal.

3. **VIP advertisement**
   - Fabric BGP intent; FluxVM node-local advertisement agent or integration boundary;
   - ECMP anycast VIPs across service-edge nodes;
   - withdraw VIP before node drain/fencing.

4. **HA service state**
   - node loss/reconciliation semantics;
   - service edge leases/fencing;
   - optional conntrack state replication only where needed.

## P1

5. **EDT bandwidth scheduling per service/identity**.
6. **Socket-level acceleration where the host owns sockets**; do not force it onto guest sockets.
7. **L7 redirect contract to Envoy for HTTP/gRPC policy/telemetry**.
8. **OTLP/Hubble-grade service flow events and explicit drop reasons**.
9. **BPF host-routing fast path / `bpf_redirect_neigh` where kernel support is sufficient**.

The ownership split remains unchanged: Fabric defines/distributes intent; FluxVM owns node-local dataplane execution.
