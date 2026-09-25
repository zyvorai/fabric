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

<br>

<div align="center">

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Apache-2.0](LICENSE)

<sub>© Zyvor</sub>

</div>
