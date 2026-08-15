# Zyvor Fabric — Product Positioning

**Zyvor Fabric** is the Linux control plane for private cloud infrastructure: clustering, networking, security, storage, operators, Terraform, monitoring, HA, and GPU support — built on systemd-vmspawn and systemd-machined.

It is **not** positioned as a basic VM manager. It is a **VM operations fabric** and **private cloud control plane** — closer to Proxmox + KubeVirt UX, without the heavyweight multi-package stack.

Part of the [Zyvor](https://zyvor.dev) product family from ZyvorAI Labs.

---

## What Zyvor Fabric Is

| Dimension | Positioning |
|-----------|-------------|
| **Category** | Systemd-native virtualization platform / private cloud control plane |
| **Analogy** | Proxmox-class UX + KubeVirt-style operations, single Rust daemon |
| **Runtime** | `zyvor-fabricd` — one binary, one config, one systemd unit |
| **Scope** | VMs, network fabric, security policy, storage, HA, migration, observability |
| **Interfaces** | CLI (`zyvorctl`), TUI (`zyvorctl-tui`), Web UI, K8s operator, Terraform provider |

### Elevator pitch

> Zyvor Fabric is a production-grade private cloud control plane for Linux. Deploy in minutes with a single daemon, manage everything through five interfaces, and get enterprise features — RBAC, HA, live migration, GPU passthrough, network policies — without VMware complexity or OpenStack overhead.

---

## Naming Model

| Layer | Name | Notes |
|-------|------|-------|
| **Product** | Zyvor Fabric | Marketing, UI, documentation, sales |
| **Daemon** | `zyvor-fabricd` | systemd unit, config paths, APIs — stable technical identifier |
| **CLI** | `zyvorctl`, `zyvor-fabricd-ctl` | Operational tools |
| **Repo** | [zyvor-fabric](https://github.com/ssahani/zyvor-fabric) | GitHub redirects from `vmspawn` |

Keeping `zyvor-fabricd` as the daemon name avoids breaking installs, Ansible roles, and automation. User-facing surfaces say **Zyvor Fabric**; ops runbooks reference `zyvor-fabricd` where commands and paths matter.

---

## Competitive Frame

### vs. Proxmox / VMware / OpenStack

- **Lighter** — single binary vs. hundreds of packages
- **systemd-native** — VMs are first-class units with journal, watchdog, socket activation
- **Rust control plane** — memory-safe, sub-ms API latency, ~20MB RSS
- **API-first** — 480+ REST endpoints, 3 WebSocket channels, full automation surface

### vs. “Another VM manager”

Zyvor Fabric includes:

- Network policies, VM firewalls, service mesh, QoS, DNS policy, VPN mesh, NAT, packet mirror
- HA clustering, DRS, fault tolerance, replication, site recovery
- Distributed storage backends (local, NFS, LVM, ZFS, Ceph)
- Kubernetes operator + Terraform provider
- 37+ web pages, security hardening, audit logging, compliance tooling

---

## Machina — macOS Companion (Future)

**Machina** is a separate product: an **AI-native Infrastructure Workbench for macOS**.

| | Zyvor Fabric | Machina |
|---|-------------|---------|
| **Platform** | Linux hypervisor hosts | macOS desktop |
| **Role** | Control plane / data plane | AI operator + explorer UI |
| **Analogy** | Proxmox backend | Lens + K9s + Copilot for infrastructure |
| **AI** | API hooks for automation | Local LLM, RAG, tool-calling into Fabric APIs |

### Machina vision

```
┌───────────────────────────────┐
│           Machina             │
├───────────────────────────────┤
│ AI Operator                   │
│ Infrastructure Explorer       │
│ Kubernetes                    │
│ VMs                           │
│ Containers                    │
│ Networking                    │
│ Storage                       │
│ Observability                 │
└───────────────────────────────┘
```

Machina consumes Zyvor Fabric APIs (`zyvor-fabricd`) and eventually Kubernetes, Terraform, and metrics backends. It does **not** replace the Linux daemon — it is the intelligent desktop shell.

### Killer differentiator: Infrastructure Time Machine

Machina continuously records VM state, metrics, network topology, and configs. When an incident occurs, operators ask *“What changed before the outage?”* and get config diffs, topology changes, policy updates, and migration history — something many enterprise platforms still do poorly.

---

## Roadmap (Machina)

| Version | Focus |
|---------|-------|
| **v0.1** | VM dashboard, AI chat, metrics, logs |
| **v0.2** | Network topology, AI RCA, AI recommendations |
| **v0.3** | Kubernetes support, Terraform generation, incident analysis |
| **v0.4** | Local LLM, Infrastructure Time Machine, security advisor |
| **v1.0** | Full AI Infrastructure OS — multi-cluster, VM + K8s + bare metal |

Zyvor Fabric roadmap continues independently: HA, networking depth, operator maturity, and enterprise hardening on Linux.

---

## Messaging Guidelines

### Say

- “Zyvor Fabric — systemd-native private cloud control plane”
- “VM operations fabric for Linux”
- “Proxmox-class capabilities, single-daemon simplicity”
- “Part of the Zyvor product family”

### Avoid

- “VM spawn tool” / “VM manager” as primary positioning
- Renaming `zyvor-fabricd` in install docs, systemd units, or paths
- Conflating Machina (macOS) with Fabric (Linux) in the same install flow

### Technical docs pattern

First mention in a section:

> **Zyvor Fabric** (`zyvor-fabricd`) provides …

Then use the appropriate name for context (product in prose, `zyvor-fabricd` in commands).

---

## Links

- Product: [zyvor.dev](https://zyvor.dev)
- Repository: [github.com/ssahani/zyvor-fabric](https://github.com/ssahani/zyvor-fabric)
- Migration: [MIGRATION-FROM-VMSPAWN.md](MIGRATION-FROM-VMSPAWN.md)
- Documentation: [docs/index.md](index.md)
- Client decks: [client-presentations/](client-presentations/)
