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
