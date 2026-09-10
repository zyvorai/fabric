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
