# vmctl-tui - Terminal UI

Interactive terminal interface for managing VMs, built with ratatui and crossterm.

## Features

- 7 dedicated views for different management tasks
- Vim-style keyboard navigation
- Real-time search and filtering
- Bulk operations on multiple VMs
- Auto-refresh with configurable interval
- Sparkline graphs for live resource metrics
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
- Recent events and alerts

### 2. VMs

The primary VM management view:
- Tabular list of all VMs with name, state, CPU, memory, IP, and uptime
- Inline status indicators (color-coded)
- Sort by any column
- Start, stop, restart, and delete VMs directly from the list
- Bulk operations for acting on multiple VMs at once

### 3. Logs

Aggregated log viewer:
- Live-streamed logs from the daemon and individual VMs
- Filter by VM name or log level
- Search within log output

### 4. Metrics

Resource monitoring view:
- Per-VM CPU and memory usage
- Sparkline graphs for real-time visualization
- Network I/O and disk I/O statistics
- Historical trend display

### 5. Network

Virtual network overview:
- List of virtual networks and bridges
- Connected VMs per network
- IP address assignments
- Network traffic statistics

### 6. Storage

Storage management view:
- Storage pools and volumes
- Disk usage and capacity
- Volume attachment status

### 7. Help

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

### General

| Key | Action |
|-----|--------|
| `r` | Force refresh |
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
| vmspawnd TUI            [Dashboard] VMs Logs ...    |
+----------------------------------------------------+
| Running: 12  Stopped: 3  Paused: 1   Total: 16    |
|                                                     |
| CPU [|||||||       ] 42%    Mem [|||||||||    ] 67% |
| CPU Trend: _.-'^-._.-'   Mem Trend: __--^^--__     |
|                                                     |
| Recent Events:                                      |
|   vm-web-01  started    2 min ago                   |
|   vm-db-03   snapshot   5 min ago                   |
|   vm-app-02  stopped   12 min ago                   |
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
