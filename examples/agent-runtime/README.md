# Agent Runtime example

`agent.ts` shows a model-provider request using `ctx.fetch(..., { credential: "anthropic" })`. The Anthropic key is injected by the host-side Fabric egress broker and never exists in the sandbox.

`client.ts` starts a durable session and consumes the resumable event stream.

Deploy:

```bash
cd sdk/agent-runtime
npm install
./src/cli.js deploy ../../examples/agent-runtime/agent.ts \
  --name research-agent \
  --template node22-agent \
  --credential anthropic \
  --allow-host api.anthropic.com
```

`fanout.ts` shows retry-safe, bounded-concurrency multi-session orchestration with one stable `request_id` per target.

## Warm-pool example

Deploy the agent with `--warm-pool 4`, then run `warm-pool.ts` to inspect/reconcile the pool and start a TTL-bounded session while printing its `start_mode` and `startup_ms`.
