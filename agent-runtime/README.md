# Zyvor Fabric Agent Runtime

Deploy JavaScript/TypeScript agents like serverless functions while giving every session its own durable FluxVM Linux sandbox.

## What this PR adds

- immutable, content-addressed agent deployments
- one FluxVM sandbox per session
- durable JSONL event journal with monotonically increasing sequence numbers
- resumable SSE streams (`?after=<seq>`)
- mid-run steering and cancellation
- memory+disk checkpoint followed by pause for hibernation, then resume
- host-side egress broker: provider API keys are resolved from host environment variables and injected only after the request leaves the guest
- arbitrary credential headers (`Authorization`, `x-api-key`, etc.)
- per-agent host allowlists and credential grants
- private/link-local egress blocked by default to reduce SSRF/metadata exposure
- TypeScript/JavaScript SDK and `fabric-agent deploy` CLI
- no dependency on a particular model SDK or provider
- idempotent session creation with caller `request_id` keys
- per-agent non-terminal session concurrency caps
- automatic hibernation only at the safe `ctx.nextSteer()` waiting point
- method/path/port scopes on host-side credentials
- bounded-concurrency SDK fan-out with stable result ordering
- single-use prewarmed FluxVM sandbox pools per immutable agent version
- warm-pool health repair, stale-claim recovery and automatic replenishment
- runtime-owned TTL expiry so warm sessions receive their full requested lifetime
- `start_mode` + `startup_ms` observability for warm/cold launch measurement
- per-session operation serialization for steer/hibernate/resume/cancel/delete/expiry

The runtime is intentionally a standalone component in the Fabric repository. It consumes FluxVM's existing `/v1/sandboxes` API directly and does not alter the existing `zyvor-fabricd` VM API or backend workspace.

## Architecture

```text
agent.ts -> fabric-agent deploy -> immutable bundle
                                 |
SDK / HTTP -> Agent Runtime -----+---- durable session/event state
                  |              |
                  |              +---- host credential descriptors -> host env
                  |
                  +---- FluxVM /v1/sandboxes -> one Linux sandbox/session
                                      |
                                   worker.mjs
                                      |
                              session capability only
                                      v
                              host egress broker
                                      |
                      inject provider key after VM boundary
                                      v
                       OpenAI / Anthropic / any HTTPS API
```

Provider secret values are never serialized into agent deployments, session records, guest files, environment variables, or API responses. The guest receives only a random session-scoped egress capability. The broker validates the session, immutable agent version, destination host, credential grant and credential host before resolving the provider secret from the host environment.

## Host requirements

1. A working FluxVM server reachable from the Agent Runtime.
2. A FluxVM sandbox template containing Node.js 20+.
3. The template should use `tap` + `netns` networking. The worker derives the host-side gateway from its default route so it can reach the egress broker. If that is not appropriate, set `ZYVOR_AGENT_EGRESS_ADVERTISE_HOST` explicitly.
4. The FluxVM guest agent must be present. FluxVM sandbox creation enables it by default.

Example FluxVM template name used below: `node22-agent`.

