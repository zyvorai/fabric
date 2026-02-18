#!/bin/bash
set -e

echo "Installing vmspawnd..."

# Build
cd backend
cargo build --release
cd ..

# Install binaries
sudo mkdir -p /usr/local/bin
sudo cp backend/target/release/vmspawnd /usr/local/bin/
sudo cp backend/target/release/vmctl /usr/local/bin/
sudo cp backend/target/release/vmctl-tui /usr/local/bin/

# Install config
sudo mkdir -p /etc/vmspawnd
sudo cp configs/vmspawnd.toml /etc/vmspawnd/

# Create storage directory
sudo mkdir -p /var/lib/vmspawnd/images

# Install systemd service
sudo cp systemd/vmspawnd.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "Installation complete!"
echo ""
echo "To enable and start vmspawnd:"
echo "  sudo systemctl enable --now vmspawnd"
echo ""
echo "To check status:"
echo "  sudo systemctl status vmspawnd"
