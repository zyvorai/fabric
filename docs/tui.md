# vmctl-tui - Terminal UI

Interactive terminal interface for managing VMs, built with ratatui and crossterm.

## Features

- 8 dedicated views for different management tasks
- Vim-style keyboard navigation
- Real-time search and filtering
- Bulk operations on multiple VMs
- Auto-refresh with configurable interval
- Sparkline graphs for live resource metrics
- Network security management with 9 sub-tabs
- Live data from API (logs, storage, network -- no mock data)
- 256-color and true-color support

## Usage

```bash
vmctl-tui
```

Connect to a remote daemon:

```bash
vmctl-tui --url http://remote-host:8080
```

## Views

### 1. Dashboard

The default landing view. Displays a summary of the platform state:
- Total VM count with running/stopped/paused breakdown
- Aggregate CPU and memory utilization
- Sparkline graphs showing resource usage trends over time
- Recent activity log from audit API

### 2. VMs

The primary VM management view:
- Tabular list of all VMs with name, state, CPU, memory, IP, and uptime
- Inline status indicators (color-coded)
- Sort by any column
- Start, stop, restart, and delete VMs directly from the list
- Bulk operations for acting on multiple VMs at once

### 3. Logs

Live log viewer:
- Real-time audit log entries fetched from `/api/audit/logs`
- Color-coded log levels (INFO, WARN, ERROR, DEBUG)
- Displays timestamp, level, action, resource type, and detail

### 4. Metrics

Resource monitoring view:
- Per-VM CPU and memory usage
- Sparkline graphs for real-time visualization
- Network I/O (RX/TX) statistics
- System information from API (memory stats, VM counts, storage pool counts)

### 5. Network

Virtual network overview with live data:
- Bridges from `/api/networkd/bridges` with addresses and DHCP config
- VLANs from `/api/networkd/vlans` with VLAN ID and parent interface
- Link status from `/api/networkd/links` with operational state

### 6. Net Security

Cilium-style network security management with 9 sub-tabs:
- **Policies** -- Network policies with label selectors
- **Firewall** -- VM firewall profiles and zones
- **Services** -- Service mesh with load balancing
- **QoS** -- Traffic shaping policies
- **DNS** -- DNS zones and policies
- **VPN** -- WireGuard tunnels and networks
- **Mirror** -- Packet mirror sessions
- **NAT** -- NAT rules, pools, and gateways
- **Monitor** -- Network monitoring policies and alerts

Each tab shows resource counts, a navigable list, and a detail panel for the selected item. Supports sync and delete operations.

### 7. Storage

Storage management view with live data:
- Storage pools from API with type detection (Local, NFS, LVM, ZFS, Ceph/RBD)
- Pool details: name, state, path, capacity, available space
- Ceph-specific details: monitors, pool name, cluster health, RBD image list

### 8. Help

In-app keyboard shortcut reference and usage guide.

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `j` / Down | Move cursor down |
| `k` / Up | Move cursor up |
| `g` | Jump to top of list |
| `G` | Jump to bottom of list |
| `Tab` | Switch to next view |
| `Shift+Tab` | Switch to previous view |
| `1`-`7` | Jump directly to a view |

### Search and Filter

| Key | Action |
|-----|--------|
| `/` | Open search prompt |
| `Enter` | Confirm search |
| `Esc` | Cancel search / clear filter |
| `n` | Jump to next search match |
| `N` | Jump to previous search match |

### VM Actions

| Key | Action |
|-----|--------|
| `s` | Start selected VM |
| `t` | Stop selected VM |
| `r` | Restart selected VM |
| `d` | Delete selected VM (with confirmation) |
| `Enter` | Open detail view for selected VM |

### Bulk Operations

| Key | Action |
|-----|--------|
| `v` | Enter visual/selection mode |
| `Space` | Toggle selection on current item |
| `S` | Start all selected VMs |
| `T` | Stop all selected VMs |
| `D` | Delete all selected VMs (with confirmation) |
| `Esc` | Clear selection |

### Net Security View

| Key | Action |
|-----|--------|
| `h` / Left | Previous sub-tab |
| `l` / Right | Next sub-tab |
| `j` / Down | Navigate items |
| `k` / Up | Navigate items |
| `S` | Sync current resource type |
| `d` | Delete selected resource |

### General

| Key | Action |
|-----|--------|
| `R` | Force refresh |
| `q` | Quit |
| `?` | Toggle help overlay |

## Auto-Refresh

The TUI polls the daemon API at a regular interval (default: 5 seconds) and updates all visible data automatically. The refresh interval can be adjusted:

```bash
vmctl-tui --refresh-interval 10
```

## Sparkline Graphs

Resource metrics (CPU, memory, network, disk) are rendered as sparkline graphs directly in the terminal. These graphs display a rolling window of data points, providing a compact at-a-glance view of resource trends without leaving the terminal.

## UI Layout

```
+----------------------------------------------------+
| vmspawnd TUI   [Dashboard] VMs Logs ... NetSec ...  |
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

## Requirements

- Terminal with 256-color support (true-color recommended)
- Minimum 80x24 terminal size (larger recommended for sparklines)
- vmspawnd daemon running and accessible

## Similar Tools

- k9s (Kubernetes)
- lazydocker (Docker)
- htop (processes)
- bottom (system monitor)
