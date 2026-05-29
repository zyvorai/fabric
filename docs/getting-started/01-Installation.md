# Installation Guide

This guide covers installing Zyvor Fabric on a Linux system. Zyvor Fabric requires a modern Linux distribution with systemd 256 or later and QEMU/KVM for virtual machine execution.

---

## System Requirements

### Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores (x86_64) | 4+ cores with VT-x/VT-d |
| Memory | 4 GB RAM | 8+ GB RAM |
| Disk | 20 GB free | 100+ GB (SSD recommended) |
| Network | 1 NIC | 2+ NICs for bridge networking |

### Software

| Requirement | Minimum Version | Notes |
|-------------|-----------------|-------|
| Linux kernel | 5.15+ | x86_64 architecture |
| systemd | 256+ | Required for systemd-vmspawn |
| QEMU | 8.0+ | KVM acceleration recommended |
| Rust | 1.75+ | Only for building from source |

### Supported Distributions

| Distribution | Version | systemd Version | Status |
|--------------|---------|-----------------|--------|
| Fedora | 41+ | 256+ | Fully supported |
| Ubuntu | 24.10+ | 256+ | Fully supported |
| Debian | Testing/Sid | 256+ | Supported |
| RHEL / CentOS Stream | 10+ | 256+ | Supported |
| openSUSE Tumbleweed | Rolling | 256+ | Supported |

> **Note:** Distributions with systemd versions below 256 do not include `systemd-vmspawn` and are not supported.

---

## Fedora Installation

Fedora 41 and later ship with systemd 256+ and have full support for Zyvor Fabric.

### 1. Install Dependencies

```bash
sudo dnf install -y \
    qemu-kvm \
    qemu-img \
    systemd-container \
    swtpm \
    swtpm-tools \
    edk2-ovmf \
    genisoimage \
    bridge-utils \
    wireguard-tools \
    nftables
```

### 2. Verify systemd-vmspawn

```bash
systemd-vmspawn --version
```

The output should show version 256 or later.

### 3. Enable KVM

```bash
# Verify KVM is available
lsmod | grep kvm

# If not loaded, load the appropriate module
sudo modprobe kvm_intel   # Intel processors
sudo modprobe kvm_amd     # AMD processors

# Verify /dev/kvm exists
ls -la /dev/kvm
```

### 4. Deploy Zyvor Fabric

```bash
git clone <repository-url>
cd zyvor-fabric

# One-command deployment
./vmspawnctl deploy
```

This command will:
- Install any missing system dependencies
- Build the Rust workspace (40 crates)
- Install binaries (`Zyvor Fabric`, `vmctl`) to `/usr/local/bin/`
- Install the systemd service unit
- Create configuration directories
- Start the vmspawnd service
- Run a post-install verification

---

## Ubuntu / Debian Installation

Ubuntu 24.10+ and Debian Testing/Sid include systemd 256+.

### 1. Install Dependencies

```bash
sudo apt update
sudo apt install -y \
    qemu-kvm \
    qemu-utils \
    systemd-container \
    swtpm \
    swtpm-tools \
    ovmf \
    genisoimage \
    bridge-utils \
    wireguard-tools \
    nftables
```

### 2. Verify systemd-vmspawn

```bash
systemd-vmspawn --version
```

### 3. Enable KVM

```bash
# Verify KVM support
sudo apt install -y cpu-checker
kvm-ok

# Load KVM module if needed
sudo modprobe kvm_intel   # Intel
sudo modprobe kvm_amd     # AMD
```

### 4. Deploy Zyvor Fabric

```bash
git clone <repository-url>
cd zyvor-fabric
./vmspawnctl deploy
```

---

## Building from Source

If you prefer to build manually or are developing on the project, follow these steps.

### 1. Install the Rust Toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

The minimum supported Rust version is 1.75.

### 2. Clone the Repository

```bash
git clone <repository-url>
cd zyvor-fabric
```

### 3. Build the Workspace

```bash
cd backend

# Fast compile check (no binary output)
cargo check

# Full release build
cargo build --release
```

The release build produces optimized binaries in `backend/target/release/`.

### 4. Run Tests

```bash
cd backend
cargo test
```

All tests must pass with zero warnings before deployment.

### 5. Install Binaries

```bash
# Install the daemon
sudo cp backend/target/release/Zyvor Fabric /usr/local/bin/

# Install the CLI
sudo cp backend/target/release/vmctl /usr/local/bin/

# Create config directory
sudo mkdir -p /etc/vmspawnd

# Create state directory
sudo mkdir -p /var/lib/vmspawnd/images
sudo mkdir -p /var/lib/vmspawnd/storage
sudo mkdir -p /var/lib/vmspawnd/cloud-init
```

### 6. Install the systemd Service

Create the service unit file:

```bash
sudo tee /etc/systemd/system/Zyvor Fabric.service > /dev/null << 'EOF'
[Unit]
Description=Zyvor Fabric VM Management Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/Zyvor Fabric
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now Zyvor Fabric
```

---

## Verifying the Installation

### 1. Check Service Status

```bash
sudo systemctl status Zyvor Fabric
```

You should see `active (running)`.

### 2. Check the API

```bash
curl -s http://127.0.0.1:9095/api/vms | jq .
```

A successful response returns a JSON object with an empty VM list.

### 3. Read the Admin Password

On first start, Zyvor Fabric generates a random admin password:

```bash
# Using vmspawnctl
./vmspawnctl password

# Or read directly
sudo cat /var/lib/vmspawnd/.admin_password
```

### 4. Run the Smoke Test

```bash
./vmspawnctl verify
```

This runs automated checks against the API, authentication, VM CRUD operations, and backup functionality.

### 5. Run the Health Check

```bash
./vmspawnctl health
```

This performs a deep check of API availability, disk space, database integrity, credential files, systemd timers, memory, and KVM support.

---

## Troubleshooting

### systemd-vmspawn not found

Your systemd version is too old. Check with:

```bash
systemctl --version
```

You need systemd 256 or later.

### KVM not available

Ensure hardware virtualization is enabled in your BIOS/UEFI settings (Intel VT-x or AMD-V). Then load the kernel module:

```bash
sudo modprobe kvm_intel   # or kvm_amd
```

### Permission denied on /dev/kvm

Add your user to the `kvm` group:

```bash
sudo usermod -aG kvm $USER
# Log out and back in for the change to take effect
```

### Port 9095 already in use

Change the listen address in the config file:

```bash
sudo mkdir -p /etc/vmspawnd
sudo tee /etc/vmspawnd/vmspawnd.toml > /dev/null << 'EOF'
[daemon]
listen = "127.0.0.1:8080"
EOF

sudo systemctl restart Zyvor Fabric
```

### Cannot connect to D-Bus

Zyvor Fabric requires access to the system D-Bus for `systemd-machined` integration. Ensure D-Bus is running:

```bash
sudo systemctl status dbus
```

---

## Next Steps

- [Quick Start](02-Quick-Start.md) -- create your first VM
- [Configuration Reference](03-Configuration.md) -- customize Zyvor Fabric settings
- [Web UI Guide](04-Web-UI.md) -- access the web dashboard
