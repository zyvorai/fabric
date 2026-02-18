#!/bin/bash
set -e

# Create dev directories
mkdir -p /tmp/vmspawnd/images

# Run daemon in dev mode
cd backend
RUST_LOG=debug cargo run --bin vmspawnd
