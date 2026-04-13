# Quick Reference

This section provides quick-reference material for vmspawn operators and
developers.

---

## Documents

| Document                                      | Description                                    |
|-----------------------------------------------|------------------------------------------------|
| [Quick Reference](quick-reference.md)         | One-page cheat sheet with essential API calls, common curl commands, configuration reference, and troubleshooting tips. |
| [Glossary](glossary.md)                       | Definitions of 100+ terms related to vmspawn, systemd, KVM, QEMU, cloud-init, and virtualization. |
| [FAQ](faq.md)                                 | Frequently asked questions about vmspawn architecture, capabilities, operations, and troubleshooting. |

---

## At a Glance

- **Default listen address**: `127.0.0.1:9095`
- **Config file**: `/etc/vmspawnd/vmspawnd.toml`
- **Data directory**: `/var/lib/vmspawnd/`
- **API base path**: `/api/v1/`
- **Metrics endpoint**: `/metrics`
- **WebSocket console**: `/api/v1/ws/{vm_name}/console`
- **SSE event stream**: `/api/v1/events/stream`
- **Log level env var**: `VSPAWN_LOG_LEVEL`
