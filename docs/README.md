# zyvor-fabric Documentation

Private cloud control plane driving VM lifecycle over FluxVM's REST API -- no libvirt, no systemd dependency for VM lifecycle itself

## Start Here

| Goal | Document |
|------|----------|
| Main README | [README.md](../README.md) |
| **Docker / Podman** | [DOCKER.md](DOCKER.md) |
| **Web UX** (marketing + `/app` console) | [web-ui.md](web-ui.md) · [ux.md](ux.md) |
| **User journeys & acceptance criteria** | [User Stories](USER_STORIES.md) |
| **FluxVM VM driver** — config, capability matrix, known gaps | [guides/vm-drivers/fluxvm.md](guides/vm-drivers/fluxvm.md) |
| **Enterprise identity** (SCIM 2.0 provisioning) | [scim-identity.md](scim-identity.md) |
| **Host maintenance evacuation** | [host-lifecycle.md](host-lifecycle.md) |
| Customer page index | [customer/PAGE_INDEX.md](customer/PAGE_INDEX.md) |
| Full documentation index | [index.md](index.md) |

## User Stories

Persona-based journeys with acceptance criteria: **[USER_STORIES.md](USER_STORIES.md)**

| Persona | Focus |
|---------|-------|
| Alex (Private Cloud Admin) | VM lifecycle via the FluxVM driver |
| Morgan (Platform Engineer) | K8s operator and Terraform |
| Jordan (Developer) | CLI/API for VM operations |

## Ecosystem

Part of the [Zyvor / HyperSDK platform stack](https://zyvor.dev):

| Product | Role |
|---------|------|
| **hypercluster** | Kubernetes bootstrap |
| **machina** | Bare-metal hypervisor OS |
| **zeus-os (v9s)** | Cloud / KubeVirt control plane |
| **forge** | AI infrastructure on K8s |
| **hypersdk / hyper2kvm** | VM migration |
| **fluxvm** | Disposable-VM control plane — optional VM driver backend (see [above](guides/vm-drivers/fluxvm.md)) |
| **guestkit** | Offline VM assurance |
| **packetwolf** | Network intelligence |
| **Axiom** | k8s-native private cloud control plane |
| **hermes** | Application layer for K8s |

See also: [../README.md](../README.md)
