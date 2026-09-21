# Fabric AI Workloads (preview)

OpenAI-compatible inference on dedicated NVIDIA GPU VMs, operated through
Fabric’s API, CLI, and console. Maglev load-balances backends with
control-plane weight updates. Autoscaling, API keys, multi-site preference,
and Agent Runtime fabric providers are included through Phase 6.

## Maturity

| Capability | Status |
|---|---|
| Service Fabric Maglev | GA |
| Fabric AI Workloads Phases 0–6 | **Preview** |
| Revisioned rollouts, model jobs, gateway limits | **Preview 2** |
| Multi-node GPU scheduler | **Preview** |
| Multi-site federation, explain, policy, backup, vLLM-only runtime | **Preview** |
| In-tree `flux-vm` multi-vCPU | Experimental until `scripts/test-kvm-smp-boot.sh` is green on lab hardware |
| Machina local LLM | Separate roadmap product — not Fabric |

## First release shape

- One NVIDIA GPU per QEMU VM (dedicated VFIO passthrough)
- Runtime: **vLLM** only
- Model source: `hf://org/name` or a pre-staged host path. A model job passes the stored Hugging Face `revision` to the downloader and keeps bytes under `{state}/ai-models` by digest. Checksums for a directory are a sorted manifest (relative path, size, SHA-256), not the first file.
- Endpoint: Maglev VIP → guest `:8000` (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`)
- Readiness: Fabric HTTP `GET /health` before Maglev `Ready`
- Manual + automatic replica scaling; drain on delete / maintenance
- Bridged tap NICs (Maglev does not attach to bridge-less direct taps)

## Resources

| Resource | Purpose | Janus / Zynera cousin |
|---|---|---|
| `ModelArtifact` | Model identity + host cache path + residency/license | `FabricAIJob.spec.model` |
| `InferenceProfile` | Runtime + GPU/CPU/network shape | job GPU request + calibrated profile |
| `InferenceDeployment` | Desired replicas + autoscaling + rollout | `FabricAIJob` with `type: inference` |
| `InferenceEndpoint` | OpenAI Maglev frontend + site/residency | Service / VIP |
| `InferenceApiKey` | Scoped endpoint keys (hashed at rest) | — |
| `GET /api/ai/gpus` | Inventory + allocation | `FabricGpuNode` |
| Quota `max_gpus` | Tenant GPU cap | `FabricQuota.spec.gpuQuota.maxGPUs` |

[Zyvor Janus](https://github.com/hypersdk/zyvor-janus) simulates these shapes
without physical GPUs. Use Janus for scheduling policy experiments; use Fabric
for the live dataplane.

## REST

```text
GET/POST   /api/ai/models
GET/DELETE /api/ai/models/{name}
GET/POST   /api/ai/profiles
GET/DELETE /api/ai/profiles/{name}
GET/POST   /api/ai/deployments
GET/DELETE /api/ai/deployments/{name}
POST       /api/ai/deployments/{name}/scale
PUT        /api/ai/deployments/{name}/autoscaling
POST       /api/ai/deployments/{name}/drain
POST       /api/ai/deployments/{name}/rollout
POST       /api/ai/deployments/{name}/rollouts
POST       /api/ai/deployments/{name}/rollouts/{id}/pause|resume|promote|rollback
GET/POST   /api/ai/deployments/{name}/revisions
GET        /api/ai/deployments/{name}/revisions/{revision}
GET        /api/ai/deployments/{name}/metrics
GET/POST   /api/ai/endpoints
GET/DELETE /api/ai/endpoints/{name}
GET/POST   /api/ai/keys
DELETE     /api/ai/keys/{id}
GET        /api/ai/gpus
GET/POST   /api/ai/nodes
GET        /api/ai/nodes/{id}
POST       /api/ai/nodes/{id}/heartbeat
GET/POST   /api/ai/sites
GET        /api/ai/sites/{id}
GET        /api/ai/explain/placement/{deployment}
POST       /api/ai/policies
POST       /api/ai/backup
POST       /api/ai/restore
GET        /api/ai/capacity
GET        /api/ai/events
GET        /api/ai/model-jobs
POST       /api/ai/models/{name}/materialize
GET        /api/ai/models/{name}/status
ANY        /api/ai/openai/{endpoint}[/{path}]   # API-key OpenAI gateway (no JWT)
```

## CLI

```bash
zyvorctl ai model add qwen3-8b --source hf://Qwen/Qwen3-8B
zyvorctl ai profile add edge-24g --gpu 1 --vram 24 --cpu 8 --memory 32
zyvorctl ai deploy qwen3-8b --profile edge-24g --replicas 2
zyvorctl ai endpoint expose qwen3-8b --openai-compatible --routing least_queue
zyvorctl ai deployment scale qwen3-8b --replicas 4
zyvorctl ai deployment autoscale qwen3-8b --enable --min 1 --max 4
zyvorctl ai deployment drain qwen3-8b
zyvorctl ai deployment rollout qwen3-8b --strategy canary --canary-percent 10
zyvorctl ai key create edge-key --endpoint qwen3-8b-openai
zyvorctl ai capacity
zyvorctl ai gpus
```

## OpenAI gateway

Point clients at Fabric (not the Maglev VIP directly) when you need API-key
auth and request quotas:

```bash
export OPENAI_BASE_URL=https://fabric.example:9095/api/ai/openai/qwen3-8b-openai
export OPENAI_API_KEY=fvai_…   # from zyvorctl ai key create
curl -sk "$OPENAI_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"model":"qwen3-8b","messages":[{"role":"user","content":"hi"}]}'
```

The gateway validates the key (prefix lookup plus a constant-time HMAC compare,
endpoint scope, and optional model scope), reserves one lifetime request under
a per-key lock, then proxies to the Maglev VIP or a ready replica. The upstream
body is streamed (`text/event-stream` and other non-hop headers are preserved).
There is no fixed total timeout; the idle timeout between chunks defaults to
60 seconds (`FLUXVM_AI_GATEWAY_IDLE_SECS`). Dropping the client cancels the
upstream request. An audit row is written as `ATTEMPT`, then `SUCCESS` or
`FAILED`. Maglev itself remains L4 and does not see API keys.

Under `FLUXVM_AI_DRY_RUN=1` the gateway returns a synthetic chat completion
after accepting the key. A JSON body with `"stream": true` returns two SSE
chunks instead of one buffered completion.

## Phase map

| Phase | What shipped |
|---|---|
| 0–1 | GPU inventory/bind, Model/Profile/Deployment/Endpoint, Maglev equal weight, CLI/console |
| 2 | AI-aware Maglev weights from vLLM `/metrics` (`least_queue`, `lowest_ttft`, …) |
| 3 | Queue/TTFT autoscaler, drain, rolling/canary/blue-green rollout + rollback thresholds |
| 4 | Endpoint API keys, checksum enforcement, residency/license on models, revision audit |
| 5 | `site_local` / `cost_optimized` / `energy_optimized` routing, preferred/allowed sites |
| 6 | Agent Runtime `kind: fabric` credentials + `ZYVOR_FABRIC_INFERENCE_BASE` shim |
| Harden | OpenAI API-key gateway, `/ai/capacity` + `/ai/events`, console keys/autoscale, golden-image bake script |
| GitOps | Terraform `zyvor-fabricd_{model_artifact,inference_profile,inference_deployment,inference_endpoint}` + operator `ModelArtifact` / `InferenceDeployment` CRDs |
| Correctness | Exclusive GPU/VIP create, health replacement after three failures, Maglev-before-VIP delete, CIDR network/broadcast skipped, bounded reconcile retry. Still **Preview** |

## Terraform

```hcl
resource "zyvor-fabricd_model_artifact" "qwen" {
  name   = "qwen3-8b"
  source = "hf://Qwen/Qwen3-8B"
  format = "safetensors"
}

resource "zyvor-fabricd_inference_profile" "edge" {
  name             = "edge-24g"
  minimum_vram_gib = 24
  cpu              = 8
  memory_gib       = 32
}

resource "zyvor-fabricd_inference_deployment" "qwen" {
  name     = "qwen3-8b"
  model    = zyvor-fabricd_model_artifact.qwen.name
  profile  = zyvor-fabricd_inference_profile.edge.name
  replicas = 2
}

resource "zyvor-fabricd_inference_endpoint" "qwen" {
  name       = "qwen3-8b-openai"
  deployment = zyvor-fabricd_inference_deployment.qwen.name
}
```

See `terraform-provider/examples/ai-workloads/`.

## Kubernetes operator

```bash
kubectl apply -f operator/examples/ai-inference-deployment.yaml
# CRDs: ModelArtifact, InferenceDeployment (zyvor-fabricd.io/v1alpha1)
# Create InferenceProfile via zyvorctl or Terraform before the Deployment CR.
```

## AI-aware Maglev routing (Phase 2+)

Fabric periodically scrapes each ready replica’s vLLM Prometheus
`/metrics` and updates Maglev backend weights (1–32). The eBPF program
never sees models or tokens — only weights.

| Strategy | Behaviour |
|---|---|
| `equal` | Weight 1 for every ready backend |
| `least_queue` | Higher weight when `num_requests_waiting` is low |
| `lowest_ttft` | Higher weight when observed TTFT is low |
| `most_free_vram` | Higher weight when GPU/KV-cache usage is low |
| `weighted_capacity` | Average of queue + free-VRAM scores |
| `site_local` | Prefer replicas tagged with the endpoint preferred site |
| `cost_optimized` | Prefer lower `cost_tier` replicas |
| `energy_optimized` | Prefer lower GPU-cache pressure |

A replica is eligible for Maglev only when it is ready, not draining, and its
last scrape is younger than 30 seconds. A failed scrape or a missing
`scraped_at` is omitted. Zeros from a failed scrape are not treated as idle.

Background tasks: `ai_routing_controller` (10s), `ai_autoscaler` (15s),
`ai_reconcile_controller` (15s). Under `FLUXVM_AI_DRY_RUN=1` synthetic metrics
still diverge Maglev weights.

Endpoint VIPs are allocated from a pool that uses Rivora AddressPool syntax
(CIDR, `start-end` range, or a single IPv4 address). Set
`FLUXVM_AI_ADDRESS_POOL` (comma-separated) or `FLUXVM_AI_SERVICE_CIDR`
(default `10.96.0.0/16`). `FLUXVM_AI_AVOID_BUGGY_IPS` defaults on and skips
addresses whose last octet is 0 or 255. For a prefix of /30 or wider, the
network and broadcast addresses are also skipped (`10.96.0.0/30` yields only
`.1` and `.2`). Each address is inserted with `create_new`, so two fabricd
processes cannot take the same VIP. The address is released when Maglev is
absent, including a delete that returns 404. If Maglev is still present, or
FluxVM cannot be reached, the endpoint stays `Deleting` and the VIP is kept. Prefixes larger than /16, and IPv6, stay on the
Rivora controller.

## Autoscaling and rollouts (Preview 2)

Creating a deployment writes revision 1 and one replica set. `status.replicas` stays the union of every replica set, so the gateway and console keep reading one list. A rollout is a stored record (`strategy`, `from_revision`, `to_revision`, `max_surge`, `max_unavailable`, `phase`) advanced by the 15-second reconciler under the deployment lease. A restart continues that phase instead of starting over.

Rolling update adds one new-revision replica, bounded by `max_surge`, waits until it has been ready for the minimum healthy duration, gives it Maglev weight, then drains one old replica, bounded by `max_unavailable`. A failed new replica does not remove the last ready replica of the previous revision. When every replica is on the new revision, the old revision is `Superseded`.

Canary uses a separate replica set and the steps 5% / 300s, 20% / 600s, 50% / 900s, and 100%. Maglev weight is the step weight on the new revision versus the old one. The rollout pauses when the mean error rate or time-to-first-token exceeds the rollback thresholds. `pause`, `resume`, `promote`, and `rollback` continue, finish, or restore the previous revision. Rollback sets the previous revision back to `Active`, restores its Maglev weights, and stops the new set. It does not delete the last healthy old replica.

Blue/green builds the full new replica set, then switches weights in one save. The old set stays until the rollback window ends.

Maturity stays **Preview**. Phases 11–17 below are records and gates, not a production cloud.

## Multi-node scheduler (Phase 10)

Register hosts with `POST /api/ai/nodes`. Each node reports site, failure domain, GPUs, free CPU and memory, cached models, and taints. `POST /api/ai/nodes/{id}/heartbeat` refreshes it. A heartbeat older than 60 seconds marks the node offline for scheduling.

Placement is filter then score: ready state, no taints, residency, free NVIDIA VRAM, then cache hit, preferred site, and failure-domain spread. The same inputs pick the same node. When no nodes are registered, replicas still land on the local FluxVM inventory. A chosen GPU that this FluxVM process does not have is not started here. A replica on an offline node is replaced only when another ready node exists, so the last healthy replica is kept when nothing else can take it.

MIG, NVLink topology, and a per-node agent are not in this slice. An unhealthy GPU or a MIG slice that does not match the request is not scheduled.

## Sites, policy, and the rest of the roadmap (Phases 11–17)

`POST /api/ai/sites` records a site. Routing spills from a saturated preferred site only to `failover_sites`, and never to a site outside `residency`. `minimum_sites` and `max_replicas_per_site` are enforced by the scheduler. A disconnected site may keep serving a snapshot until `fail_closed_unix` (`edge_may_serve`).

`GET /api/ai/explain/placement/{deployment}` returns the chosen node and why the others were rejected. `POST /api/ai/policies` is a tenant allow-list for model name and source prefix; no policy means the existing tenant filter still applies. `POST /api/ai/backup` and `POST /api/ai/restore` copy desired-state JSON, not model bytes.

Chargeback is `gpu_seconds` and `token_charge` on recorded usage. The only launchable runtime is vLLM; TensorRT-LLM, Triton, and llama.cpp fail closed. This is not Beta or GA: there is no three-node consensus, OIDC, MIG reconfiguration, Kubernetes admission webhooks, or a second inference runtime.

```text
Scale out when:
  queue_depth > scale_out_queue for scale_out_seconds
  OR mean TTFT > scale_out_ttft_ms
  AND replicas < max_replicas

Scale in when:
  queue_depth < scale_in_queue for scale_in_seconds
  AND replicas > min_replicas (or 0 if scale_to_zero)
  AND every ready replica has fresh metrics
```

Scale-out uses the same quota check as a manual scale. If that check fails, or
if scale-in is skipped because metrics are missing or stale, the decision is
recorded on `deployment.status.message` and the replica count is left unchanged.

```bash
zyvorctl ai deployment autoscale qwen3-8b --enable --min 1 --max 4 \
  --scale-out-queue 20 --scale-out-seconds 30
zyvorctl ai deployment drain qwen3-8b --grace-seconds 30
zyvorctl ai deployment rollout qwen3-8b --strategy canary --canary-percent 10
```

## Reconciliation

`ai_reconcile_controller` runs every 15 seconds and reconciles up to four
deployments at once. Create, scale, the autoscaler, and that loop take a
per-deployment lock, then a file lease (owner, fencing token, expiry) on the
state directory. That lease is not an etcd lock: two fabricd processes on
different hosts still need a shared transactional store. Each replica stores
`replica_id` and `ordinal`. A new replica takes the first unused ordinal, not
`replicas.len()`, so replacing one replica cannot collide with another.
Restart reloads that identity. A GPU or VIP file is
created with `create_new` before use. An empty or partial file is kept until
FluxVM shows the GPU or VIP is idle; if the device is still active the file is
rewritten, not deleted. A reservation that is not yet attached expires; once the VM or
endpoint exists it is pinned. The reservation is removed only after a
successful `release_host_gpu` (or a bind that never happened). A disappeared
VM is released the same way. Each tick probes `GET /health`, including replicas
that are already ready. Three consecutive failures clear ready, release the
GPU, delete the VM, and let scale-up replace it. Endpoint delete releases the
VIP when Maglev is absent, including a DELETE that returns 404. FluxVM
connection and timeout errors, and a lease held by another process, leave the
deployment `Pending`. A missing profile or model is `Failed`. Startup is the
first tick. The sweep removes reservations and Fabric-managed VMs whose
deployment is gone, and Maglev services that Fabric recorded for an endpoint
that no longer exists. It does not delete unrelated FluxVM services. Maturity
stays **Preview**.

## Security (Phase 4)

- Per-tenant model / endpoint scoping (existing RBAC + tenant filters)
- `POST /api/ai/keys` — HMAC-SHA256 with `FLUXVM_AI_KEY_HMAC_SECRET` (a preview default is used when unset). Plaintext is returned once. `GET /api/ai/keys` does not include `secret_hash`
- Lifetime `request_quota`, plus optional per-key `tokens_per_minute` and `max_concurrent`. The gateway updates the key file under the same exclusive lock as the lifetime quota. In-flight count drops when the client cancels or the upstream stream ends. If the upstream usage object is missing, the request's `max_tokens` is the token count (or 1). Distributed counters across nodes are not in this slice
- `require_checksum` on ModelArtifact rejects unverified materialization. A directory checksum is the SHA-256 of a sorted manifest (`relative-path size sha256`), not the first file
- Model paths are canonicalized and must stay under `FLUXVM_AI_MODEL_DIR` or `{state}/ai-models`
- `license` + `residency` metadata on models; residency copied to deployments. When an endpoint sets `residency`, replicas with no `site` are excluded
- `InferenceProfile.gpu.count` must be 1
- Deployment revision 1 is written at create. Later revisions and replica sets are the rollout record described above
- HF tokens stay on the host (`HF_TOKEN`); never baked into guest images. Model jobs run outside the HTTP request: `Registered`, `Resolving`, `Downloading`, `Verifying`, `Ready`, or `Failed` with a durable message and retry count. A second job for the same digest joins the first. A partial file is resumed. The job is refused when free disk is below the declared size. `GET /api/ai/model-jobs` and `GET /api/ai/models/{name}/status` report that state. `POST /api/ai/models/{name}/materialize` only records a job

## Multi-site (Phase 5)

Tag replicas with `FLUXVM_AI_SITE` (or deployment `preferred_site`). Endpoints
may set `preferred_site`, `allowed_sites`, and `residency`. Routing strategy
`site_local` biases Maglev weights toward the preferred site and never
includes backends outside `residency` / `allowed_sites`. A replica with no
`site` is excluded when `residency` or `allowed_sites` is set.

## Agent Runtime convergence (Phase 6)

Agents can call Fabric-managed inference without an external provider key:

```json
"fabric-qwen3-8b": {
  "kind": "fabric",
  "host": "10.96.0.50",
  "header": "authorization",
  "prefix": "Bearer ",
  "allowed_ports": [8000],
  "path_prefixes": ["/v1/"]
}
```

Set `ZYVOR_FABRIC_INFERENCE_BASE=http://10.96.0.50:8000` in the guest harness
so OpenAI-compatible CLIs hit the Maglev VIP through the egress broker.
Optional `FABRIC_AI_API_KEY` injects an endpoint key created via
`zyvorctl ai key create`.

## Golden image runbook

CUDA and vLLM are **not** installed at boot via `apt`. Bake them into a qcow2.

Helper (needs `virt-customize` / libguestfs-tools on a GPU host):

```bash
./scripts/bake-ai-vllm-image.sh \
  /var/lib/libvirt/images/ubuntu-24.04-cloud.qcow2 \
  /var/lib/zyvor-fabricd/images/vllm-cuda.qcow2
# then: FLUXVM_AI_IMAGE=/var/lib/zyvor-fabricd/images/vllm-cuda.qcow2
```

Manual path:

1. Start from an Ubuntu cloud image with NVIDIA driver + CUDA matching the host.
2. Install vLLM into a venv (or system path) and verify `vllm serve --help`.
3. Install the FluxVM guest agent.
4. Snapshot as `/var/lib/zyvor-fabricd/images/vllm-cuda.qcow2`.
5. Set `FLUXVM_AI_IMAGE` to that path on the fabricd host.

Cloud-init only writes `/etc/systemd/system/vllm.service` pointing at the
mounted model directory (`/models`) and starts it.

### Model materialization

- Public Hugging Face: Fabric downloads on the host, verifies checksum, bind-mounts into the guest.
- Private: read `HF_TOKEN` from the **host** environment (same boundary as the Agent Runtime credential broker). Never bake the token into the image.
- Offline / lab: set `FLUXVM_AI_MODEL_DIR=/path/to/weights` so create skips the download.

### GPU-less smoke

Set `FLUXVM_AI_DRY_RUN=1` on fabricd to exercise REST/CLI without bind/create.
Deployments report `DryRun` with synthetic replicas. CI and lab smoke use this
mode. For full scheduling simulation without hardware, run Janus against a
`FabricAIJob` export.

## FluxVM prerequisites

```bash
# On the GPU host
curl -sS http://127.0.0.1:7788/v1/host/gpus/preflight | jq
# Bind only when placing (Fabric reconciler does this):
# POST /v1/host/gpus/bind  {"bdf":"0000:01:00.0","vram_gib":24}
```

Hardware gate: `fluxvm/scripts/test-gpu-passthrough-lifecycle.sh`.

## Console

`/app/ai` — Models, Deployments, Endpoints, API keys, GPUs. Capacity strip shows
free/total GPUs; deployments show autoscale bounds and Maglev weights; endpoints
show the `/api/ai/openai/{name}` gateway path.

## CI

GitHub Actions workflow `.github/workflows/ai-workloads.yml` runs unit tests for
routing, autoscaling, rollouts, API keys, gateway quota math, and capacity helpers
on every PR that touches AI paths. The dry-run smoke job builds
`zyvor-fabricd` from `backend/Cargo.toml`, restarts fabricd twice and checks that
the deployment phase and replica ids are unchanged, and requires a streaming
deployment phase is unchanged, and requires a streaming chat to return two SSE
chunks (`data:` then `[DONE]`). On failure it uploads `fabricd.log`. Lab smoke
is the same script: `scripts/smoke-ai-workloads-phases.sh`.
