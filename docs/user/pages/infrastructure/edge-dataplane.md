# Edge Dataplane (cluster)

## Purpose

Cluster-wide console for FluxVM Network Fabric **schema v4** — security groups,
CNP documents, identities, observe snapshot, health, ipcache, and FQDN refresh.

This is the **VM edge** control plane proxied by Fabric
(`/api/dataplane/*`). It does **not** replace [Net Security](network-security.md)
(host SDN / `/api/network-policies`).

Per-VM Status / Policy / Effective / Stats / Flows stay on the VM detail
[Dataplane](dataplane.md) tab.

## When to use it

- Create or delete shared security groups used by many VMs
- Apply or remove CNP-shaped documents (compiled onto groups)
- Check dataplane health after upgrades (`ok`, BPF object, bpffs)
- Inspect reserved + group identities and observe endpoints
- Re-resolve FQDN allowlists after DNS changes

## How to get there

- Route: `/app/edge-dataplane`
- Nav: **Infrastructure → Edge Dataplane** (beside Net Security)
- Command palette: search “Edge Dataplane”

## Operate from the console (UX)

| Tab | Actions |
|-----|---------|
| **Health** | Mode, BPF/bpffs presence, group/CNP/ipcache counts, notes |
| **Groups** | Quick create (name + label) or delete rows |
| **CNP** | Paste JSON → Apply; delete listed documents |
| **Identities** | Reserved entities + group identities |
| **Observe** | Read-only JSON snapshot |
| **Ipcache** | Guest IP → identity table |
| Header **Refresh DNS** | `POST /api/dataplane/refresh-dns` (admin) |

Write actions require admin/write role. Soft banner appears when the
`vm_dataplane` capability is off or unreachable.

## Related pages

- [VM Dataplane](dataplane.md) — per-VM tab
- [Net Security](network-security.md) — host SDN (orthogonal)
- Tutorials: [edge-dataplane/](../../../tutorials/edge-dataplane/README.md)
- Operator: [fluxvm-dataplane.md](../../../guides/vm-drivers/fluxvm-dataplane.md)
- [Page index](../../PAGE_INDEX.md)
