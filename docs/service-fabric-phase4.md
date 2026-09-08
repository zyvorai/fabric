# Service Fabric Phase 4 candidates

After v3 lifecycle/HA is verified on a real multi-node testbed, the next coherent tranche should be performance and observability rather than more control-plane ownership in FluxVM:

1. EDT-based per-service/per-identity bandwidth scheduling.
2. Socket-level service acceleration for local host workloads where kernel support permits it.
3. Hubble-grade service flow events with backend id, conntrack state and rich drop reasons, exported through OTLP.
4. Optional Envoy redirect contract for HTTP/gRPC policy; keep complex L7 parsing out of eBPF.
5. eBPF host-routing fast path after routing/neighbor compatibility tests.
6. Production BGP adapter in Fabric (FRR/BIRD/gobgp plugin) consuming the v3 lease/advertisement contract.
7. Durable lease persistence and automatic failover controller using Fabric state-store.
8. Incremental/streamed conntrack replication instead of snapshot fan-out for very high connection counts.

Do not move cluster election, BGP session ownership, tenant/service discovery or HA policy into FluxVM.
