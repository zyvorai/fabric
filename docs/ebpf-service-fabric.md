# Fabric ↔ FluxVM Service Fabric v2

Fabric is the distributed control plane. FluxVM is the VM/host dataplane.

Fabric responsibilities:

- choose service-edge nodes;
- validate dual-stack/NAT/DSR intent before fan-out;
- require FluxVM schema v2 and a configured north-south interface for north-south services;
- snapshot previous node state;
- roll out through FluxVM REST;
- roll back already-updated nodes when a later node fails;
- arrange DSR backend VIP ownership/routing.

FluxVM responsibilities:

- persist the service catalog;
- compile Maglev tables;
- populate TC/XDP maps;
- DNAT/SNAT with ingress-created state and same-edge TC egress reverse-NAT;
- routed DSR forwarding;
- IPv4/IPv6 checksum handling;
- service counters and host dataplane status;
- fail-closed map replacement.

Fabric must never manipulate `/sys/fs/bpf`, `tc`, XDP programs, or FluxVM-private map schemas.