**Known limitation:** `POST /v1/sandboxes` always creates a FluxVM
`flux-vm`-backend sandbox (its own in-tree microVM hypervisor,
`fluxvm-hypervisor`), regardless of what a template's `backend` field
says. This backend is less mature than FluxVM's QEMU backend for
general-purpose images: confirmed live (direct `fluxvm-hypervisor`
invocation with serial output captured) that it hangs indefinitely
bringing up a second vCPU (`--cpus 1` boots fine; `--cpus 2+` doesn't),
and separately hangs during guest kernel boot at virtio-mmio device
probe on at least one general-purpose Ubuntu+Node.js image. Until
that's resolved, build and test your template image with `--cpus 1`
first before assuming a real session will complete end to end.

## Credentials

Create a **descriptor file**, not a secret file:

```json
{
  "anthropic": {
    "host": "api.anthropic.com",
    "header": "x-api-key",
    "env": "ANTHROPIC_API_KEY",
    "allowed_methods": ["POST"],
    "path_prefixes": ["/v1/"]
  },
  "openai": {
    "host": "api.openai.com",
    "header": "authorization",
    "env": "OPENAI_API_KEY",
    "prefix": "Bearer ",
    "allowed_methods": ["POST"],
    "path_prefixes": ["/v1/"]
  }
}
```

Then put secret values only in the Agent Runtime process environment:

```bash
export ANTHROPIC_API_KEY='...'
export OPENAI_API_KEY='...'
export ZYVOR_AGENT_CREDENTIALS_FILE=/etc/zyvor/agent-credentials.json
```

The descriptor is safe to persist because it contains only the environment variable **name**, never the value.

## Run

```bash
cd agent-runtime
cargo run
```

Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `ZYVOR_AGENT_LISTEN` | `127.0.0.1:9096` | public Agent Runtime API |
| `ZYVOR_AGENT_EGRESS_LISTEN` | `0.0.0.0:18082` | guest-accessible host egress broker |
| `ZYVOR_AGENT_STATE_DIR` | `/var/lib/zyvor-fabric-agent` | deployment/session/event state |
| `ZYVOR_AGENT_SNAPSHOT_DIR` | `/var/lib/fluxvm/agent-snapshots` | FluxVM hibernation snapshots |
| `ZYVOR_AGENT_FLUXVM_URL` | `http://127.0.0.1:7788` | FluxVM API |
| `ZYVOR_AGENT_FLUXVM_TOKEN` | unset | FluxVM bearer token |
| `ZYVOR_AGENT_API_TOKEN` | unset | public Agent Runtime bearer token |
| `ZYVOR_AGENT_ALLOW_NO_AUTH` | unset | explicit opt-out to start without `ZYVOR_AGENT_API_TOKEN` |
| `ZYVOR_AGENT_CREDENTIALS_FILE` | unset | descriptor JSON above |
| `ZYVOR_AGENT_EGRESS_ADVERTISE_HOST` | derived | host address visible from sandbox |
| `ZYVOR_AGENT_SYNC_INTERVAL_MS` | `300` | guest event sync interval |
| `ZYVOR_AGENT_IDLE_SCAN_INTERVAL_MS` | `1000` | scan interval for safe waiting-session auto-hibernate |
| `ZYVOR_AGENT_WARM_POOL_RECONCILE_INTERVAL_MS` | `2000` | warm-pool health/replenishment interval |
| `ZYVOR_AGENT_WARM_POOL_MAX_CREATE_PER_TICK` | `2` | cap new standby VMs per agent per reconcile pass |
| `ZYVOR_AGENT_WARM_POOL_CLAIM_STALE_SECS` | `300` | clean abandoned durable pool claims after crashes |
| `ZYVOR_AGENT_EXPIRY_SCAN_INTERVAL_MS` | `1000` | runtime-owned session TTL scan interval |

The Agent Runtime refuses to start unless `ZYVOR_AGENT_API_TOKEN` is set, or `ZYVOR_AGENT_ALLOW_NO_AUTH=1` is set to explicitly opt out (only appropriate when something else already restricts access to the API, e.g. a local-only dev loopback bind). For production, also bind the public API behind TLS, firewall port 18082 so only sandbox networks can reach it, and use FluxVM's dataplane/network policy to restrict direct guest egress.

## Write an agent

```ts
import { defineAgent } from "@zyvor/fabric-agent";

export default defineAgent({
  async run(ctx) {
    const response = await ctx.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      credential: "anthropic",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: ctx.input.prompt }]
      })
    });

    return response.json();
  }
});
```

No provider API key appears in `agent.ts` or inside the VM.

## Deploy

```bash
cd sdk/agent-runtime
npm install

FABRIC_AGENT_URL=http://127.0.0.1:9096 \
./src/cli.js deploy ../../examples/agent-runtime/agent.ts \
  --name research-agent \
  --template node22-agent \
  --credential anthropic \
  --allow-host api.anthropic.com \
  --max-concurrency 16 \
  --idle-hibernate 60 \
  --warm-pool 4
```

The deploy command uses esbuild to produce one Node 20 ESM bundle. The deployment version hashes both the executable bundle and its security manifest, so changing an egress/credential grant always creates a new immutable version.

## Start, stream and steer

```ts
import { Fabric } from "@zyvor/fabric-agent";

const fabric = new Fabric({
  baseUrl: process.env.FABRIC_AGENT_URL,
  token: process.env.FABRIC_AGENT_TOKEN
});

const session = await fabric.agent("research-agent").run({
  prompt: "Compare KVM and Firecracker for untrusted agents"
});

for await (const event of session.events()) {
  console.log(event.seq, event.kind, event.data);
}
```

Steer during execution:

```ts
await session.steer({ instruction: "Also cover Cloud Hypervisor" });
```

Agents that want interactive steering can call:

```ts
const message = await ctx.nextSteer({ timeoutMs: 30_000 });
```

## Fast starts with single-use warm pools

Set `warm_pool_size` on an agent deployment (or `--warm-pool <n>` in the CLI). Fabric continuously keeps that many clean FluxVM sandboxes booted, loads only the generic `worker.mjs`, and pauses them.

When a session arrives, Fabric atomically claims the oldest compatible standby, resumes it, writes the immutable agent bundle, starts the worker, and permanently transfers ownership to that session. The VM is **never recycled** after agent code runs. This preserves the same clean-VM isolation model as a cold start.

```ts
const pool = await fabric.agents.warmPool("research-agent");
console.log(pool.desired, pool.ready);

await fabric.agents.reconcileWarmPool("research-agent");

const session = await fabric.agent("research-agent").run(
  { prompt: "Compare KVM and Firecracker" },
  { ttl_seconds: 900, start_policy: "prefer-warm" }
);
console.log(session.start_mode, session.startup_ms); // warm / measured milliseconds
```

Warm-pool records are durable. Health checks first move a standby into an unclaimable `reconciling` lease, so reconciliation can never pause or delete a VM after a concurrent session has claimed it. After a runtime crash, reconciliation removes claims already owned by persisted sessions, deletes abandoned stale claims, drains old deployment versions, repairs accidentally running standby VMs back to paused, discards failed/missing VMs, and replenishes toward the configured target. Worker binaries are SHA-256 pinned so a runtime upgrade drains standbys carrying an older worker.

Session admission supports `start_policy: "prefer-warm" | "require-warm" | "cold-only"`. `prefer-warm` is the default and falls back to a cold FluxVM create; `require-warm` returns a load/backpressure error instead of accepting a slow cold start; `cold-only` bypasses the pool for debugging and latency comparisons.

Session TTL is enforced by the Agent Runtime from the session admission timestamp, not the standby VM creation timestamp. This is required for correct TTL behavior with prewarmed VMs. Expired sessions emit `session.expired`, destroy their FluxVM sandbox, and become terminal. Completed, failed, cancelled, and explicitly deleted sessions also release their single-use sandbox; `sandbox_released` is persisted and a cleanup loop retries idempotent deletion after transient FluxVM failures.

## Reliable retries and fan-out

Pass a stable caller id to make session creation idempotent. A retry with the same agent and `request_id` returns the already-reserved session instead of launching another sandbox:

```ts
const session = await fabric.agent("research-agent").run(
  { prompt: "Investigate KVM" },
  { request_id: "ticket:INC-1042" }
);
```

For bounded fan-out across many independent sessions:

```ts
const sessions = await fabric.sessions.createMany(
  targets.map((target) => ({
    agent: "research-agent",
    input: { target },
    request_id: `scan:${target}`
  })),
  { concurrency: 8 }
);
```

`max_concurrent_sessions` is enforced server-side against all non-terminal sessions for an agent, including hibernated sessions that still reserve a sandbox. This prevents retry storms and unbounded per-agent VM creation.

## Safe automatic hibernation

`idle_hibernate_seconds` does **not** treat a quiet log stream as proof of idleness. The guest worker exposes `waiting` only while user code is blocked inside `ctx.nextSteer()`. The host auto-hibernator checks both the configured idle duration and that explicit guest state before snapshot+pause. CPU-bound or tool-running code is never auto-frozen simply because it emitted no events.

## Credential request scopes

Credential descriptors can reduce a provider key to specific methods, URL path prefixes, and non-standard TLS ports:

```json
{
  "github-writer": {
    "host": "api.github.com",
    "header": "authorization",
    "env": "GITHUB_TOKEN",
    "prefix": "Bearer ",
    "allowed_methods": ["GET", "POST"],
    "path_prefixes": ["/repos/zyvorai/"],
    "allowed_ports": []
  }
}
```

Port 443 is always allowed for HTTPS. Any other credential-bearing port must be explicitly listed. Empty `allowed_methods` or `path_prefixes` keeps that dimension unrestricted.

## HTTP API

```text
POST   /v1/agents
GET    /v1/agents
GET    /v1/agents/{name}
GET    /v1/agents/{name}/warm-pool
POST   /v1/agents/{name}/warm-pool   # trigger one reconcile pass

POST   /v1/sessions
GET    /v1/sessions
GET    /v1/sessions/{id}
DELETE /v1/sessions/{id}
POST   /v1/sessions/{id}/steer
POST   /v1/sessions/{id}/cancel
POST   /v1/sessions/{id}/hibernate
POST   /v1/sessions/{id}/resume
GET    /v1/sessions/{id}/events?after=<seq>
```

The events endpoint is SSE. Reconnecting with the last seen sequence number replays all durable host events after that point.

## Hibernation semantics

`hibernate` asks the guest worker to checkpoint its event boundary, creates a FluxVM memory+disk sandbox snapshot, and pauses the sandbox. `resume` resumes that same paused sandbox, preserving the JavaScript process stack and in-memory agent state.

Session metadata, TTL deadlines, warm-pool claims and the host event journal survive Agent Runtime restarts. Exact mid-stack recovery after a **host/FluxVM process restart** additionally requires FluxVM to expose its existing sandbox `SnapshotLoad` primitive through REST; the current FluxVM API exposes snapshot save but not that load operation. This PR does not pretend cold restore is implemented when the upstream REST contract is not present.

## Security notes

- provider secrets are loaded only in the host egress broker
- session capabilities are random and excluded from `SessionView`
- credential use requires an explicit agent grant
- credential descriptor host must match the request host
- agent egress host allowlist must match the request host
- credential injection is HTTPS-only
- brokered private, loopback and link-local destinations are blocked by default (explicit manifest opt-in only)
- guest-supplied `Authorization`, proxy auth, hop-by-hop headers, and any configured credential-injection header are stripped before forwarding
- upstream redirects are disabled, preventing credential forwarding to a redirected host
- agent versions include the security manifest in their digest

This broker protects managed provider credentials. For a full no-bypass sandbox, pair it with FluxVM Network Fabric default-deny rules so the guest can reach only the broker/DNS and required internal services.
