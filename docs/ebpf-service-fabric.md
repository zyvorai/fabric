# Zyvor Fabric ↔ FluxVM eBPF Service Fabric

## Ownership

**Fabric owns intent:** service/VIP lifecycle, backend membership, tenant authorization,
node fan-out, audit history, health decisions, DRS/HA integration and future multi-site policy.

**FluxVM owns mechanism:** Maglev compilation, BPF map programming, TC attachment,
per-flow backend selection, reverse NAT and node-local counters.

Fabric must never write FluxVM bpffs maps directly. FluxVM must never decide which
cluster nodes should exist in a service.

## v1 contract

v1 targets east-west traffic initiated by VMs. North-south physical-NIC/XDP service ingress is a separate follow-on dataplane.

`POST /v1/network/services` on each FluxVM node accepts:

```json
{
  "name": "payments",
  "vip": "10.40.0.100",
  "port": 443,
  "protocol": "tcp",
  "algorithm": "maglev",
  "mode": "nat",
  "maglev_table_size": 4093,
  "backends": [
    {"address": "10.40.1.21", "port": 8443, "weight": 1, "enabled": true},
    {"address": "10.40.1.22", "port": 8443, "weight": 1, "enabled": true}
  ]
}
```

v1 supports IPv4 TCP/UDP NAT. `dsr` is a reserved schema value and is rejected
until the return-path/neighbor contract is implemented. IPv6 is a later schema.

## Packet path

VM -> host-visible edge -> **Service Fabric (pref 49140)** ->
**FluxVM security policy (pref 49152)** -> host routing.

The Service Fabric rewrites VIP to backend before the security policy program,
so v1 policies must permit the selected backend destination. Return traffic
traverses the service program on TC egress and is reverse-NATed back to the VIP.

## Failure semantics

A configured VIP with an unavailable Maglev/backend map entry is dropped instead
of leaking the untranslated VIP into normal routing. Service catalog writes are
atomic on disk. Fabric snapshots prior service state on every target node and
best-effort rolls back already-updated nodes if fan-out fails mid-operation.
