# Quick Start Guide

## Prerequisites

- Rust 1.70+ (`rustup`)
- Node.js 18+ and npm
- systemd-vmspawn (optional, for actual VM management)

## Build Everything

```bash
# Clone the repository
git clone https://github.com/youruser/vmspawnd.git
cd vmspawnd

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

# Create a VM
./backend/target/debug/vmctl create myvm \
  --image=/path/to/image.qcow2 \
  --cpus=2 \
  --memory=2048

# Start a VM
./backend/target/debug/vmctl start myvm

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
vmspawnd/
├── backend/           # Rust backend (daemon, CLI, TUI, drivers)
├── web/              # React web UI
├── systemd/          # systemd service files
├── configs/          # Configuration files
├── scripts/          # Installation and utility scripts
└── docs/             # Documentation
```

## Next Steps

1. Read [Architecture](docs/architecture.md)
2. Explore [API Documentation](docs/api.md)
3. Learn about [TUI](docs/tui.md)
4. Check out [Web UI](docs/web-ui.md)

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
