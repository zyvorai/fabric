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
