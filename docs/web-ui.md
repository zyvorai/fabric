# Web UI

Modern React-based web interface for vmspawnd with real-time updates, 37+ pages, 20+ network/security sub-pages, and 20+ reusable components.

## Features

- Real-time VM status updates via WebSocket
- Interactive terminal console via xterm.js
- Graphical VNC console via noVNC
- Live metrics graphs and sparklines
- VM template management and deployment
- Command palette for quick navigation (Ctrl+K)
- Toast notifications for operation feedback
- Dark theme with system preference detection
- Responsive design for desktop and tablet
- Breadcrumb navigation and contextual sidebars

## Technology Stack

- React 18
- TypeScript
- Vite
- TailwindCSS
- React Router
- Recharts (metrics and analytics graphs)
- Lucide React (icons)
- xterm.js (terminal console)
- noVNC (VNC display)

## Development

```bash
cd web
npm install
npm run dev
```

Access at `http://localhost:3000`. The dev server proxies API requests to `http://localhost:8080/api`.

## Production Build

```bash
npm run build
```

Output in `dist/` directory. In production, the static files are served directly by the vmspawnd daemon.

## Pages

The web UI contains 37+ pages and 20+ sub-pages organized into the following sections:

### Dashboard
- Platform-wide summary with VM count statistics (running, stopped, paused, error)
- Real-time resource utilization gauges (CPU, memory, storage)
- Recent activity feed
- Quick-action buttons for common operations
- Sparkline trend graphs

### VM Management
- **VM List** -- Filterable, sortable grid of VM cards with inline status indicators and quick actions (start, stop, restart, delete)
- **VM Detail** -- Full VM configuration, resource metrics graphs, attached storage, network interfaces, snapshots, and tags
- **VM Create** -- Multi-step form with validation for creating new VMs, including cloud-init configuration, TPM options, and VNC settings
- **VM Console** -- Interactive terminal via xterm.js over WebSocket
- **VM VNC** -- Graphical display via noVNC over WebSocket
- **VM Metrics** -- Detailed CPU, memory, disk, and network graphs with selectable time ranges
- **VM Snapshots** -- Snapshot list with create, revert, and delete actions
- **VM Cloning** -- Full and linked clone creation

### Templates
- Template list with metadata and usage counts
- Template detail and editing
- Deploy VM from template

### Storage
- Storage pool management (Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD)
- Volume list with capacity and attachment info (live data from API)
- Volume create, resize, attach, detach, and delete
- Ceph pool creation with monitor, pool name, user, and keyring config
- Ceph health status display

### Networking
- Virtual network list and detail
- Network create and edit
- Interface attachment management

### Network Security (`/network-security`)
Cilium-style network policy management with 9 tabs:
- **Policies** -- Label-based ingress/egress rules with direction badges, priority, and enforcement
- **Firewall** -- Profiles with rule builder (protocol/port/CIDR/action), zones, VM assignments
- **Services** -- Virtual IP services with load balancing algorithm selector and backend count
- **QoS** -- Traffic shaping with guaranteed/max rate, burst, and priority
- **DNS** -- Zone management with record type selector and TTL, policy with upstream servers and domain blocking
- **VPN** -- WireGuard tunnel peer editor, network topology selector (full-mesh/hub-spoke/point-to-point)
- **Mirror** -- Packet capture with direction selector, collector target, optional filters
- **NAT** -- Rule type selector (masquerade/SNAT/DNAT/hairpin), pool editor, gateway config
- **Monitor** -- Threshold builder (metric/value/unit/direction/severity), live metrics, alert management

All tabs include: stat cards, create modals with label selector (Cilium-style key=value tag editor), sync buttons, delete with confirmation.

### Backups
- Backup list and detail
- Create and restore backups
- Backup policy management

### Monitoring and Analytics
- Metrics dashboard with customizable time ranges
- Per-VM and aggregate resource graphs
- Analytics reports and export
- Prometheus endpoint status

### Scheduling
- Schedule list and creation
- Cron-style and one-time schedule configuration
- Schedule history and execution logs

### Quotas
- Quota list and management
- Per-user and per-project quota configuration
- Usage-vs-limit visualization

### Notifications
- Notification rule management
- Channel configuration (email, webhook, Slack)
- Notification history and acknowledgment

### Audit
- Searchable audit log viewer
- Filter by user, action, resource, and time range

### Administration
- User and role management
- Certificate management
- Encryption key management
- System configuration
- Resource pool management
- Datacenter management

### Site Operations
- DRS configuration and recommendations
- Fault tolerance settings
- Replication management
- Site recovery plans

### Content Library
- Shared image and template repository
- Upload, download, and deploy library items

### Image Builder
- Build recipe management
- Build execution and status tracking

### Tags
- Tag management and assignment
- Tag-based filtering across resources

### Autoscale
- Autoscale policy management
- Scaling history and event log

### Hotplug
- Live CPU, memory, disk, and NIC modifications for running VMs

## Components

The UI includes 20+ reusable components, including:

- **PageHeader** -- Consistent page title and breadcrumb rendering
- **VMCard** -- VM summary card with status badge and action buttons
- **MetricsChart** -- Recharts-based time-series graph
- **SparklineGraph** -- Compact inline trend graph
- **ConsoleTerminal** -- xterm.js terminal wrapper with WebSocket connection management
- **VNCViewer** -- noVNC display wrapper
- **ConfirmDialog** -- Modal confirmation for destructive actions
- **CommandPalette** -- Ctrl+K quick-navigation overlay with fuzzy search
- **ToastNotification** -- Stackable toast messages for operation results
- **StatusBadge** -- Color-coded VM state indicator
- **ResourceGauge** -- Circular or bar gauge for CPU/memory utilization
- **DataTable** -- Sortable, filterable table with pagination
- **SearchInput** -- Debounced search field
- **Sidebar** -- Collapsible navigation sidebar
- **ThemeToggle** -- Light/dark theme switcher

## WebSocket Integration

The web UI maintains persistent WebSocket connections for:

1. **Live event stream** (`/ws/events`) -- Pushes VM state changes, alerts, and system events to the UI in real time, eliminating the need for polling.
2. **Console** (`/ws/console/:vmname`) -- Bidirectional terminal I/O for interactive shell access.
3. **VNC** (`/ws/vnc/:vmname`) -- Proxied VNC framebuffer data for graphical console display.

Connection state is managed globally; the UI automatically reconnects on disconnection.

## Command Palette

Press `Ctrl+K` (or `Cmd+K` on macOS) to open the command palette. It supports:

- Fuzzy search across all pages and VMs
- Quick navigation to any view
- Direct VM actions (start, stop, restart)
- Keyboard-only workflow

## Toast Notifications

All API operations surface results as toast notifications:
- Success confirmations (green)
- Error messages with details (red)
- Warning notices (yellow)
- Informational messages (blue)

Toasts auto-dismiss after a configurable duration and can be manually dismissed.

## Dark Theme

Dark theme is enabled by default and respects the system color scheme preference. Users can override the preference with the theme toggle in the top navigation bar. The choice is persisted in local storage.

## API Integration

All API calls are routed through a centralized HTTP client that handles:
- Token-based authentication
- Automatic token refresh
- Request/response error handling
- Loading state management

## Customization

Edit `tailwind.config.js` for theme customization including colors, spacing, and typography.
