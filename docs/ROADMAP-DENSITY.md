# Roadmap (Fabric): Cilium / Hubble / density

See FluxVM [ROADMAP-DENSITY.md](https://github.com/zyvorai/fluxvm/blob/main/docs/ROADMAP-DENSITY.md)
for the shared three-track plan.

Fabric Phase-1:

- `network.hubble_ui_url` on capabilities
- Edge Dataplane **Open Hubble** button (external link only)
- Docs: [hubble-ui.md](guides/operations/hubble-ui.md)

Cilium-native CEP ownership and in-tree Hubble remain FluxVM/CNI work, not a
Fabric-only toggle. Phase-2/3 CEP + SID attribution are **Not started** on
purpose (no private-map fakes). CH QGA Phase-2/3 stay **Blocked** on the CH
device model; in-tree KVM pause/userspace are Done on FluxVM while memory
snapshots stay Firecracker — see FluxVM ROADMAP-DENSITY.
