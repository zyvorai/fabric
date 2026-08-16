# Decision Support

This section provides evaluation materials to help teams assess Zyvor Fabric against alternative virtualization platforms and make informed adoption decisions.

## Contents

- **[Comparison Matrix](comparison-matrix.md)** -- Detailed feature-by-feature comparison of Zyvor Fabric against libvirt/virsh, Proxmox VE, and other VM management solutions. Covers API design, networking, storage, security, and operational model differences.

## When to Choose Zyvor Fabric

Zyvor Fabric is a strong fit when your environment meets these criteria:

- **systemd-native infrastructure, or not** -- The default VM driver integrates with systemd-machined and journald rather than requiring parallel management stacks; host networking uses direct netlink calls (not systemd-networkd). systemd itself is optional for the daemon's own packaging/init, and the VM driver is pluggable (`driver.backend = "machinectl" | "ephemera"`) — Ephemera is a disposable-VM engine with no systemd dependency at all, for environments that don't want one.
- **API-first automation** -- You need a comprehensive REST API (480+ endpoints) for infrastructure-as-code workflows, CI/CD pipelines, or custom tooling.
- **Single-host or small-cluster deployments** -- You want lightweight VM management without the operational overhead of full cluster orchestration platforms.
- **Security-conscious environments** -- You value PAM-based authentication, role-based access control, audit logging, and network policy enforcement built into the platform.

## When to Consider Alternatives

- **Large multi-host clusters with live migration** -- Platforms like Proxmox VE or oVirt provide mature cluster management with shared storage and live migration out of the box.
- **Existing libvirt ecosystem** -- If your tooling already depends on libvirt's XML domain definitions and virsh, migrating to Zyvor Fabric requires API adaptation.
- **Windows guest workloads** -- Zyvor Fabric focuses on Linux guests via its QEMU/KVM-based VM drivers. For mixed Windows/Linux environments, consider Proxmox or libvirt with full QEMU/KVM configuration access.
