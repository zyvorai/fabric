import { defineAgent } from "@zyvor/fabric-agent";

// `ctx.model` is the manifest's `model_socket`: an OpenAI-compatible endpoint that the runtime points
// this agent at. The call goes through the egress broker, which adds the credential on the host, so
// the agent never holds an API key. Swapping Qwen, DeepSeek, GLM or a local model is a manifest change.
export default defineAgent({
  async run(ctx) {
    const question = String((ctx.input as { question?: string })?.question ?? "Say hello in one sentence.");
    const reply = await ctx.model.chat(
      [
        { role: "system", content: "Answer briefly and plainly." },
        { role: "user", content: question },
      ],
      { maxTokens: 200, temperature: 0.2 },
    );
    ctx.emit("model.reply", { model: ctx.model.name, chars: reply.text.length });
    return { answer: reply.text };
  },
});
