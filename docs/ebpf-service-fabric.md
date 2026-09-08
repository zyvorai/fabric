# Fabric ↔ FluxVM Service Fabric v3

Fabric owns distributed service intent; FluxVM owns node-local TC/XDP execution.

## Fabric v3 responsibilities

- define dual-stack NAT/DSR service intent;
- select service-edge nodes;
- maintain edge leases/epochs;
- set `advertise=true` only on nodes with an active lease;
- withdraw advertisement before maintenance or fencing;
- turn active leases plus FluxVM local readiness snapshots into ECMP/BGP VIP intent;
- snapshot prior node state and roll back partial fan-out;
- optionally replicate FluxVM's whitelisted service conntrack state to standby edges;
- prepare DSR VIP ownership/direct-return routing on backends.

## Lease model

An `EdgeLease` contains `service`, `node`, `epoch`, and `expires_unix_ms`. Expired leases never advertise. Duplicate live leases for the same node and leases that refer to nodes outside the selected edge set are rejected.

Multiple valid leases intentionally represent ECMP/anycast service edges.

## Fencing sequence

Recommended maintenance/failure sequence:

1. stop renewing the node's edge lease;
2. call `withdraw_node()` so FluxVM publishes VIP withdrawal;
3. allow routing convergence;
4. optionally replicate conntrack to the successor;
5. fence/stop the old edge;
6. activate/renew the successor lease.

Fabric does not invoke `bpftool`, `tc`, `ip`, or modify `/sys/fs/bpf`.
