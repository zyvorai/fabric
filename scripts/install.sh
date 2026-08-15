#!/bin/bash
set -euo pipefail

echo "=== Zyvor Fabric installer (zyvor-fabricd) ==="
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
sudo install -m 0755 backend/target/release/zyvor-fabricd  /usr/bin/zyvor-fabricd
sudo install -m 0755 backend/target/release/zyvorctl      /usr/bin/zyvorctl
sudo install -m 0755 backend/target/release/zyvorctl-tui  /usr/bin/zyvorctl-tui

# Install config
echo "[4/6] Installing configuration..."
sudo install -d /etc/zyvor-fabricd
sudo install -m 0644 configs/zyvor-fabricd.toml /etc/zyvor-fabricd/zyvor-fabricd.toml
sudo install -m 0644 configs/zyvor-fabricd.env  /etc/zyvor-fabricd/zyvor-fabricd.env
sudo install -m 0644 configs/pam.d/zyvor-fabricd /etc/pam.d/zyvor-fabricd

# Create directories
sudo install -d /var/lib/zyvor-fabricd/images
sudo install -d /var/lib/zyvor-fabricd/state
sudo install -d /run/zyvor-fabricd
sudo install -d /var/log/zyvor-fabricd

# Install systemd units
echo "[5/6] Installing systemd units..."
sudo install -d /usr/lib/systemd/system
sudo install -m 0644 systemd/zyvor-fabricd.service /usr/lib/systemd/system/zyvor-fabricd.service
sudo install -m 0644 systemd/vm@.service      /usr/lib/systemd/system/vm@.service

sudo install -d /usr/lib/systemd/system-preset
sudo install -m 0644 systemd/zyvor-fabricd.preset /usr/lib/systemd/system-preset/90-zyvor-fabricd.preset

sudo install -d /usr/lib/sysusers.d
sudo install -m 0644 systemd/zyvor-fabricd.sysusers /usr/lib/sysusers.d/zyvor-fabricd.conf

sudo install -d /usr/lib/tmpfiles.d
sudo install -m 0644 systemd/zyvor-fabricd.tmpfiles /usr/lib/tmpfiles.d/zyvor-fabricd.conf

sudo install -d /etc/modules-load.d
sudo install -m 0644 configs/modules-load.d/zyvor-fabricd.conf /etc/modules-load.d/zyvor-fabricd.conf

# Install web UI
echo "[6/6] Installing web UI..."
sudo install -d /usr/share/zyvor-fabricd/web
sudo cp -r web/dist/* /usr/share/zyvor-fabricd/web/

# Create sysusers and tmpfiles
sudo systemd-sysusers zyvor-fabricd.conf 2>/dev/null || true
sudo systemd-tmpfiles --create zyvor-fabricd.conf 2>/dev/null || true

# Reload systemd
sudo systemctl daemon-reload

echo ""
echo "=== Installation complete ==="
echo ""
echo "To enable and start zyvor-fabricd:"
echo "  sudo systemctl enable --now zyvor-fabricd.service"
echo ""
echo "To check status:"
echo "  sudo systemctl status zyvor-fabricd"
echo ""
echo "To enable debug logging:"
echo "  echo 'ZYVOR_FABRICD_LOG_LEVEL=debug' | sudo tee -a /etc/zyvor-fabricd/zyvor-fabricd.env"
echo "  sudo systemctl restart zyvor-fabricd"
echo ""
echo "Access web UI at http://localhost:9095"
echo "Use zyvorctl or zyvorctl-tui from the command line"
