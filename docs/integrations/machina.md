# Machina — macOS Companion (Integration Plan)

**Machina** is the planned **AI-native Infrastructure Workbench for macOS**. It is a desktop client — not a replacement for the Linux `vmspawnd` daemon.

Zyvor Fabric runs on Linux hypervisor hosts. Machina runs on the operator’s Mac and connects to one or more Fabric clusters over HTTPS.

> Note: The sibling repo [`machina`](https://github.com/ssahani/machina) (if present in your org) is a separate libvirt-based Linux platform. The macOS Machina workbench described here is the **Zyvor suite desktop product** consuming **Zyvor Fabric** APIs.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Machina (macOS)                    │
│  SwiftUI / Tauri shell              │
│  ┌─────────────┐ ┌───────────────┐  │
│  │ AI Operator │ │ Infra Explorer│  │
│  └──────┬──────┘ └───────┬───────┘  │
│         │    Tool calls   │         │
│         └────────┬────────┘         │
│                  │ HTTPS + WSS      │
└──────────────────┼──────────────────┘
                   │
         ┌─────────▼─────────┐
         │  Zyvor Fabric     │
         │  vmspawnd (Linux) │
         └───────────────────┘
```

---

## API contract (v0.1)

Machina v0.1 targets these `vmspawnd` surfaces:

| Capability | Endpoints | WebSocket |
|------------|-----------|-----------|
| Auth | `POST /api/auth/login`, `GET /api/auth/me` | — |
| VM inventory | `GET /api/vms`, `GET /api/vms/:name` | — |
| VM metrics | `GET /api/vms/:name/metrics` | — |
| Logs / journal | `GET /api/logs`, `GET /api/vms/:name/logs` | — |
| Live events | — | `GET /api/events/stream` (SSE) |
| Health | `GET /health` | — |

### Connection profile (`~/.machina/clusters.yaml`)

```yaml
clusters:
  - name: prod
    endpoint: https://fabric.example.com:9095
  - name: homelab
    endpoint: http://192.168.1.10:9095
    insecure_tls: true
```

Tokens are stored in the macOS Keychain, not in plain YAML.

### Rust client

Use the in-repo SDK for early prototypes:

```toml
# machina/Cargo.toml (future)
vmspawn-sdk = { path = "../zyvor-fabric/backend/vmspawn-sdk" }
```

Or HTTP directly against [OpenAPI](../../backend/api-docs/openapi.yaml).

---

## Roadmap alignment

| Machina | Fabric dependency |
|---------|-------------------|
| v0.1 VM dashboard + chat | VM list, metrics, logs APIs |
| v0.2 Network topology + RCA | Network cloud + monitor APIs |
| v0.3 K8s + Terraform gen | Operator CRDs, declarative export APIs |
| v0.4 Time Machine + security | Audit logs, config snapshots, policy APIs |

---

## Killer feature: Infrastructure Time Machine

Machina records Fabric event streams, metric samples, and exported config snapshots. On incident:

> “What changed before the outage?”

The AI layer correlates `WS /ws/events`, audit log entries, and periodic topology dumps from `/api/network/*` and `/api/vms`.

Fabric remains the source of truth; Machina is the reasoning and visualization layer.

---

## Rust client (`machina-fabric` CLI)

Prototype CLI for macOS/Linux (v0.1):

```bash
# Copy cluster profile
mkdir -p ~/.machina
cp integrations/machina/clusters.example.yaml ~/.machina/clusters.yaml

# Build
cd integrations/machina/client && cargo build --release

# Probe cluster
./target/release/machina-fabric health -c homelab
ZYVOR_FABRIC_USER=admin ZYVOR_FABRIC_PASSWORD=... \
  ./target/release/machina-fabric vms -c homelab
./target/release/machina-fabric events -c homelab
./target/release/machina-fabric logs --lines 20 -c homelab
```

Uses `vmspawn-sdk` from this repository (including `Client::stream_events()` for SSE). A Tauri shell lives in `integrations/machina/desktop/`.

### Desktop app (Tauri)

```bash
cd integrations/machina/desktop
npm install
npm run tauri dev
```

---

- [POSITIONING.md](../POSITIONING.md)
- [integrations/README.md](README.md)
