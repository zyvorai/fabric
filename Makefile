.PHONY: build build-backend build-web install run dev clean test

all: build

build: build-backend build-web

build-backend:
	cd backend && cargo build --release

build-web:
	cd web && npm install && npm run build

install: build
	sudo mkdir -p /usr/local/bin
	sudo mkdir -p /etc/vmspawnd
	sudo mkdir -p /var/lib/vmspawnd
	sudo cp backend/target/release/vmspawnd /usr/local/bin/
	sudo cp backend/target/release/vmctl /usr/local/bin/
	sudo cp backend/target/release/vmctl-tui /usr/local/bin/
	sudo cp configs/vmspawnd.toml /etc/vmspawnd/
	sudo cp systemd/vmspawnd.service /etc/systemd/system/
	sudo systemctl daemon-reload

uninstall:
	sudo systemctl stop vmspawnd || true
	sudo systemctl disable vmspawnd || true
	sudo rm -f /usr/local/bin/vmspawnd
	sudo rm -f /usr/local/bin/vmctl
	sudo rm -f /usr/local/bin/vmctl-tui
	sudo rm -f /etc/systemd/system/vmspawnd.service
	sudo systemctl daemon-reload

run:
	cd backend && cargo run --bin vmspawnd

dev:
	@echo "Starting vmspawnd in development mode..."
	@cd backend && cargo run --bin vmspawnd &
	@cd web && npm run dev

tui:
	cd backend && cargo run --bin vmctl-tui

cli:
	cd backend && cargo run --bin vmctl

test:
	cd backend && cargo test
	cd web && npm test

clean:
	cd backend && cargo clean
	cd web && rm -rf node_modules dist

fmt:
	cd backend && cargo fmt

lint:
	cd backend && cargo clippy

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

help:
	@echo "Available targets:"
	@echo "  build         - Build backend and web UI"
	@echo "  install       - Install to system"
	@echo "  uninstall     - Remove from system"
	@echo "  run           - Run daemon"
	@echo "  dev           - Run in development mode"
	@echo "  tui           - Run TUI"
	@echo "  cli           - Run CLI"
	@echo "  test          - Run tests"
	@echo "  clean         - Clean build artifacts"
	@echo "  fmt           - Format code"
	@echo "  lint          - Lint code"
	@echo "  docker-build  - Build Docker image"
	@echo "  docker-up     - Start with Docker Compose"
	@echo "  docker-down   - Stop Docker Compose"
