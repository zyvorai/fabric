# @zyvor/fabric-agent

Model-independent TypeScript/JavaScript SDK for the Zyvor Fabric Agent Runtime.

```ts
import { defineAgent } from "@zyvor/fabric-agent";

export default defineAgent(async (ctx) => {
  const r = await ctx.fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    credential: "openai",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5", input: ctx.input.prompt })
  });
  return r.json();
});
```

See `../../agent-runtime/README.md` for runtime deployment, credentials, session APIs, hibernation and security details.

## Idempotent fan-out

```ts
const sessions = await fabric.sessions.createMany([
  { agent: "research", input: { target: "a" }, request_id: "scan:a" },
  { agent: "research", input: { target: "b" }, request_id: "scan:b" }
], { concurrency: 2 });
```

`request_id` prevents duplicate sandboxes when a caller retries the same agent start. `createMany` bounds client-side launch concurrency and preserves input/result ordering.

## Warm pools

Deploy with `fabric-agent deploy agent.ts --name research --template node22-agent --warm-pool 4`, then inspect or force reconciliation through the SDK:

```ts
const pool = await fabric.agents.warmPool("research");
console.log(pool.ready, pool.desired);
await fabric.agents.reconcileWarmPool("research");

const session = await fabric.agent("research").run(
  { prompt: "hello" },
  { start_policy: "prefer-warm" },
);
console.log(session.start_mode, session.startup_ms, session.sandbox_released);
```

Standby VMs are single-use. Fabric never returns a sandbox to the pool after user agent code has executed in it. Use `start_policy: "require-warm"` when a caller prefers backpressure over a cold start, or `"cold-only"` to bypass the pool.

## Packs: one-command deploy

`fabric-agent pack` deploys a directory with a `pack.json` (see [docs/keep/PACKS.md](../../docs/keep/PACKS.md)):

```bash
export KEEP_POLICY_SEED=$(openssl rand -hex 32)       # your signing key (Keep mode)
fabric-agent pack keys                                # public key to register on the runtime
fabric-agent pack deploy ./my-pack --run              # build, sign, deploy, apply policy, start a session
fabric-agent pack deploy ./my-usecase --test          # declarative use case: save, run on its sample, need 0 CONNECT
fabric-agent pack bundle ./my-pack                    # <name>.keeppack.json for the console's Deploy a pack
```

Signing uses Node's built-in Ed25519, byte-compatible with `keep_sign_policy`, so no Rust toolchain
is needed. `--dry-run` prints the plan without contacting the runtime.
