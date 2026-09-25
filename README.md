<div align="center">

<br>

# Keep

### Your agent gets a real computer.<br>You keep the keys.

Keep gives an untrusted AI agent its own sealed computer on hardware you control,<br>
while you hold the policy, the credentials and the approvals. Open source.

<br>

[**Try it in 60 seconds**](#try-it-in-60-seconds) &nbsp;·&nbsp; [Read the docs](docs/keep/KEEP.md) &nbsp;·&nbsp; [Website](https://zyvorai.github.io/fabric/keep) &nbsp;·&nbsp; [Keep vs Muse](https://zyvorai.github.io/fabric/compare)

<br>

<img src="docs/assets/keep/cockpit.svg" alt="The Keep cockpit: a sealed cell, zero outbound connections, an approval waiting for you, and split-sight between the agent and you." width="900">

<br>
<br>

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Keep CI](https://github.com/zyvorai/fabric/actions/workflows/keep.yml/badge.svg)](https://github.com/zyvorai/fabric/actions/workflows/keep.yml)
![Evidence: software-test](https://img.shields.io/badge/evidence-software--test-lightgrey)

</div>

<br>

## A sealed computer

The agent works in its own microVM with its own kernel. It can't reach your machine, and the network rules live on the host, outside its reach.

## You hold the keys

Policy is a signed `keep.policy.yaml` you can diff in git. Passwords stay in a vault and are injected on the host, so the agent never sees a real secret.

## Approve what matters

Buying, sending and deleting are approved out of band, in your cockpit, never in the chat.

## See everything

The agent reads a structured outline of the page. You watch the real pixels, follow every decision, and can pause to step in.

## Proof, not promises

Drop in a vendor PDF and get a one-page brief while the cockpit counts **0 outbound connections**, taken from Keep's own audit journal and enforced on the host.

<br>

## Try it in 60 seconds

No KVM needed for the first two steps.

```bash
git clone https://github.com/zyvorai/fabric && cd fabric

# 1. Unit tests for the runtime
cargo test --manifest-path agent-runtime/Cargo.toml --lib

# 2. End to end: live runtime, sandbox stub and keepctl
./scripts/keep-e2e.sh          # ends with: passed=40 failed=0

# 3. On a FluxVM host with a node22-agent template
./scripts/keep-live-lab.sh
```

Then stage the demo: [drop in a PDF, get a brief](docs/tutorials/17-keep-pdf-brief.md). Seven one-click use cases ship with Keep: PDF brief, contract clauses, security questionnaire, meeting actions, log triage, SBOM summary and CSV cleanup.

## Honest about the limits

Keep runs on measured VMs today, and its evidence class is `software-test`. Until it runs on verified confidential hardware with a key only you hold, the host can still see inside the VM, and we will not claim otherwise.

<br>

## Built on Zyvor Fabric

Keep is the agent runtime of **Zyvor Fabric**, a private cloud control plane for Linux: VMs, networking, storage, security and AI inference from one daemon, with a CLI, a web console, a Kubernetes operator and a Terraform provider. Each cell runs on [FluxVM](https://github.com/zyvorai/fluxvm).

```bash
git clone https://github.com/zyvorai/fabric.git && cd fabric
make build && sudo make install
sudo zyvor-fabricd
zyvorctl list
```

|  |  |
|---|---|
| [Full overview](docs/PROJECT-OVERVIEW.md) | What Fabric is, deploy options, architecture and the doc map |
| [Quick start](QUICKSTART.md) | Install and first VM |
| [Kubernetes](docs/KUBERNETES.md) · [Docker](docs/DOCKER.md) | Deploy on your platform |
| [AI workloads](docs/ai-workloads.md) | OpenAI-compatible inference on your own GPUs |
| [Documentation](docs/README.md) | Everything else |

## Project overview

The sections below are from the full project overview, [docs/PROJECT-OVERVIEW.md](docs/PROJECT-OVERVIEW.md), which also covers the architecture, the platform stack and licensing.

### What is Zyvor Fabric?

**Zyvor Fabric** is a production-grade private cloud control plane for Linux. One ~15MB Rust daemon (`zyvor-fabricd`) gives you VM lifecycle, software-defined networking, pluggable storage, security policy, and **OpenAI-compatible AI inference** — managed through four interfaces (**CLI, Web, Kubernetes operator, Terraform**) that all talk to the same API, so nothing drifts between them.

It targets the gap between two extremes: **manual QEMU/KVM + shell scripts** (no security, no multi-user access, doesn't scale) and **VMware/OpenStack-class stacks** (hundreds to thousands of packages, dedicated ops teams, days to stand up). Fabric deploys in about 5 minutes, runs on any Linux server with KVM — no vCenter, no systemd hard-requirement — and still ships the things enterprise buyers actually ask for: RBAC, audit logging, HA clustering, live migration, GPU passthrough, Maglev load balancing, and a 780+-endpoint REST API for automation.

Fabric doesn't implement VM execution itself — that's a deliberate design choice, not a gap. It's the orchestration, API, auth, and UX layer on top of two independent sibling projects: **[FluxVM](https://github.com/zyvorai/fluxvm)** (the VM engine) and **[GuestKit](https://github.com/zyvorai/guestkit)** (offline disk tooling). Each is independently useful, Apache-2.0 licensed, and separately adoptable.

> **Naming:** the product is **Zyvor Fabric**; the daemon/unit/paths stay `zyvor-fabricd`. Canonical repo: [zyvorai/fabric](https://github.com/zyvorai/fabric). See [docs/NAMING.md](docs/NAMING.md) and [docs/POSITIONING.md](docs/POSITIONING.md).

**Feature guides:** **[User Feature Guide](docs/zyvor-fabric-user-feature-guide.md)** — 55 features across 9 areas (also [PDF](docs/zyvor-fabric-user-feature-guide.pdf)) · **[User manual](docs/user/README.md)** — every console surface, page by page.

---


### Is this for you?

Zyvor Fabric is a strong fit when:

- **You don't want a systemd hard-requirement for VM lifecycle** — VMs run under [FluxVM](https://github.com/zyvorai/fluxvm)'s own process supervision, not as systemd units; host networking uses direct netlink calls. systemd stays fully supported as one option for supervising the `zyvor-fabricd` daemon process itself, for operators who want it.
- **You need API-first automation** — a 780+-endpoint REST API for infrastructure-as-code, CI/CD pipelines, or custom tooling, not a GUI-only or XML-RPC-only product.
- **You're running single-host or small-cluster deployments** — lightweight VM management without the operational overhead of full cluster orchestration platforms.
- **You're security-conscious** — PAM/LDAP/OIDC authentication, role-based access control, audit logging, and network policy enforcement are built in, not bolted on.
- **You want private inference next to the VMs** — register a model, deploy replicas, Maglev-weight them, and front them with API keys or `aud=fabric-inference` JWTs ([Tutorial 15](docs/tutorials/15-ai-workloads.md)).

Look elsewhere when:

- **You need large multi-host clusters with mature live migration today** — Proxmox VE or oVirt offer more battle-tested shared-storage live migration out of the box; Fabric's native live-migration transport is still preview (see [Comparison Matrix](docs/guides/decision-support/comparison-matrix.md)).
- **You're deep in an existing libvirt ecosystem** — Fabric talks to FluxVM's own REST API, not libvirt's XML domain definitions; migrating existing libvirt tooling means API adaptation, not a drop-in swap.
- **You need first-class Windows guest support** — Fabric focuses on Linux guests via QEMU/KVM; for mixed Windows/Linux fleets, Proxmox or full libvirt access is more mature there.

Full comparison against libvirt/virsh and Proxmox VE: **[docs/guides/decision-support/comparison-matrix.md](docs/guides/decision-support/comparison-matrix.md)**. Common questions: **[FAQ](docs/quick-reference/faq.md)**.

---


### Deploy

Four first-class ways to run Fabric. Pick one:

```text
┌─────────────────┬──────────────────┬──────────────────┬─────────────────┐
│  Bare metal     │  Docker/Podman   │  Kubernetes      │  Operator only  │
│  systemd/binary │  compose         │  DaemonSets      │  CRDs → API     │
├─────────────────┼──────────────────┼──────────────────┼─────────────────┤
│  Production     │  Local eval      │  Lab k3s /       │  GitOps VMs     │
│  hosts          │                  │  in-cluster CP   │  against fabricd│
└─────────────────┴──────────────────┴──────────────────┴─────────────────┘
```

#### Bare metal (systemd) — easiest path

Ship **FluxVM + Fabric** in one command (from the Fabric repo, with sibling `../fluxvm`):

```bash
./scripts/ship sus@HOST              # lab quick redeploy + readiness
./scripts/ship sus@HOST --full       # first install (deps + firewall)
FABRIC_ADMIN_PASSWORD='…' ./scripts/ship sus@HOST --prod
```

Same from FluxVM: `./scripts/ship sus@HOST` (execs sibling Fabric `scripts/ship`).

Advanced (Fabric only):

```bash
./scripts/deploy remote sus@HOST
./scripts/deploy remote sus@HOST --quick    # skip OS deps
./scripts/deploy check sus@HOST
```

Installs `zyvor-fabricd` + web UI, opens `0.0.0.0:9095` (HTTPS, self-signed by default). Admin password is generated on deploy unless you set `FABRIC_ADMIN_PASSWORD` / `ZYVOR_FABRICD_ADMIN_PASSWORD`, or `FABRIC_LAB_DEFAULTS=1` for convenient lab default `Admin@321`. Retrieve: `sudo cat /var/lib/zyvor-fabricd/.admin_password`. Reseed with `FORCE_ADMIN_RESET=1 ./scripts/deploy remote USER@HOST --quick`.

#### Docker / Podman

```bash
./scripts/build-container-images.sh   # needs ../FluxVM + ../guestkit
make docker-up                        # hostNetwork + /dev/kvm
# → http://localhost:9095   admin / eval-admin-only
```

See [docs/DOCKER.md](docs/DOCKER.md) for host prerequisites (`nbd`, KVM, rootful engine, cgroup v2).

#### Run on Kubernetes

Fabric on Kubernetes uses the same **lab packaging pattern as Ragnarok** (manifests, Helm, remote `k3s ctr import`), but workloads are **privileged `hostNetwork` DaemonSets** — required for nftables, KVM, and FluxVM on `127.0.0.1:7788` (same model as compose).

> Full guide: **[docs/KUBERNETES.md](docs/KUBERNETES.md)**

```bash
# First time: build images on the node, import into k3s, apply manifests
./scripts/deploy k8s sus@HOST

# Later: re-apply + rollout only
./scripts/deploy k8s sus@HOST --quick

# Remove
./scripts/deploy k8s sus@HOST --uninstall
```

| Surface | Port |
|---------|------|
| UI + API (NodePort) | **30095** |
| UI + API (hostNetwork) | **9095** |
| FluxVM | **7788** (node-local) |

Open `http://HOST:30095/` after deploy. **Login:** `admin` + password from Secret `zyvor-fabric-secrets` (generated unless `FABRIC_ADMIN_PASSWORD` or `FABRIC_LAB_DEFAULTS=1`). Retrieve: `kubectl -n zyvor-fabric get secret zyvor-fabric-secrets -o jsonpath='{.data.admin-password}' | base64 -d; echo`.

**Local kubectl / Helm:**

```bash
# Manifests (images must be visible to the cluster)
make k8s-deploy
# or: BUILD_IMAGES=true ./scripts/deploy-k8s.sh

# Helm
helm upgrade --install zyvor-fabric ./charts/zyvor-fabric \
  --namespace zyvor-fabric --create-namespace \
  --set security.adminPassword='...' \
  --set security.jwtSecret="$(openssl rand -base64 32)"
```

**Platform chart vs. operator:**

| Piece | What it does |
|-------|----------------|
| **`charts/zyvor-fabric`** / `k8s/base/` | Runs **fabricd + FluxVM** in the cluster |
| **`operator/charts/zyvor-fabricd-operator`** | Watches `VirtualMachine` CRs and calls an **already-running** fabricd API |

Point the operator at NodePort or the node IP (`ZYVOR_FABRICD_URL=http://NODE_IP:30095`). Do not expect ClusterIP DNS to replace `hostNetwork` across nodes.

**Requirements (K8s):** node with `/dev/kvm` · namespace PSS **privileged** (cannot run restricted) · rootful `podman` or `docker` on the build host for image builds · optional sibling checkouts `../FluxVM` and `../guestkit` for the FluxVM image.

---


### Platform at a glance

| Metric | Value |
|--------|-------|
| Rust crates | 53 |
| REST endpoints | 780+ (main API) — 824 combined with the OpenStack-compatibility layer |
| LOC | ~87K (60K Rust + 27K TS) |
| Web stack | React 19.2 · Vite · Tailwind |
| Interfaces | 4 (CLI, Web, Operator, Terraform) + Fabric Doctor |
| Web pages | 92 (87 console + 5 marketing) |
| Security | 31-round audit, 194 issues found and fixed, 0 outstanding ([report](docs/SECURITY_AUDIT_REPORT.md)) |
| Deploy modes | Bare metal · Docker · Kubernetes · Operator |

All figures above are counted directly from source (route definitions, router config, crate manifest, audit report) — see [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) for the methodology.

---

<br>

<div align="center">

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Apache-2.0](LICENSE)

<sub>© Zyvor</sub>

</div>
