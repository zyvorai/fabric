.PHONY: all build build-backend build-web \
       install install-bin install-conf install-systemd install-web install-modules \
       uninstall run dev tui cli test clean fmt lint \
       docker-build docker-up docker-down help

PREFIX  ?= /usr
DESTDIR ?=
BINDIR   = $(PREFIX)/bin
SYSCONFDIR = /etc
DATADIR  = $(PREFIX)/share
UNITDIR  = $(PREFIX)/lib/systemd/system

all: build

build: build-backend build-web

build-backend:
	cd backend && cargo build --release

build-web:
	cd web && npm install && npm run build

install: install-bin install-conf install-systemd install-web install-modules

install-bin:
	install -d $(DESTDIR)$(BINDIR)
	install -m 0755 backend/target/release/vmspawnd  $(DESTDIR)$(BINDIR)/vmspawnd
	install -m 0755 backend/target/release/vmctl      $(DESTDIR)$(BINDIR)/vmctl
	install -m 0755 backend/target/release/vmctl-tui  $(DESTDIR)$(BINDIR)/vmctl-tui

install-conf:
	install -d $(DESTDIR)$(SYSCONFDIR)/vmspawnd
	install -m 0644 configs/vmspawnd.toml $(DESTDIR)$(SYSCONFDIR)/vmspawnd/vmspawnd.toml
	install -d $(DESTDIR)/var/lib/vmspawnd

install-systemd:
	install -d $(DESTDIR)$(UNITDIR)
	install -m 0644 systemd/vmspawnd.service $(DESTDIR)$(UNITDIR)/vmspawnd.service
	install -m 0644 systemd/vm@.service      $(DESTDIR)$(UNITDIR)/vm@.service

install-web:
	install -d $(DESTDIR)$(DATADIR)/vmspawnd/web
	cp -r web/dist/* $(DESTDIR)$(DATADIR)/vmspawnd/web/

install-modules:
	install -d $(DESTDIR)/etc/modules-load.d
	install -m 0644 configs/modules-load.d/vmspawnd.conf $(DESTDIR)/etc/modules-load.d/vmspawnd.conf

uninstall:
	rm -f $(DESTDIR)$(BINDIR)/vmspawnd
	rm -f $(DESTDIR)$(BINDIR)/vmctl
	rm -f $(DESTDIR)$(BINDIR)/vmctl-tui
	rm -f $(DESTDIR)$(UNITDIR)/vmspawnd.service
	rm -f $(DESTDIR)$(UNITDIR)/vm@.service

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
	@echo "  build           - Build backend and web UI"
	@echo "  install         - Install everything (use DESTDIR= for staged installs)"
	@echo "  install-bin     - Install binaries only"
	@echo "  install-conf    - Install configuration files"
	@echo "  install-systemd - Install systemd unit files"
	@echo "  install-web     - Install web UI static files"
	@echo "  uninstall       - Remove installed files"
	@echo "  run             - Run daemon"
	@echo "  dev             - Run in development mode"
	@echo "  tui             - Run TUI"
	@echo "  cli             - Run CLI"
	@echo "  test            - Run tests"
	@echo "  clean           - Clean build artifacts"
	@echo "  fmt             - Format code"
	@echo "  lint            - Lint code"
	@echo "  docker-build    - Build Docker image"
	@echo "  docker-up       - Start with Docker Compose"
	@echo "  docker-down     - Stop Docker Compose"
	@echo ""
	@echo "Variables:"
	@echo "  PREFIX=$(PREFIX)  DESTDIR=$(DESTDIR)"
	@echo "  BINDIR=$(BINDIR)  SYSCONFDIR=$(SYSCONFDIR)"
	@echo "  DATADIR=$(DATADIR)  UNITDIR=$(UNITDIR)"
