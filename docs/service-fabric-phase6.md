# Service Fabric Phase 6 candidates

Recommended next coherent tranche after v5 passes real Cargo/kernel and multi-node failure tests:

1. **cgroup/connect socket acceleration** for eligible node-local host workloads, with VM TAP/TC/XDP as canonical fallback.
2. **Envoy L7 redirect contract** for HTTP/gRPC and DNS-aware policy. eBPF selects/redirects; Envoy owns application parsing.
3. **Identity-aware service policy** joining FluxVM SecurityIdentity/ipcache with service/backend flow verdicts.
4. **Adaptive BPF map sizing and pressure controller**, requiring controlled program reload because map max_entries is an object ABI property.
5. **Event-driven HA mutation feed** from BPF ringbuf to replace the v5 snapshot-diff journal refresh with direct map-mutation deltas.
6. **RSS/multi-queue and offload validation**, including GRO/GSO/checksum and XDP native/generic modes.
7. **Performance qualification lab**: p50/p99 latency, PPS/Gbps, CPU/Mpps, EDT fairness, host-routing gain, failover loss window and HA replay lag.
8. **Multi-site anycast / ClusterMesh-like identity coordination** in Fabric, including site fencing and route-domain ownership.

Ownership remains unchanged: FluxVM owns local packet/runtime mechanics; Fabric owns distributed leases, routing, service discovery, multi-site policy and HA coordination.
