#!/bin/bash
set -e

# Create dev directories
mkdir -p /tmp/zyvor-fabricd/images

# Run daemon in dev mode
cd backend
RUST_LOG=debug cargo run --bin zyvor-fabricd
