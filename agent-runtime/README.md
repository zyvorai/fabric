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

## Credentials

Create a **descriptor file**, not a secret file:

```json
{
  "anthropic": {
    "host": "api.anthropic.com",
    "header": "x-api-key",
    "env": "ANTHROPIC_API_KEY"
  },
  "openai": {
    "host": "api.openai.com",
    "header": "authorization",
    "env": "OPENAI_API_KEY",
    "prefix": "Bearer "
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
| `ZYVOR_AGENT_CREDENTIALS_FILE` | unset | descriptor JSON above |
| `ZYVOR_AGENT_EGRESS_ADVERTISE_HOST` | derived | host address visible from sandbox |
| `ZYVOR_AGENT_SYNC_INTERVAL_MS` | `300` | guest event sync interval |

For production, set `ZYVOR_AGENT_API_TOKEN`, bind the public API behind TLS, firewall port 18082 so only sandbox networks can reach it, and use FluxVM's dataplane/network policy to restrict direct guest egress.

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
  --allow-host api.anthropic.com
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

## HTTP API

```text
POST   /v1/agents
GET    /v1/agents
GET    /v1/agents/{name}

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

Session metadata and the host event journal survive Agent Runtime restarts. Exact mid-stack recovery after a **host/FluxVM process restart** additionally requires FluxVM to expose its existing sandbox `SnapshotLoad` primitive through REST; the current FluxVM API exposes snapshot save but not that load operation. This PR does not pretend cold restore is implemented when the upstream REST contract is not present.

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
