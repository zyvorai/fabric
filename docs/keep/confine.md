# Host confinement (FluxVM eBPF)

Keep treats the guest as untrusted the moment it reads a page (or a PDF).
**Enforcement is on the host** — FluxVM TC/eBPF on the sandbox veth — never
inside guest Chromium. PacketWolf / netevd are optional observers, not required.

## Policy Keep posts

Agent-runtime `confine::strict_policy` → `POST /v1/vms/{id}/network/policy`:

| Field | Keep use |
|---|---|
| `default_allow: false` | Deny by default |
| `allow_cidrs` | Gateway only (`/32` or `/128`) |
| `allow_ports` | Broker + optional CONNECT proxy (`tcp/…`) |
| `deny_udp: true` | Kill WebRTC / QUIC / STUN (DHCP still allowed) |
| `deny_cidrs` | Metadata + public recursive DNS (8.8.8.8, 1.1.1.1, …) |
| `allow_fqdns` | Resolved into allow CIDRs from signed policy hosts |
| `labels` | `keep.zyvor.dev/session=…`, `role=browser`, … |

## Proof surfaces

| Proof | Source |
|---|---|
| Journal | agent-runtime audit — `egress.connect`, `ebpf.*` |
| Cockpit | `egress_connects`, optional `drop_reasons` |
| Freeze | On deny trip / demo CONNECT > 0 → `POST …/freeze`, `agent_paused_reason: ebpf_deny` |
| Drop label | FluxVM reason `udp-deny` (code 12) when dataplane attached |

## Soft / not this cut

- Full `cgroup/connect` proxy-or-die LSM (gateway+ports already pin L4)  
- Guest DNS pin BPF beyond deny-list + FQDN→CIDR resolve  
- PacketWolf process attribution UX  

FluxVM: `VmNetworkPolicy.deny_udp` · [FEATURES.md](https://github.com/zyvorai/fluxvm/blob/main/FEATURES.md)  
Fabric client mirror: `backend/crates/fluxvm-client` `deny_udp` field.
