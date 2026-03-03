# Quick Start Guide

## Prerequisites

- Rust 1.70+ (`rustup`)
- Node.js 18+ and npm
- systemd-vmspawn (optional, for actual VM management)

## Build Everything

```bash
# Clone the repository
git clone https://github.com/ssahani/vmspawn.git
cd vmspawn

# Build backend (Rust)
cd backend
cargo build --release
cd ..

# Build web UI (React)
cd web
npm install
npm run build
cd ..
```

## Run in Development Mode

### Terminal 1: Backend

```bash
cd backend
cargo run --bin vmspawnd
```

### Terminal 2: Web UI

```bash
cd web
npm run dev
```

Access the web UI at `http://localhost:3000`

## Try the CLI

```bash
# List VMs
./backend/target/debug/vmctl list
./backend/target/debug/vmctl list -o json      # JSON output
./backend/target/debug/vmctl list -o yaml      # YAML output

# Create a VM
./backend/target/debug/vmctl create myvm \
  --image=/path/to/image.qcow2 \
  --cpus=2 \
  --memory=2048

# Start a VM
./backend/target/debug/vmctl start myvm

# Apply config from YAML file
./backend/target/debug/vmctl apply -f vm.yaml

# Network security
./backend/target/debug/vmctl policy list
./backend/target/debug/vmctl firewall list
./backend/target/debug/vmctl vpn tunnels

# Ceph storage
./backend/target/debug/vmctl ceph create my-pool --monitors=10.0.0.1 --pool=rbd
./backend/target/debug/vmctl ceph health my-pool

# Launch TUI
./backend/target/debug/vmctl-tui
```

## Install System-Wide

```bash
# Run install script
./scripts/install.sh

# Enable and start daemon
sudo systemctl enable --now vmspawnd

# Use CLI
vmctl list
vmctl-tui
```

## Access Web UI

Once vmspawnd is running, access:

```
http://localhost:8080
```

## Test the API

```bash
# List VMs
curl http://localhost:8080/api/vms

# Create a VM
curl -X POST http://localhost:8080/api/vms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-vm",
    "image": "/path/to/image.qcow2",
    "cpus": 2,
    "memory": 2048
  }'

# Start a VM
curl -X POST http://localhost:8080/api/vms/test-vm/start
```

## Directory Structure

```
vmspawn/
├── backend/              # Rust backend (40 crates: daemon, CLI, TUI, drivers, enterprise features)
│   ├── vmspawnd/         # Main daemon with REST API + WebSocket
│   ├── vmctl/            # CLI tool (JSON/YAML output, 15+ subcommand groups)
│   ├── vmctl-tui/        # Terminal UI (8 views incl. Net Security)
│   ├── vmspawn-driver/   # VM driver (systemd-vmspawn integration)
│   ├── crates/           # Shared libraries (storage with Ceph/RBD, system, vm)
│   └── ...               # 34 more feature crates (networking, security, ha, migration, etc.)
├── web/                  # React web UI
├── operator/             # Kubernetes operator
├── terraform-provider/   # Terraform provider
├── docs/                 # Documentation
├── systemd/              # systemd service files
├── configs/              # Configuration files
├── scripts/              # Installation and utility scripts
├── monitoring/           # Monitoring configuration
├── sdk/                  # SDK
├── tests/                # Integration tests
└── debian/               # Debian packaging
```

## Next Steps

1. Read [Architecture](docs/architecture.md)
2. Explore [API Documentation](docs/api.md)
3. Learn about the [TUI](docs/tui.md)
4. Check out the [Web UI](docs/web-ui.md)
5. Review [Security](docs/security.md)
6. Explore [Advanced Features](docs/advanced-features.md)

## Troubleshooting

### Build fails

```bash
# Update Rust
rustup update

# Clean and rebuild
cd backend && cargo clean && cargo build
```

### Web UI not loading

```bash
# Check if daemon is running
curl http://localhost:8080/health

# Should return: OK
```

### Permission errors

vmspawnd requires root privileges to manage VMs:

```bash
sudo ./backend/target/release/vmspawnd
```
