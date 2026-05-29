# Machina Desktop (Tauri v2)

macOS/Linux/Windows shell for **Zyvor Fabric** — v0.1 workbench with VM dashboard.

## Prerequisites

- Node.js 18+
- Rust toolchain
- macOS: Xcode CLT (for Tauri)

## Development

```bash
cd integrations/machina/desktop
npm install
npm run tauri dev
```

Connect to a running `vmspawnd` instance (default `http://127.0.0.1:9095`). Paste a JWT if auth is enabled.

## Build

```bash
npm run tauri build
```

## Architecture

- **Frontend:** React + Vite (`src/`)
- **Backend:** Tauri Rust commands (`src-tauri/`) calling `vmspawn-sdk`

Companion CLI: [../client](../client/) (`machina-fabric`).
