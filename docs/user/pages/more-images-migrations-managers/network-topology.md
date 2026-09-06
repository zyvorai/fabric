# Network Topology

## Purpose

Network Topology — a live map of which VMs are attached to which virtual networks or host bridges, alongside the host's own bridges and physical NICs, auto-refreshing every 15 seconds.

## When to use it

- To see which VMs share a network or bridge, or find VMs that aren't attached to anything
- To check a host bridge's or physical NIC's operational state and addresses
- To look up a VM's interface type, MAC address, and which network it plugs into without opening each VM individually

## How to get there

- Route / id: `/network-topology`
- Nav: **More — images, migrations & managers → Network Topology** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. The page loads VM interfaces, virtual networks, host bridges, and links on open, then refreshes silently every 15 seconds; the header **Refresh** forces a full reload.
2. A summary line shows counts of virtual networks, host bridges, and VMs.
3. **Host interfaces** — cards for each host bridge and physical NIC, showing whether it's a bridge or interface, its operational state, and its addresses.
4. **VM → network connections** — a flat table of every VM interface: VM name and state, the network/bridge it points to, interface type, and MAC address.
5. **VM attachments** — one card per network/bridge listing the VMs attached to it (with per-interface type/source/model/MAC); VMs with no attached interface are grouped under "Unattached VMs."
6. This page is read-only — to change what a VM is attached to, use the [Create VM](../core/create.md) wizard or that VM's own Network tab.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
