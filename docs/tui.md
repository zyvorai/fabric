# vmctl-tui -- Terminal UI

A k9s-style interactive terminal dashboard for managing VMs, built with ratatui and crossterm.

---

## Features

- 8 dedicated views: Dashboard, VMs, Logs, Metrics, Network, Net Security, Storage, Help
- Vim-style keyboard navigation with search and filtering
- Bulk operations on multiple VMs
- Sparkline graphs for real-time resource metrics
- Network security management with 9 sub-tabs (Cilium-style)
- Live data from vmspawnd API -- no mock data
- Auto-refresh with configurable interval
- 256-color and true-color support

---

## Usage

```bash
# Connect to local daemon
vmctl-tui

# Connect to remote daemon
vmctl-tui --url http://remote-host:8080

# Custom refresh interval (seconds)
vmctl-tui --refresh-interval 10
```

### Requirements

- Terminal with 256-color support (true-color recommended)
- Minimum 80x24 terminal size (larger recommended)
- vmspawnd daemon running and accessible

---

## Views

### 1. Dashboard (default)

Platform-wide summary:
- Total VM count with running/stopped/paused breakdown
- Aggregate CPU and memory utilization gauges
- Sparkline graphs showing resource trends
- Recent activity log from audit API

### 2. VMs

Primary VM management:
- Sortable table of all VMs (name, state, CPU, memory, IP, uptime)
- Color-coded status indicators
- Inline start, stop, restart, and delete actions
- Bulk operations for acting on multiple VMs

### 3. Logs

Live log viewer:
- Real-time audit log entries from `/api/audit/logs`
- Color-coded levels: INFO, WARN, ERROR, DEBUG
- Timestamp, action, resource type, and detail columns

### 4. Metrics

Resource monitoring:
- Per-VM CPU and memory usage
- Sparkline graphs for real-time visualization
- Network I/O (RX/TX) statistics
- System info from API (memory, VM counts, storage pools)

### 5. Network

Virtual network overview (live data):
- Bridges with addresses and DHCP config
- VLANs with VLAN ID and parent interface
- Link status with operational state

### 6. Net Security

Cilium-style network security management with 9 sub-tabs:

| Tab | Content |
|-----|---------|
| Policies | Network policies with label selectors |
| Firewall | VM firewall profiles and zones |
| Services | Service mesh with load balancing |
| QoS | Traffic shaping policies |
| DNS | DNS zones and policies |
| VPN | WireGuard tunnels and networks |
| Mirror | Packet mirror sessions |
| NAT | NAT rules, pools, and gateways |
| Monitor | Monitoring policies and alerts |

Each tab shows resource counts, a navigable list, and a detail panel. Supports sync (`S`) and delete (`d`) operations.

### 7. Storage

Storage pool management (live data):
- Pool list with type detection (Local, NFS, LVM, ZFS, Ceph/RBD)
- Details: name, state, path, capacity, available space
- Ceph-specific: monitors, pool name, cluster health, RBD images

### 8. Help

In-app keyboard shortcut reference.

---

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `j` / Down | Move cursor down |
| `k` / Up | Move cursor up |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `Tab` | Next view |
| `Shift+Tab` | Previous view |
| `1`-`7` | Jump to view by number |

### Search

| Key | Action |
|-----|--------|
| `/` | Open search |
| `Enter` | Confirm search |
| `Esc` | Cancel / clear filter |
| `n` | Next match |
| `N` | Previous match |

### VM Actions

| Key | Action |
|-----|--------|
| `s` | Start selected VM |
| `t` | Stop selected VM |
| `r` | Restart selected VM |
| `d` | Delete selected VM (with confirmation) |
| `Enter` | Open VM detail view |

### Bulk Operations

| Key | Action |
|-----|--------|
| `v` | Enter selection mode |
| `Space` | Toggle selection |
| `S` | Start all selected |
| `T` | Stop all selected |
| `D` | Delete all selected (with confirmation) |
| `Esc` | Clear selection |

### Net Security

| Key | Action |
|-----|--------|
| `h` / Left | Previous sub-tab |
| `l` / Right | Next sub-tab |
| `S` | Sync current resource type |
| `d` | Delete selected resource |

### General

| Key | Action |
|-----|--------|
| `R` | Force refresh |
| `?` | Toggle help overlay |
| `q` | Quit |

---

## Layout

```
+----------------------------------------------------+
| vmspawnd TUI   [Dashboard] VMs Logs ... NetSec     |
+----------------------------------------------------+
| Running: 12  Stopped: 3  Paused: 1   Total: 16    |
|                                                     |
| CPU [|||||||       ] 42%    Mem [|||||||||    ] 67% |
| CPU Trend: _.-'^-._.-'   Mem Trend: __--^^--__     |
|                                                     |
| Recent Events:                                      |
|   [12:34:56] INFO   create vm web-01                |
|   [12:34:45] WARN   high memory on db-03            |
|   [12:34:30] INFO   start vm app-02                 |
+----------------------------------------------------+
| q:Quit  /:Search  Tab:Next View  ?:Help             |
+----------------------------------------------------+
```

---

## Comparable Tools

| Tool | Domain |
|------|--------|
| [k9s](https://k9scli.io/) | Kubernetes |
| [lazydocker](https://github.com/jesseduffield/lazydocker) | Docker |
| [htop](https://htop.dev/) | Processes |
| [bottom](https://github.com/ClementTsang/bottom) | System monitor |
