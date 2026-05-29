# Web UI

A modern React-based web interface for Zyvor Fabric with real-time updates, 37+ pages, and comprehensive VM management.

---

## Features

- Real-time VM status updates via WebSocket
- Interactive terminal console (xterm.js) and graphical VNC console (noVNC)
- Live metrics graphs and sparklines
- Cilium-style network security management with 9 tabs
- Command palette for quick navigation (`Ctrl+K` / `Cmd+K`)
- Toast notifications for operation feedback
- Three dark themes (`dark`, `steel`, `aurora`) with system preference detection
- Responsive design for desktop and tablet

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tooling |
| TailwindCSS | Styling |
| React Router | Navigation |
| Recharts | Metrics graphs |
| Lucide React | Icons |
| xterm.js | Terminal console |
| noVNC | VNC display |

---

## Development

```bash
cd web   # production router-based UI (formerly `.web/`)
npm install
npm run dev
```

Access at `http://localhost:3000`. The dev server proxies API requests to `http://localhost:9095/api`.

### Production Build

```bash
npm run build
```

Output goes to `dist/`. In production, Zyvor Fabric serves these static files directly.

---

## Pages

### Dashboard
- VM count statistics (running, stopped, paused, error)
- Real-time CPU, memory, and storage utilization gauges
- Recent activity feed and quick-action buttons
- Sparkline trend graphs

### VM Management
- **VM List** -- Filterable, sortable grid with inline status and quick actions
- **VM Detail** — Configuration, metrics, storage, network, snapshots, hotplug, devices, cloud-init, tags
- **VM Create** — Multi-step wizard; optional advanced boot/display/CPU settings applied after create
- **VM Console** -- Interactive terminal via xterm.js over WebSocket
- **VM VNC** -- Graphical display via noVNC over WebSocket
- **VM Metrics** -- CPU, memory, disk, and network graphs with selectable time ranges
- **VM Snapshots** -- Create, revert, and delete
- **VM Cloning** -- Full and linked clone creation

### Templates
- Template list with metadata and usage counts
- Deploy VM from template

### Storage
- Storage pool management (Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD)
- Volume list with capacity and attachment info
- Ceph pool creation with health status display

### Network Security (`/network-security`)

9 tabs with Cilium-style label selectors, stat cards, and CRUD modals:

| Tab | Features |
|-----|----------|
| Policies | Ingress/egress rules with direction badges, priority, enforcement |
| Firewall | Rule builder (protocol/port/CIDR/action), zones, VM assignments |
| Services | Virtual IP with load balancing algorithm selector |
| QoS | Guaranteed/max rate, burst, priority |
| DNS | Zone management with record types, domain blocking |
| VPN | WireGuard peer editor, topology selector |
| Mirror | Direction selector, collector target, filters |
| NAT | Rule type selector (masquerade/SNAT/DNAT/hairpin), pool editor |
| Monitor | Threshold builder, live metrics, alert management |

### Backups
- Backup list, create, restore, and policy management

### Monitoring and Analytics
- Customizable time-range metrics dashboard
- Per-VM and aggregate resource graphs
- Analytics reports with PDF/CSV export

### Scheduling
- Cron-style and one-time schedules with execution history

### Quotas
- Per-user and per-project quota configuration with usage-vs-limit visualization

### Notifications
- Multi-channel rule management (email, Slack, webhook, Teams)
- Notification history and acknowledgment

### Audit
- Searchable log viewer with user, action, resource, and time range filters

### Administration
- User and role management
- Certificate and encryption key management
- Resource pools and datacenter management

### Site Operations
- DRS configuration and recommendations
- Fault tolerance, replication, and site recovery

### Content Library
- Shared image/template repository with upload and deploy

### Image Builder
- Build recipe management and execution tracking

### Tags and Autoscale
- Tag editing from VM cards; filter VMs by tag on the VM list
- **`/autoscale`** — per-VM CPU/memory scaling policies and event history

### Hotplug
- VM detail **Hotplug** tab: live CPU, memory, disk, and NIC changes for running VMs

### Device passthrough
- VM detail **Devices** tab: attach/detach host USB and PCI (GPU) devices

### Cloud-init
- VM detail **Cloud-init** tab: generate and attach NoCloud ISO (user-data + optional network config)

### RBAC
- Viewer role hides mutate actions (start/stop/delete/create) across VM list and detail pages

---

## WebSocket Integration

The UI maintains persistent WebSocket connections for:

| Endpoint | Purpose |
|----------|---------|
| `/ws/events` | Live VM state changes, alerts, and system events |
| `/ws/console/:vmname` | Bidirectional terminal I/O |
| `/ws/vnc/:vmname` | Proxied VNC framebuffer data |

Connections auto-reconnect on disconnection.

---

## Command Palette

Press `Ctrl+K` (or `Cmd+K` on macOS) to open:
- Fuzzy search across all pages and VMs
- Quick navigation to any view
- Direct VM actions (start, stop, restart)
- Keyboard-only workflow

---

## Components

20+ reusable components including:

| Component | Purpose |
|-----------|---------|
| PageHeader | Title and breadcrumb rendering |
| VMCard | VM summary with status badge and actions |
| MetricsChart | Recharts time-series graph |
| SparklineGraph | Compact inline trend graph |
| ConsoleTerminal | xterm.js wrapper with WebSocket management |
| VNCViewer | noVNC display wrapper |
| ConfirmDialog | Modal confirmation for destructive actions |
| CommandPalette | Quick-navigation overlay with fuzzy search |
| ToastNotification | Stackable toast messages |
| StatusBadge | Color-coded VM state indicator |
| ResourceGauge | CPU/memory utilization gauge |
| DataTable | Sortable, filterable table with pagination |
| Sidebar | Collapsible navigation sidebar |
| ThemeToggle | Dark / steel / aurora theme switcher |

---

## Customization

Edit `tailwind.config.js` for theme customization (colors, spacing, typography).
