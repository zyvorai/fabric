# Service Fabric phase 2 — archive (shipped)

Historical roadmap for dual-stack DSR/SNAT/XDP. Those items shipped in Service
Fabric **v2** and are carried in **v3**.

**Current:** [ebpf-service-fabric.md](ebpf-service-fabric.md) · [phase 4](service-fabric-phase4.md)

## Originally planned (now done unless noted)

1. North-south XDP service ingress — **done** (v2).
2. DSR — **done** (v2).
3. SNAT — **done** (v2).
4. IPv6 services — **done** (v2).
5. Active health — **done** (v3 TCP probes; Fabric owns durable intent).
6. Identity-aware service policy — still open (phase 4 / identity work).
7. EDT bandwidth manager — still open (phase 4).
8. Hubble-grade service events — still open (phase 4).
9. Local redirect — still open.
10. L7 redirect contract — still open (phase 4).
