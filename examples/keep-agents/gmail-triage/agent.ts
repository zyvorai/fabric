import { defineAgent } from "@zyvor/fabric-agent";

// Lists your unread inbox mail: who wrote, the subject, when. Read-only: the `gmail-read` credential can only GET (see
// docs/keep/connectors/README.md). No model. What it shows is text from other people, so it prints it as plain data and does nothing with it.
type Input = { max?: number; gmailBase?: string };

const clean = (text: unknown, max: number): string =>
  String(text ?? "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]+/g, " ").trim().slice(0, max);

async function getJson(ctx: any, url: string): Promise<any> {
  const res = await ctx.fetch(url, { credential: "gmail-read" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gmail did not answer (${res.status}): ${clean(text, 200)}`);
  return text ? JSON.parse(text) : {};
}

export default defineAgent({
  async run(ctx) {
    const input = (ctx.input ?? {}) as Input;
    const base = (input.gmailBase ?? "https://gmail.googleapis.com").replace(/\/$/, "");
    const max = Math.min(25, Math.max(1, Math.trunc(Number(input.max ?? 10)) || 10));
    const list = await getJson(ctx, `${base}/gmail/v1/users/me/messages?q=${encodeURIComponent("is:unread in:inbox")}&maxResults=${max}`);
    const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id).filter((id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id));
    if (ids.length === 0) return "No unread mail in your inbox.";
    const rows: string[] = [];
    for (const id of ids) {
      const m = await getJson(
        ctx,
        `${base}/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      const header = (name: string) =>
        clean((m.payload?.headers ?? []).find((h: { name: string }) => String(h.name).toLowerCase() === name)?.value, 120);
      rows.push(`- ${header("from") || "(unknown sender)"}: ${header("subject") || "(no subject)"}${header("date") ? ` (${header("date")})` : ""}`);
    }
    ctx.emit("gmail.triage.done", { unread_listed: rows.length });
    return `${rows.length} unread message${rows.length === 1 ? "" : "s"} (newest first):\n${rows.join("\n")}`;
  },
});
