# Fabric on Kubernetes

Run **Zyvor Fabric** (control plane + FluxVM) as in-cluster workloads — the same packaging UX as [Ragnarok](https://github.com/zyvorai/ragnarok) (manifests, Helm, remote `ctr import`), adapted for Fabric’s privilege model.

> Fabric is **not** a restricted Deployment app. It needs `hostNetwork`, KVM, and host networking privileges — the same reasons [docker-compose.yml](../docker-compose.yml) uses `network_mode: host` and `/dev/kvm`.

This guide covers **running fabricd + FluxVM on Kubernetes**. The separate [operator](../operator/) installs a controller that reconciles `VirtualMachine` CRs against an **already-running** fabricd API.

---

## Architecture

```text
┌─ node (privileged PSS namespace: zyvor-fabric) ─────────────────────┐
│                                                                     │
│  DaemonSet fluxvm          hostNetwork · /dev/kvm · :7788           │
│       ▲                                                             │
│       │ REST 127.0.0.1:7788                                         │
│  DaemonSet zyvor-fabricd   hostNetwork · nftables · :9095           │
│       ▲                                                             │
│       │ NodePort 30095  (also host :9095)                           │
│  Service zyvor-fabricd                                              │
└─────────────────────────────────────────────────────────────────────┘
```

| Component | Kind | Why |
|-----------|------|-----|
| `zyvor-fabricd` | DaemonSet, `hostNetwork` | nftables/rtnetlink on the real host; reach FluxVM on loopback |
| `fluxvm` | DaemonSet, `hostNetwork`, privileged | KVM + cgroup/netns like compose |
| Service | NodePort **30095** → 9095 | Lab UI/API (avoids Ragnarok 30061/30062) |
| Secret | `zyvor-fabric-secrets` | `admin-username`, `admin-password`, `jwt-secret` (K8s Secret — not systemd files) |

Web UI is **baked into** the `zyvor-fabricd` image (no separate frontend pod).

---

## Requirements

- Kubernetes node(s) with **`/dev/kvm`**
- Namespace with Pod Security **privileged** (enforced in `k8s/base/namespace.yaml`)
- Rootful **podman** or **docker** on the machine that builds images
- `kubectl` access to the cluster
- For FluxVM image builds: sibling checkouts `../FluxVM` and `../guestkit` (or set `FLUXVM_DIR` / `GUESTKIT_DIR`)

---

## Quick paths

### A. Remote lab on k3s (recommended)

From your laptop (build happens on the server):

```bash
# Full: rsync → build images → k3s ctr import → apply → smoke
./scripts/deploy k8s sus@HOST

# Re-apply manifests / rollout only
./scripts/deploy k8s sus@HOST --quick

# Tear down
./scripts/deploy k8s sus@HOST --uninstall
```

Equivalents:

```bash
./scripts/deploy-k8s-remote.sh sus@HOST
./scripts/deploy-k8s-all-remote.sh sus@HOST --quick
```

After success:

| URL | Notes |
|-----|--------|
| `http://HOST:30095/` | NodePort (UI + API) |
| `http://HOST:9095/` | hostNetwork bind |
| `http://HOST:30095/health` | Liveness smoke |

Admin login for **new** Kubernetes deployments (from Secret):

| Field | Default |
|-------|---------|
| Username | `admin` |
| Password | `Admin@321` |

Override with `FABRIC_ADMIN_PASSWORD` / `FABRIC_ADMIN_USERNAME`, or:

```bash
./scripts/k8s-set-admin-secret.sh --apply --restart
```

### B. Local kubectl

```bash
# Images already in the cluster runtime
make k8s-deploy

# Build first (needs FluxVM/guestkit siblings for full stack)
BUILD_IMAGES=true ./scripts/deploy-k8s.sh
```

Creates namespace, ConfigMap, secret (if missing), both DaemonSets, and the NodePort Service.

```bash
make k8s-undeploy    # delete namespace zyvor-fabric
```

### C. Helm

```bash
make helm-lint
make helm-template

helm upgrade --install zyvor-fabric ./charts/zyvor-fabric \
  --namespace zyvor-fabric --create-namespace \
  --set security.adminUsername=admin \
  --set security.adminPassword='Admin@321' \
  --set security.jwtSecret="$(openssl rand -base64 32)" \
  --set fabricd.image.tag=local \
  --set fluxvm.image.tag=local
```

Useful values (see [charts/zyvor-fabric/values.yaml](../charts/zyvor-fabric/values.yaml)):

| Value | Default | Purpose |
|-------|---------|---------|
| `fabricd.image.repository` / `tag` | `zyvor-fabricd` / `local` | Control-plane image |
| `fluxvm.image.repository` / `tag` | `zyvor-fabric-fluxvm` / `local` | FluxVM image |
| `fabricd.service.nodePort` | `30095` | Lab NodePort |
| `fabricd.hostPath` | `/var/lib/zyvor-fabricd` | Persistent data on node |
| `security.adminUsername` | `admin` | Seeded admin username |
| `security.adminPassword` | `Admin@321` | Seeded admin password (Secret) |
| `security.existingSecret` | `""` | Use a pre-created Secret instead |

---

## Credentials (Kubernetes Secret)

Fabric on Kubernetes **does not** use systemd’s `/var/lib/zyvor-fabricd/.admin_password` file.
The DaemonSet reads credentials from Secret `zyvor-fabric-secrets`:

| Key | Default (new deploy) |
|-----|----------------------|
| `admin-username` | `admin` |
| `admin-password` | `Admin@321` |
| `jwt-secret` | lab placeholder / random on first create |

```bash
# Apply / replace secret
./scripts/k8s-set-admin-secret.sh --apply --restart

# Or from manifests
kubectl apply -f k8s/base/secret.yaml

# Inspect (base64)
kubectl -n zyvor-fabric get secret zyvor-fabric-secrets -o jsonpath='{.data.admin-username}' | base64 -d; echo
```

Password is seeded into `auth.db` only when the DB has **no users**. After changing the
Secret password in lab, wipe the hostPath DB then restart:

```bash
sudo rm -f /var/lib/zyvor-fabricd/auth.db
kubectl -n zyvor-fabric rollout restart daemonset/zyvor-fabricd
```

---

## Environment variables (remote deploy)

| Variable | Purpose |
|----------|---------|
| `FABRIC_ADMIN_PASSWORD` | Admin password for Secret (default **Admin@321**) |
| `FABRIC_ADMIN_USERNAME` | Admin username for Secret (default **admin**) |
| `FORCE_SECRET=1` | Recreate `zyvor-fabric-secrets` on deploy |
| `FABRIC_SKIP_FLUXVM=1` | Skip FluxVM image sync/DaemonSet |
| `FLUXVM_DIR` / `GUESTKIT_DIR` | Paths to siblings for image build |
| `IMAGE_TAG` | Image tag (default `local`) |
| `DEPLOY_HOST` / `DEPLOY_USER` | Defaults for host/user |
| `NODE_PORT` | Override NodePort smoke check (default `30095`) |

---

## Verify

```bash
kubectl -n zyvor-fabric get pods,svc,ds
kubectl -n zyvor-fabric logs -l app=zyvor-fabricd --tail=50

curl -sf http://NODE_IP:30095/health
# Login
curl -sf -X POST http://NODE_IP:30095/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
```

On the node, FluxVM should answer:

```bash
curl -sf http://127.0.0.1:7788/v1/vms
```

---

## Platform chart vs operator

| Install | Location | Role |
|---------|----------|------|
| **Platform** | `k8s/base/`, `charts/zyvor-fabric` | Runs fabricd + FluxVM |
| **Operator** | `operator/charts/zyvor-fabricd-operator` | CRD → Fabric REST API |

Operator env:

```text
ZYVOR_FABRICD_URL=http://NODE_IP:30095
# same node: http://127.0.0.1:9095
```

`http://zyvor-fabricd.zyvor-fabric.svc:9095` is **not** a reliable cross-node address when pods use `hostNetwork`. Prefer NodePort or the node IP.

---

## Privilege model

Both DaemonSets use:

- `hostNetwork: true`
- `privileged: true` (plus capability list matching compose)
- `hostPath` for `/var/lib/zyvor-fabricd`, `/var/lib/fluxvm`, `/run/fluxvm`, `/run/netns`, `/dev/kvm`

Do **not** enforce restricted PSS on `zyvor-fabric`.

---

## Relation to other deploy modes

| Mode | Entry | When |
|------|--------|------|
| systemd bare metal | `./scripts/deploy remote USER@HOST` | Production hosts without K8s |
| Docker / Podman | `make docker-up` · [DOCKER.md](DOCKER.md) | Local eval |
| **Kubernetes** | `./scripts/deploy k8s …` · Helm | Lab k3s / in-cluster control plane |
| Operator only | `operator/charts/…` | GitOps VMs against existing fabricd |

---

## Layout

```text
k8s/base/
  namespace.yaml
  secret.yaml.example
  fabricd-configmap.yaml
  fluxvm-daemonset.yaml
  fabricd-daemonset.yaml
  fabricd-service.yaml
charts/zyvor-fabric/
  Chart.yaml
  values.yaml
  templates/
scripts/deploy-k8s.sh
scripts/deploy-k8s-remote.sh
scripts/deploy-k8s-all-remote.sh
```

Makefile targets: `k8s-deploy`, `k8s-undeploy`, `helm-lint`, `helm-template`.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `fluxvm` CrashLoop / ImagePullBackOff | Image imported? `/dev/kvm` present? Build with FluxVM+guestkit siblings |
| `fabricd` can't reach FluxVM | Both must be `hostNetwork` on the **same** node; URL `http://127.0.0.1:7788` |
| Health 000 on NodePort | `kubectl -n zyvor-fabric get svc,pods -o wide`; try host `:9095` |
| PSS / admission errors | Namespace must be privileged |
| Port clash with Ragnarok | Fabric uses **30095**; Ragnarok uses 30061/30062 |

---

## See also

- [README.md](../README.md) — product overview and all deploy options
- [DOCKER.md](DOCKER.md) — container eval prerequisites
- [operator/README.md](../operator/README.md) — VirtualMachine CRDs
- [guides/vm-drivers/fluxvm.md](guides/vm-drivers/fluxvm.md) — FluxVM driver details
