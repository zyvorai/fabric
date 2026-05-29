#!/bin/bash
set -euo pipefail

echo "=== Zyvor Fabric installer (vmspawnd) ==="
echo "Zyvor suite — zyvor.dev · HyperSDK · © 2026"
echo "No git clone required after you have this tree."
echo ""

# Build backend
echo "[1/6] Building backend..."
cd backend
cargo build --release
cd ..

# Build web UI
echo "[2/6] Building web UI..."
cd web
npm install --silent
npm run build
cd ..

# Install binaries
echo "[3/6] Installing binaries..."
sudo install -d /usr/bin
sudo install -m 0755 backend/target/release/vmspawnd  /usr/bin/vmspawnd
sudo install -m 0755 backend/target/release/vmctl      /usr/bin/vmctl
sudo install -m 0755 backend/target/release/vmctl-tui  /usr/bin/vmctl-tui

# Install config
echo "[4/6] Installing configuration..."
sudo install -d /etc/vmspawnd
sudo install -m 0644 configs/vmspawnd.toml /etc/vmspawnd/vmspawnd.toml
sudo install -m 0644 configs/vmspawnd.env  /etc/vmspawnd/vmspawnd.env
sudo install -m 0644 configs/pam.d/vmspawnd /etc/pam.d/vmspawnd

# Create directories
sudo install -d /var/lib/vmspawnd/images
sudo install -d /var/lib/vmspawnd/state
sudo install -d /run/vmspawnd
sudo install -d /var/log/vmspawnd

# Install systemd units
echo "[5/6] Installing systemd units..."
sudo install -d /usr/lib/systemd/system
sudo install -m 0644 systemd/vmspawnd.service /usr/lib/systemd/system/vmspawnd.service
sudo install -m 0644 systemd/vmspawnd.socket  /usr/lib/systemd/system/vmspawnd.socket
sudo install -m 0644 systemd/vm@.service      /usr/lib/systemd/system/vm@.service

sudo install -d /usr/lib/systemd/system-preset
sudo install -m 0644 systemd/vmspawnd.preset /usr/lib/systemd/system-preset/90-vmspawnd.preset

sudo install -d /usr/lib/sysusers.d
sudo install -m 0644 systemd/vmspawnd.sysusers /usr/lib/sysusers.d/vmspawnd.conf

sudo install -d /usr/lib/tmpfiles.d
sudo install -m 0644 systemd/vmspawnd.tmpfiles /usr/lib/tmpfiles.d/vmspawnd.conf

sudo install -d /etc/modules-load.d
sudo install -m 0644 configs/modules-load.d/vmspawnd.conf /etc/modules-load.d/vmspawnd.conf

# Install web UI
echo "[6/6] Installing web UI..."
sudo install -d /usr/share/vmspawnd/web
sudo cp -r web/dist/* /usr/share/vmspawnd/web/

# Create sysusers and tmpfiles
sudo systemd-sysusers vmspawnd.conf 2>/dev/null || true
sudo systemd-tmpfiles --create vmspawnd.conf 2>/dev/null || true

# Reload systemd
sudo systemctl daemon-reload

echo ""
echo "=== Installation complete ==="
echo ""
echo "To enable and start vmspawnd:"
echo "  sudo systemctl enable --now vmspawnd.socket"
echo "  sudo systemctl enable --now vmspawnd.service"
echo ""
echo "To check status:"
echo "  sudo systemctl status vmspawnd"
echo ""
echo "To enable debug logging:"
echo "  echo 'VSPAWN_LOG_LEVEL=debug' | sudo tee -a /etc/vmspawnd/vmspawnd.env"
echo "  sudo systemctl restart vmspawnd"
echo ""
echo "Access web UI at http://localhost:9095"
echo "Use vmctl or vmctl-tui from the command line"
