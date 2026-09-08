# Service Fabric phase 2 — archive (shipped)

Historical roadmap for dual-stack DSR/SNAT/XDP. Those items shipped in Service
Fabric **v2** and are carried in later schemas.

**Current:** [ebpf-service-fabric.md](ebpf-service-fabric.md) (v4) ·
[phase 4](service-fabric-phase4.md) · [phase 5](service-fabric-phase5.md)

## Originally planned (now done unless noted)

1. North-south XDP service ingress — **done** (v2).
2. DSR — **done** (v2).
3. SNAT — **done** (v2).
4. IPv6 services — **done** (v2).
5. Active health — **done** (v3 TCP probes; Fabric owns durable intent).
6. Identity-aware service policy — still open ([phase 5](service-fabric-phase5.md)).
7. EDT bandwidth manager — **done** (v4).
8. Hubble-grade / FluxScope service events — **done** (v4).
9. Local redirect / cgroup connect — still open ([phase 5](service-fabric-phase5.md)).
10. L7 redirect contract — still open ([phase 5](service-fabric-phase5.md)).
