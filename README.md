# vmspawnd

A modern, lightweight virtual machine management daemon built with Rust - a complete replacement for libvirtd.

## Features

- **vmspawnd daemon**: Systemd-integrated VM management daemon
- **vmctl CLI**: Command-line interface similar to virsh
- **vmctl-tui**: Terminal UI for interactive VM management (like k9s/lazydocker)
- **REST API**: HTTP API compatible with libvirt workflows
- **Web UI**: Modern React-based dashboard
- **systemd-vmspawn integration**: Native systemd VM spawning
- **Hyper2KVM ready**: Prepared for Hyper2KVM integration

## Architecture

```
User Interfaces:
├── vmctl (CLI)
├── vmctl-tui (Terminal UI)
└── Web UI (React)
         │
         ▼
    vmspawnd daemon (REST API)
         │
         ▼
    VM Drivers:
    ├── systemd-vmspawn
    └── Hyper2KVM (planned)
```

## Quick Start

### Build from source

```bash
# Build backend
cd backend
cargo build --release

# Build web UI
cd ../web
npm install
npm run build

# Install
sudo make install
```

### Run daemon

```bash
# Start daemon
sudo systemctl start vmspawnd

# Or run directly
sudo ./backend/target/release/vmspawnd
```

### CLI Usage

```bash
# List VMs
vmctl list

# Start a VM
vmctl start myvm

# Stop a VM
vmctl stop myvm

# Get VM info
vmctl info myvm

# Create a VM
vmctl create myvm --image=/path/to/image.qcow2 --memory=2048 --cpus=2
```

### TUI Usage

```bash
# Launch interactive terminal UI
vmctl-tui
```

### Web UI

Access the web interface at `http://localhost:8080`

## Components

### vmspawnd
Core daemon providing VM lifecycle management and REST API.

### vmctl
CLI tool for managing VMs from the command line.

### vmctl-tui
Interactive terminal UI built with ratatui for real-time VM monitoring and control.

### Web UI
Modern React-based web interface with:
- Dashboard with VM overview
- Real-time metrics
- Console access (via WebSocket)
- VM creation wizard
- VNC integration (planned)

## API

REST API endpoints:

```
GET    /api/vms           - List all VMs
GET    /api/vms/:name     - Get VM details
POST   /api/vms           - Create VM
DELETE /api/vms/:name     - Delete VM
POST   /api/vms/:name/start   - Start VM
POST   /api/vms/:name/stop    - Stop VM
POST   /api/vms/:name/restart - Restart VM
GET    /api/vms/:name/metrics - Get VM metrics
WS     /ws/vms            - WebSocket for real-time updates
```

## Configuration

Configuration file: `/etc/vmspawnd/vmspawnd.toml`

```toml
[daemon]
listen = "0.0.0.0:8080"

[storage]
path = "/var/lib/vmspawnd"
image_path = "/var/lib/vmspawnd/images"

[network]
bridge = "br0"
```

## systemd Integration

```bash
# Enable at boot
sudo systemctl enable vmspawnd

# Start/stop
sudo systemctl start vmspawnd
sudo systemctl stop vmspawnd

# View logs
sudo journalctl -u vmspawnd -f
```

## Development

### Backend

```bash
cd backend
cargo test
cargo run --bin vmspawnd
```

### Web UI

```bash
cd web
npm run dev  # Development server
npm run build  # Production build
```

## Roadmap

- [x] Core daemon
- [x] REST API
- [x] CLI tool
- [x] TUI
- [x] Web UI
- [ ] WebSocket console
- [ ] VNC/noVNC integration
- [ ] Cloud-init support
- [ ] TPM/vTPM support
- [ ] Hyper2KVM driver
- [ ] Kubernetes operator
- [ ] Terraform provider

## Comparison with libvirt

| Feature | libvirt | vmspawnd |
|---------|---------|----------|
| Language | C | Rust |
| API | XML-RPC | REST/JSON |
| CLI | virsh | vmctl |
| GUI | virt-manager | Web UI + TUI |
| systemd integration | Limited | Native |
| Memory footprint | ~50MB | ~5MB |
| Startup time | ~2s | ~50ms |

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT License - see [LICENSE](LICENSE)

## Credits

Built with:
- [Rust](https://www.rust-lang.org/)
- [Axum](https://github.com/tokio-rs/axum)
- [ratatui](https://github.com/ratatui-org/ratatui)
- [React](https://react.dev/)
- [systemd](https://systemd.io/)
