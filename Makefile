.PHONY: all build build-backend build-web \
       install install-bin install-conf install-systemd install-web install-modules \
       uninstall run dev tui cli test clean fmt lint \
       docker-build docker-up docker-down rpm deb help

PREFIX     ?= /usr
DESTDIR    ?=
BINDIR      = $(PREFIX)/bin
SYSCONFDIR  = /etc
DATADIR     = $(PREFIX)/share
UNITDIR     = $(PREFIX)/lib/systemd/system
PRESETDIR   = $(PREFIX)/lib/systemd/system-preset
SYSUSERSDIR = $(PREFIX)/lib/sysusers.d
TMPFILESDIR = $(PREFIX)/lib/tmpfiles.d
MODULESDIR  = $(SYSCONFDIR)/modules-load.d
LIBEXECDIR  = $(PREFIX)/libexec/vmspawnd

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
	install -m 0644 configs/vmspawnd.env  $(DESTDIR)$(SYSCONFDIR)/vmspawnd/vmspawnd.env
	install -d $(DESTDIR)/var/lib/vmspawnd/images

install-systemd:
	install -d $(DESTDIR)$(UNITDIR)
	install -m 0644 systemd/vmspawnd.service         $(DESTDIR)$(UNITDIR)/vmspawnd.service
	install -m 0644 systemd/vmspawnd.socket          $(DESTDIR)$(UNITDIR)/vmspawnd.socket
	install -m 0644 systemd/vm@.service              $(DESTDIR)$(UNITDIR)/vm@.service
	install -m 0644 systemd/vmspawnd-backup.service  $(DESTDIR)$(UNITDIR)/vmspawnd-backup.service
	install -m 0644 systemd/vmspawnd-backup.timer    $(DESTDIR)$(UNITDIR)/vmspawnd-backup.timer
	install -d $(DESTDIR)$(PRESETDIR)
	install -m 0644 systemd/vmspawnd.preset  $(DESTDIR)$(PRESETDIR)/90-vmspawnd.preset
	install -d $(DESTDIR)$(SYSUSERSDIR)
	install -m 0644 systemd/vmspawnd.sysusers $(DESTDIR)$(SYSUSERSDIR)/vmspawnd.conf
	install -d $(DESTDIR)$(TMPFILESDIR)
	install -m 0644 systemd/vmspawnd.tmpfiles $(DESTDIR)$(TMPFILESDIR)/vmspawnd.conf
	install -d $(DESTDIR)$(LIBEXECDIR)
	install -m 0755 scripts/backup-vms $(DESTDIR)$(LIBEXECDIR)/backup-vms

install-web:
	install -d $(DESTDIR)$(DATADIR)/vmspawnd/web
	cp -r web/dist/* $(DESTDIR)$(DATADIR)/vmspawnd/web/

install-modules:
	install -d $(DESTDIR)$(MODULESDIR)
	install -m 0644 configs/modules-load.d/vmspawnd.conf $(DESTDIR)$(MODULESDIR)/vmspawnd.conf

uninstall:
	rm -f  $(DESTDIR)$(BINDIR)/vmspawnd
	rm -f  $(DESTDIR)$(BINDIR)/vmctl
	rm -f  $(DESTDIR)$(BINDIR)/vmctl-tui
	rm -f  $(DESTDIR)$(UNITDIR)/vmspawnd.service
	rm -f  $(DESTDIR)$(UNITDIR)/vmspawnd.socket
	rm -f  $(DESTDIR)$(UNITDIR)/vm@.service
	rm -f  $(DESTDIR)$(UNITDIR)/vmspawnd-backup.service
	rm -f  $(DESTDIR)$(UNITDIR)/vmspawnd-backup.timer
	rm -rf $(DESTDIR)$(LIBEXECDIR)
	rm -f  $(DESTDIR)$(PRESETDIR)/90-vmspawnd.preset
	rm -f  $(DESTDIR)$(SYSUSERSDIR)/vmspawnd.conf
	rm -f  $(DESTDIR)$(TMPFILESDIR)/vmspawnd.conf
	rm -rf $(DESTDIR)$(DATADIR)/vmspawnd
	rm -rf $(DESTDIR)$(SYSCONFDIR)/vmspawnd

run:
	cd backend && VSPAWN_LOG_LEVEL=info cargo run --bin vmspawnd

run-debug:
	cd backend && VSPAWN_LOG_LEVEL=debug cargo run --bin vmspawnd

dev:
	@echo "Starting vmspawnd in development mode..."
	@cd backend && VSPAWN_LOG_LEVEL=debug cargo run --bin vmspawnd &
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

rpm:
	rpmbuild -ba vmspawnd.spec --define "_topdir $(PWD)/rpmbuild" --define "_sourcedir $(PWD)"

deb:
	dpkg-buildpackage -us -uc -b

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
	@echo "  install-systemd - Install systemd units (service, socket, preset, sysusers, tmpfiles)"
	@echo "  install-web     - Install web UI static files"
	@echo "  install-modules - Install kernel module config"
	@echo "  uninstall       - Remove installed files"
	@echo "  run             - Run daemon (info log level)"
	@echo "  run-debug       - Run daemon (debug log level)"
	@echo "  dev             - Run in development mode (debug + web dev server)"
	@echo "  tui             - Run TUI"
	@echo "  cli             - Run CLI"
	@echo "  test            - Run tests"
	@echo "  clean           - Clean build artifacts"
	@echo "  fmt             - Format code"
	@echo "  lint            - Lint code"
	@echo "  rpm             - Build RPM package"
	@echo "  deb             - Build Debian package"
	@echo "  docker-build    - Build Docker image"
	@echo "  docker-up       - Start with Docker Compose"
	@echo "  docker-down     - Stop Docker Compose"
	@echo ""
	@echo "Variables:"
	@echo "  PREFIX=$(PREFIX)  DESTDIR=$(DESTDIR)"
	@echo "  BINDIR=$(BINDIR)  SYSCONFDIR=$(SYSCONFDIR)"
	@echo "  UNITDIR=$(UNITDIR)"
