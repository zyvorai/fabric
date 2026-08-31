# Web UI

Apple-hybrid React UI for Zyvor Fabric: public marketing pages plus a light authenticated console under `/app`, wired to the existing daemon API.

---

## Surfaces

| Surface | Routes |
|---------|--------|
| Marketing | `/`, `/product`, `/platform`, `/security` |
| Sign-in | `/sign-in` (legacy `/login` redirects here) |
| Console | `/app/*` (dashboard, VMs, network, storage, ops, …) |

---

## Features

- Real-time VM status updates via WebSocket
- Interactive terminal console (xterm.js) and graphical VNC console (noVNC)
- Live metrics graphs
- Cilium-style network security management with 9 tabs
- Command palette (`Ctrl+K` / `Cmd+K`) and `g` sequence shortcuts
- Toast notifications and structured API error banners
- Light Apple visual system (SF Pro / system UI font; no dark/steel/aurora themes)
- High-contrast tokens aligned with apple.com (`#1d1d1f` / `#333336` / `#6e6e73` on `#f5f5f7`)
- Responsive console with collapsible mobile nav

Human UI is **web only**. CLI (`zyvorctl`), Kubernetes operator, and Terraform remain. Terminal UI (`zyvorctl-tui`) removed.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tooling |
| Tailwind CSS 4 | Styling |
| React Router 7 | Navigation |
| Recharts | Metrics graphs |
| Lucide React | Icons |
| xterm.js | Terminal console |
| noVNC | VNC display |

---

## Development

```bash
cd web
npm install
npm run dev          # Vite on :5173 (or :3000), proxies API to :9095
npm run build        # → web/dist (served by zyvor-fabricd)
```

### Preview on macOS

`zyvor-fabricd` is Linux-only. For UI work on Darwin:

```bash
python3 scripts/mock-api-preview.py   # mock API on :9095
cd web && npm run dev -- --host 127.0.0.1 --port 3000
# Sign in: admin / any password (e.g. preview)
```

See also [ux.md](ux.md) for conventions and [customer/PAGE_INDEX.md](customer/PAGE_INDEX.md) for the full route catalog.
