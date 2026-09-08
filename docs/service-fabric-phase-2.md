# Follow-on eBPF roadmap

This merge kit intentionally stops at a reviewable v1. The next PRs should be
independent so regressions can be bisected and rolled back cleanly.

1. **North-south XDP service ingress** — node/physical NIC VIP lookup with the
   same service contract and Maglev compiler; preserve XDP/TC ownership rules.
2. **DSR** — IPIP/Geneve or L2 DSR modes, neighbor handling and source-IP
   preservation; only then allow `mode: dsr` in schema v1.
3. **SNAT option** — for non-routable VM source networks; explicit symmetric
   return-path state, port allocation and collision handling.
4. **IPv6 services** — `svc6/backend6/revnat6` maps and checksum/extension-header
   handling.
5. **Active health** — Fabric owns probe policy and backend membership; FluxVM
   only receives the resulting enabled backend set.
6. **Identity-aware service policy** — Fabric identity selectors compiled to
   FluxVM service/backend policy without IP-only ownership.
7. **EDT bandwidth manager** — replace fixed-window shaping with EDT for egress
   while keeping ingress token buckets where appropriate.
8. **Hubble-grade service events** — ringbuf backend-selection/drop events,
   OpenTelemetry export and Fabric topology aggregation.
9. **Local redirect** — metadata/secret/agent gateways without iptables.
10. **L7 redirect contract** — eBPF marks/redirects selected HTTP/gRPC flows to
    userspace Envoy; do not parse complex L7 protocols in BPF.
