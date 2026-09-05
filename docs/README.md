# zyvor-fabric Documentation

Private cloud control plane driving VM lifecycle over FluxVM's REST API — no libvirt, no systemd dependency for VM lifecycle itself.

## Start here

| Goal | Document |
|------|----------|
| **Product README** | [README.md](../README.md) |
| **Kubernetes** (DaemonSets, Helm, lab deploy) | [KUBERNETES.md](KUBERNETES.md) |
| **Docker / Podman** | [DOCKER.md](DOCKER.md) |
| **Quick start** (dev build) | [QUICKSTART.md](../QUICKSTART.md) |
| **Web UX** (marketing + `/app` console) | [web-ui.md](web-ui.md) · [ux.md](ux.md) |
| **User journeys & acceptance criteria** | [USER_STORIES.md](USER_STORIES.md) |
| **FluxVM VM driver** — config, capability matrix, gaps | [guides/vm-drivers/fluxvm.md](guides/vm-drivers/fluxvm.md) |
| **Enterprise identity** (SCIM 2.0) | [scim-identity.md](scim-identity.md) |
| **Host maintenance evacuation** | [host-lifecycle.md](host-lifecycle.md) |
| Customer page index | [customer/PAGE_INDEX.md](customer/PAGE_INDEX.md) |
| Full documentation catalog | [index.md](index.md) |

## Deploy cheatsheet

| Mode | Command | Docs |
|------|---------|------|
| Bare metal remote | `./scripts/deploy remote USER@HOST` | [README](../README.md#deploy) |
| Kubernetes lab | `./scripts/deploy k8s USER@HOST` | [KUBERNETES.md](KUBERNETES.md) |
| Kubernetes local | `make k8s-deploy` | [KUBERNETES.md](KUBERNETES.md) |
| Helm | `helm upgrade --install … ./charts/zyvor-fabric` | [KUBERNETES.md](KUBERNETES.md#c-helm) |
| Docker / Podman | `make docker-up` | [DOCKER.md](DOCKER.md) |
| Operator (CRDs) | `operator/charts/zyvor-fabricd-operator` | [operator/README.md](../operator/README.md) |

Lab K8s ports: **30095** (NodePort UI/API), **9095** (hostNetwork), **7788** (FluxVM localhost).

## User stories

Persona-based journeys with acceptance criteria: **[USER_STORIES.md](USER_STORIES.md)**

| Persona | Focus |
|---------|-------|
| Alex (Private Cloud Admin) | VM lifecycle via the FluxVM driver |
| Morgan (Platform Engineer) | K8s operator, Helm, Terraform |
| Jordan (Developer) | CLI/API for VM operations |

## Ecosystem

Part of the [Zyvor platform stack](https://zyvor.dev):

| Product | Role |
|---------|------|
| **FluxVM** | Disposable-VM engine — Fabric's VM backend |
| **GuestKit** | Offline VM disk assurance / customization |
| **Axiom** | k8s-native private cloud control plane |
| **Ragnarok** | AI-powered KubeVirt VM management |
| **hypercluster** | Kubernetes bootstrap |
| **machina** | Bare-metal hypervisor OS |
| **hermes** | Application layer for K8s |
| **forge** | AI infrastructure on K8s |
| **packetwolf** | Network intelligence |

See also: [../README.md](../README.md)
