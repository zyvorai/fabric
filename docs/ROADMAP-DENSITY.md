# Roadmap (Fabric): Cilium / Hubble / density

See FluxVM [ROADMAP-DENSITY.md](https://github.com/zyvorai/fluxvm/blob/main/docs/ROADMAP-DENSITY.md)
for the shared three-track plan.

Fabric Phase-1:

- `network.hubble_ui_url` on capabilities
- Edge Dataplane **Open Hubble** button (external link only)
- Docs: [hubble-ui.md](guides/operations/hubble-ui.md)

FluxVM now also ships **Hubble-lite** CEP-*shaped* views (`/v1/network/endpoints`,
`/hubble/*`) without writing Cilium private maps. Real Cilium-agent CEP /
SID attribution remains **Not started**.

CH QGA: host `--serial socket=qga.sock` path is Done on FluxVM (guest must
speak QGA); named virtio-serial stays QEMU-only. In-tree KVM pause/userspace/
lock-mem are Done; memory snapshots stay Firecracker — see FluxVM ROADMAP-DENSITY.
