# vmspawnd Documentation

**Enterprise VM management built on systemd. One binary. Five minutes to production.**

vmspawnd is a production-grade virtual machine management platform built in Rust. It wraps `systemd-vmspawn` and `systemd-machined` with a complete management layer -- 520+ REST API endpoints, a React web dashboard, PAM/JWT authentication, and enterprise features including HA clustering, live migration, network policies, and GPU passthrough.

---

## Quick Navigation by Role

### System Administrator

You need to deploy, configure, and operate vmspawnd in production.

1. [Installation Guide](getting-started/01-Installation.md) -- system requirements and package installation
2. [Configuration Reference](getting-started/03-Configuration.md) -- config file, environment variables, auth setup
3. [Web UI Guide](getting-started/04-Web-UI.md) -- dashboard access and management
4. [Product Overview](PRODUCT_OVERVIEW.md) -- full feature inventory and architecture

### Developer

You need to integrate with the vmspawnd API or contribute to the codebase.

1. [Quick Start](getting-started/02-Quick-Start.md) -- create your first VM in 5 minutes
2. [API Reference](api.md) -- 520+ REST endpoints, WebSocket console, authentication
3. [Architecture Guide](architecture.md) -- crate structure, data flow, driver model
4. [Product Overview](PRODUCT_OVERVIEW.md) -- technology stack and project statistics

### Enterprise / Decision Maker

You need to evaluate vmspawnd against existing solutions.

1. [Product Overview](PRODUCT_OVERVIEW.md) -- comparison tables, deployment models, feature matrix
2. [Security Documentation](security.md) -- audit history, RBAC model, compliance
3. [High Availability](high-availability.md) -- clustering, failover, DRS

---

## Quick Navigation by Task

| Task | Guide |
|------|-------|
| Install vmspawnd | [Installation Guide](getting-started/01-Installation.md) |
| Create your first VM | [Quick Start](getting-started/02-Quick-Start.md) |
| Configure the daemon | [Configuration Reference](getting-started/03-Configuration.md) |
| Access the web dashboard | [Web UI Guide](getting-started/04-Web-UI.md) |
| Set up networking | [Networking Guide](networking.md) |
| Configure storage backends | [Storage Guide](storage.md) |
| Enable authentication | [Configuration Reference](getting-started/03-Configuration.md#authentication) |
| Set up GPU passthrough | [GPU Passthrough Guide](gpu-passthrough.md) |
| Enable live migration | [Migration Guide](migration.md) |
| Configure backups | [Product Overview](PRODUCT_OVERVIEW.md#backup-commands) |
| Use the terminal UI | [TUI Guide](tui.md) |
| Review security posture | [Security Documentation](security.md) |

---

## Documentation Structure

```
docs/
  README.md ..................... This file (entry point)
  index.md ...................... Master documentation index
  PRODUCT_OVERVIEW.md ........... Complete product overview and feature matrix
  getting-started/
    README.md ................... Getting started section overview
    01-Installation.md .......... System requirements and installation
    02-Quick-Start.md ........... 5-minute quick start guide
    03-Configuration.md ......... Configuration file and environment variables
    04-Web-UI.md ................ Web dashboard access and usage
  api.md ........................ REST API reference (520+ endpoints)
  architecture.md ............... System architecture and crate structure
  security.md ................... Security model, audit, RBAC
  networking.md ................. Network configuration and policies
  storage.md .................... Storage backends and volume management
  high-availability.md .......... Clustering and failover
  migration.md .................. Live migration guide
  gpu-passthrough.md ............ GPU passthrough configuration
  tui.md ........................ Terminal UI (vmctl-tui) guide
  web-ui.md ..................... Web dashboard reference
  guides/ ....................... Operational guides and decision support
  tutorials/ .................... Step-by-step tutorials
  reference/ .................... API and CLI reference material
  deployment/ ................... Deployment guides and runbooks
  development/ .................. Contributing and development setup
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | Rust (2021 edition) |
| Async Runtime | Tokio 1.44 |
| Web Framework | Axum 0.8 |
| VM Backend | systemd-vmspawn + systemd-machined |
| D-Bus Integration | zbus 4 |
| Web UI | React 18 + TypeScript + Vite + TailwindCSS |
| Terminal UI | ratatui + crossterm |
| Monitoring | Prometheus |

---

## Project Statistics

| Metric | Value |
|--------|-------|
| Backend crates | 40 |
| REST API endpoints | 520+ |
| WebSocket endpoints | 3 |
| Lines of code | ~87,000 |
| Security audit rounds | 31 |

---

## License

MIT -- free for commercial use, modification, and distribution.
