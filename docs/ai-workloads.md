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
| In-tree `flux-vm` multi-vCPU | Experimental until `scripts/test-kvm-smp-boot.sh` is green on lab hardware |
| Machina local LLM | Separate roadmap product — not Fabric |

## First release shape

- One NVIDIA GPU per QEMU VM (dedicated VFIO passthrough)
- Runtime: **vLLM** only
- Model source: `hf://org/name` or a pre-staged host path. `revision` is stored on the artifact and is not yet passed to the downloader. Checksums for a directory are a sorted manifest (relative path, size, SHA-256), not the first file.
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
GET        /api/ai/deployments/{name}/metrics
GET/POST   /api/ai/endpoints
GET/DELETE /api/ai/endpoints/{name}
GET/POST   /api/ai/keys
DELETE     /api/ai/keys/{id}
GET        /api/ai/gpus
GET        /api/ai/capacity
GET        /api/ai/events
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
| Correctness | Durable reconciler, streaming gateway, Rivora-style VIP pool, key/path/quota hardening. Still **Preview** |

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
addresses whose last octet is 0 or 255. Allocations are stored and released
when the endpoint is deleted. Prefixes larger than /16, and IPv6, stay on the
Rivora controller.

## Autoscaling and rollouts (Phase 3)

Rollouts are **experimental scaffolding**. The API stores a strategy and bumps `revision`, but there is no revision identity and no promotion or rollback controller. Maturity stays **Preview**.

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

`ai_reconcile_controller` runs every 15 seconds. Create, scale, the autoscaler,
and that loop take a per-deployment lock. Each tick compares the desired
replica count with recorded VMs, retries guest IP and `GET /health`, recreates
missing replicas, and releases GPU reservations whose VM is gone. A reservation
(`bdf`, deployment, VM name) is persisted before `bind_host_gpu`. Placement
skips those BDFs. Startup is the first tick. The sweep removes reservations
and Fabric-managed VMs whose deployment is gone, and Maglev services that
Fabric recorded for an endpoint that no longer exists. It does not delete
unrelated FluxVM services.

## Security (Phase 4)

- Per-tenant model / endpoint scoping (existing RBAC + tenant filters)
- `POST /api/ai/keys` — HMAC-SHA256 with `FLUXVM_AI_KEY_HMAC_SECRET` (a preview default is used when unset). Plaintext is returned once. `GET /api/ai/keys` does not include `secret_hash`
- Lifetime `request_quota` only. Requests per minute, tokens, and concurrency limits are not enforced yet
- `require_checksum` on ModelArtifact rejects unverified materialization. A directory checksum is the SHA-256 of a sorted manifest (`relative-path size sha256`), not the first file
- Model paths are canonicalized and must stay under `FLUXVM_AI_MODEL_DIR` or `{state}/ai-models`
- `license` + `residency` metadata on models; residency copied to deployments. When an endpoint sets `residency`, replicas with no `site` are excluded
- `InferenceProfile.gpu.count` must be 1
- Deployment `revision` increments on scale / drain / rollout / autoscale. Rollout strategy is stored only; see the experimental note above
- HF tokens stay on the host (`HF_TOKEN`); never baked into guest images. `revision` is stored and is not passed to the downloader yet

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
on every PR that touches AI paths. Lab smoke:
`scripts/smoke-ai-workloads-phases.sh` (REST) plus gateway Bearer checks.
