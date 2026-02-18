# vmctl-tui - Terminal UI

Interactive terminal interface for managing VMs.

## Features

- Real-time VM list
- Keyboard-driven navigation
- Start/stop/restart/delete VMs
- Auto-refresh every 5 seconds

## Usage

```bash
vmctl-tui
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `r` | Refresh |
| `↑` / `k` | Move up |
| `↓` / `j` | Move down |
| `s` | Start selected VM |
| `t` | Stop selected VM |
| `d` | Delete selected VM |

## UI Layout

```
┌─────────────────────────────┐
│ vmspawnd TUI                │
├─────────────────────────────┤
│ VM Name   State     CPU Mem │
├─────────────────────────────┤
│ vm1       running   2   2GB │
│ vm2       stopped   4   4GB │
└─────────────────────────────┘
│ [Keyboard shortcuts]        │
└─────────────────────────────┘
```

## Requirements

- Terminal with 256 colors support
- Minimum 80x24 terminal size

## Similar Tools

- k9s (Kubernetes)
- lazydocker (Docker)
- htop (processes)
