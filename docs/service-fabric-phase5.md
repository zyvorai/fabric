# Service Fabric Phase 5 candidates

Recommended next coherent tranche after v4 passes real kernel and multi-node validation:

1. **Streaming HA state replication** instead of periodic full conntrack snapshots; bounded delta journal with sequence/ack and replay protection.
2. **Durable Fabric lease controller** backed by state-store, automatic health-triggered edge replacement and withdraw-before-fence sequencing.
3. **cgroup/connect socket acceleration** for eligible local host workloads; keep VM TAP/XDP/TC paths as the canonical fallback.
4. **Envoy L7 redirect contract** for HTTP/gRPC/DNS-aware policy and telemetry. eBPF selects/redirects; Envoy parses application protocols.
5. **Identity-aware service policy** joining FluxVM SecurityIdentity with service/backend flow telemetry and policy verdicts.
6. **Incremental BPF map reconciliation** for very large service catalogs instead of full intent-map rebuilds.
7. **Adaptive map sizing / pressure control** from host memory and observed CT occupancy.
8. **RSS/multi-queue and NIC offload validation**, including GRO/GSO/checksum corner cases and XDP generic/native/driver modes.
9. **Performance lab gate**: p50/p99 latency, PPS/Gbps, CPU per million packets, Maglev failover, EDT fairness and host-routing gain versus host stack.
10. **Multi-site anycast/ClusterMesh-like identity coordination** in Fabric, not FluxVM.

Ownership remains unchanged: FluxVM owns local packet mechanics; Fabric owns distributed service discovery, leases, routing intent, multi-site state and policy.
