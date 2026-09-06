# FluxVM Network Fabric (VM edge dataplane)

Fabric exposes FluxVM **Network Fabric v3** — a TC/eBPF classifier on each VM’s
host-visible edge — as first-class **API · Web · CLI**. This is **not** Fabric’s
host SDN (`/api/network-policies` → nftables). Both planes can run together.

| Layer | Owns | Surface |
| --- | --- | --- |
| **Fabric SDN** | Host isolation (label → nftables) | `/api/network-policies` · **Net Security → Policies** |
| **VM edge (Network Fabric v3)** | Per-VM L3/L4 allowlists, Mbps/PPS, stats, LRU flows on TAP/netns | `/api/vms/{name}/dataplane/*` · VM → **Dataplane** · `zyvorctl dataplane` |

Kernel program and safety properties live in FluxVM:
[Network Fabric architecture](https://github.com/zyvorai/fluxvm#network-fabric-architecture-how-it-works) ·
[docs/network-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/network-fabric.md).

Fabric-side diagrams (control plane, packet path, modes, vs other VMMs):
[README — Network Fabric](../../README.md#network-fabric-architecture-how-it-works) ·
[Why Fabric is ahead of other VMMs](../../README.md#why-fabric--network-fabric-is-ahead-of-other-vmms).

---

## What operators get

| Capability | Detail |
| --- | --- |
| Live policy | In-place BPF map rewrite (deny-all window only — never allow-all). Lab ~100–120 ms p50 via Fabric → FluxVM |
| Dual-stack L3+L4 | `allow_cidrs` + `tcp/PORT` / `udp/PORT` (both dimensions must match when both set) |
| Egress caps | `max_egress_mbps` / `max_egress_pps` on the same classifier |
| Telemetry | Allow/drop counters + LRU flows with stable **identity** |
| Bootstrap | ARP/DHCP/NDP/DHCPv6 always allowed |
| Attach backends | QEMU / Cloud Hypervisor / Firecracker — scheduler attaches on **all** backends when an iface exists |
| Soft skip | `mode=ebpf` + `network.mode=none` / user NAT (no host-visible iface) → soft-skip even when `required=true` |
| GA fail-closed | `required=true` + TAP/netns edge present but attach fails → create/start errors |

---

## Enable on the FluxVM side

Ship [`configs/fluxvm-dataplane.toml`](../../configs/fluxvm-dataplane.toml)
(compose/k8s already mount it as `/etc/fluxvm.toml`):

```toml
[sandbox.dataplane]
mode = "ebpf"                                          # legacy | ebpf | cilium
bpf_object = "/usr/lib/fluxvm/bpf/fluxvm_tc.bpf.o"
pin_root = "/sys/fs/bpf/fluxvm"
required = true                                        # GA: fail-closed when a VM edge exists
```

Requirements:

1. BPF object present in the FluxVM image (`/usr/lib/fluxvm/bpf/fluxvm_tc.bpf.o`).
2. Host `/sys/fs/bpf` mounted into the FluxVM process (compose/k8s/systemd).
3. Raised memlock (`LimitMEMLOCK=infinity` / `ulimit -l unlimited` / `SYS_RESOURCE`).
4. Bridged Fabric VMs use `network_tap: true` → FluxVM `NetworkSpec::Tap { netns: true }` so the classifier attaches on the **host** veth (`vh…`).

GA default in `configs/fluxvm-dataplane.toml` is already `required = true`.
Confirm `schema_version=3` + `attached=true` on a bridged VM after deploy.

---

## REST surface (Fabric ↔ FluxVM)

| Fabric | FluxVM | Role |
| --- | --- | --- |
| `GET /api/vms/{name}/dataplane/status` | `GET /v1/vms/{id}/network/status` | mode, attached, schema, identity, iface, policy snapshot |
| `GET /api/vms/{name}/dataplane/policy` | `GET /v1/vms/{id}/network/policy` | Durable policy |
| `POST /api/vms/{name}/dataplane/policy` | `POST /v1/vms/{id}/network/policy` | Replace durable policy + live maps |
| `GET /api/vms/{name}/dataplane/stats` | `GET /v1/vms/{id}/network/stats` | allow/drop packets + bytes |
| `GET /api/vms/{name}/dataplane/flows?limit=` | `GET /v1/vms/{id}/network/flows` | LRU flows (`family` 4/6, identity, verdict) |

Capability probe (dashboard health card):

```http
GET /api/capabilities → vm_dataplane: { phase, detail }
```

When a running sample VM exists with eBPF attached, detail looks like
`mode=ebpf · attached · schema=3`. With `mode=legacy`, phase is `off`.

### Policy JSON shape

```json
{
  "default_allow": false,
  "allow_cidrs": ["0.0.0.0/0", "::/0"],
  "allow_ports": ["tcp/80", "tcp/443", "udp/53"],
  "max_egress_mbps": 100,
  "max_egress_pps": 10000,
  "sample_rate": 1
}
```

Ports **must** be `tcp/PORT` or `udp/PORT` (optionally `tcp/8000-8999`). Bare
`443` is rejected by the UI and ignored/mis-parsed by the dataplane.

---

## Web console UX

### Dashboard

**VM dataplane** capability card — Live / Off / Unreachable with FluxVM mode /
attach / schema detail (from `GET /api/capabilities`).

### VM detail → Dataplane tab

Also reachable from the Network tab teaser (**Open Dataplane**).

| Tab | Contents |
| --- | --- |
| **Status** | mode, attached, schema version/compat, policy synced, required, interface, identity, pin dir, **active policy snapshot** |
| **Policy** | Presets (Allow all / Deny all / Web egress), CIDR tags, port tags with validation, Mbps/PPS, sample rate, Advanced JSON, Save / Discard |
| **Stats** | Allowed/dropped packets + bytes, drop rate, Refresh counters |
| **Flows** | LRU table with **Identity**, family, 5-tuple, proto, verdict, packets, bytes, last seen; limit + auto-refresh |

Soft banner when `vm_dataplane` capability is off/unreachable (`SubsystemBanner`).

### Lab UX checklist (verified)

On a bridged running VM with `mode=ebpf`:

1. Sign in → Dashboard shows **VM dataplane · Live · mode=ebpf · attached · schema=3**.
2. Open VM → **Dataplane → Status** — attached yes, schema 3, policy snapshot populated.
3. **Policy** — add `tcp/22`, **Save policy** → `POST …/dataplane/policy` returns 200.
4. **Stats** — non-zero allow and/or drop counters.
5. **Flows** — rows with matching identity.

---

## CLI (`zyvorctl`)

```bash
# HTTPS labs (self-signed cert accepted when URL is https://)
export ZYVOR_FABRIC_URL=https://127.0.0.1:9095
export ZYVOR_FABRIC_TOKEN="$(curl -sk -X POST "$ZYVOR_FABRIC_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"

zyvorctl dataplane status <name> -o json
zyvorctl dataplane policy get <name> -o json
zyvorctl dataplane policy set <name> --file /tmp/dp-policy.json
zyvorctl dataplane stats <name> -o json
zyvorctl dataplane flows <name> --limit 20 -o json
```

Aliases: `FABRIC_URL`, `FABRIC_TOKEN`. Default URL remains `http://localhost:9095`
for local Docker eval.

---

## Create a bridged VM that attaches

```bash
# Fabric API — network_tap enables Tap+netns
curl -sk -X POST "$ZYVOR_FABRIC_URL/api/vms" \
  -H "Authorization: Bearer $ZYVOR_FABRIC_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "lab-dp",
    "cpus": 1,
    "memory": 1024,
    "disk": 8,
    "image": "/var/lib/fluxvm/images/noble-server-cloudimg-amd64.img",
    "network_tap": true
  }'

curl -sk -X POST "$ZYVOR_FABRIC_URL/api/vms/lab-dp/start" \
  -H "Authorization: Bearer $ZYVOR_FABRIC_TOKEN"

# Wait until state=running, then:
zyvorctl dataplane status lab-dp -o json
# expect: mode=ebpf, attached=true, schema_version=3
```

User-mode NAT / `network.mode=none` VMs do **not** attach eBPF (no host edge
iface). That is expected.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `attached=false`, mode=ebpf | Bridged/`network_tap`? BPF object path? memlock? `/sys/fs/bpf` writable? |
| `mode=legacy` | `[sandbox.dataplane] mode` in `/etc/fluxvm.toml` |
| Policy POST 4xx on ports | Use `tcp/443`, not `443` |
| `zyvorctl` 401 | Set `ZYVOR_FABRIC_TOKEN` from `/api/auth/login` |
| `zyvorctl` TLS errors | Use `https://` URL (client accepts self-signed) |
| Auth file ≠ auth.db after deploy | `FORCE_ADMIN_RESET=1 FABRIC_LAB_DEFAULTS=1 ./scripts/deploy remote …` |
| Dashboard card stuck “Checking…” | First `/api/capabilities` before login is 401; refresh after sign-in |
| Conflating SDN vs edge | Net Security policies ≠ Dataplane tab |

```bash
# FluxVM direct
curl -s http://127.0.0.1:7788/v1/vms | jq .
# Host pins
sudo ls /sys/fs/bpf/fluxvm/vms/
sudo cat /run/fluxvm/ebpf/vms/*/iface /run/fluxvm/ebpf/vms/*/schema_version
```

---

## Related docs

- [FluxVM driver](fluxvm.md) — full driver surface
- [Networking](../../networking.md) — Fabric SDN + bridges + this plane
- [Web UI](../../web-ui.md) — console surfaces
- [Customer: VM Dataplane](../../customer/pages/infrastructure/dataplane.md)
- FluxVM [network-fabric.md](https://github.com/zyvorai/fluxvm/blob/main/docs/network-fabric.md) · [ebpf-cilium.md](https://github.com/zyvorai/fluxvm/blob/main/docs/ebpf-cilium.md)
