# Hubble UI (external link)

Fabric and FluxVM **do not** implement Cilium-native VM endpoints or an
in-tree Hubble UI. VMs remain FluxVM edge endpoints (`mode = ebpf|cilium`
coexistence); Cilium owns cluster workloads.

When you already run Hubble elsewhere, point Fabric at it:

```toml
[network]
bridge = "vmbr0"
hubble_ui_url = "https://hubble.example.com"
```

`GET /api/capabilities` returns `hubble_ui_url` so the console can open the
external UI. This is a convenience link only — no map sync, no CEP ownership.

For VM-edge observe (FluxVM-native), use Edge Dataplane / `…/dataplane/flows`.
