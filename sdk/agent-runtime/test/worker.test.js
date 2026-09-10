import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const here = fileURLToPath(new URL(".", import.meta.url));
const workerPath = resolve(here, "../../../agent-runtime/src/worker.mjs");

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function poll(url, predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        last = await response.json();
        if (predicate(last)) return last;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`poll timeout; last=${JSON.stringify(last)}`);
}

test("worker exposes waiting state only while blocked in nextSteer", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "zyvor-agent-worker-"));
  const bundle = join(dir, "bundle.mjs");
  await writeFile(bundle, `export default async (ctx) => {\n  const value = await ctx.nextSteer({ timeoutMs: 5000 });\n  return { value };\n};\n`);
  const port = await freePort();
  const child = spawn(process.execPath, [workerPath], {
    env: {
      ...process.env,
      ZYVOR_SESSION_ID: "test-session",
      ZYVOR_EGRESS_CAPABILITY: "test-capability",
      ZYVOR_EGRESS_BROKER: "http://127.0.0.1:9",
      ZYVOR_AGENT_PORT: String(port),
      ZYVOR_AGENT_BUNDLE: bundle,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  });

  await poll(`http://127.0.0.1:${port}/health`, (v) => v.ok === true);
  const run = await fetch(`http://127.0.0.1:${port}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { prompt: "hello" } }),
  });
  assert.equal(run.status, 202);

  const waiting = await poll(`http://127.0.0.1:${port}/status`, (v) => v.status === "waiting");
  assert.equal(waiting.status, "waiting");

  const steer = await fetch(`http://127.0.0.1:${port}/steer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: { focus: "KVM" } }),
  });
  assert.equal(steer.status, 202);

  await poll(`http://127.0.0.1:${port}/status`, (v) => v.status === "completed");
  const events = await (await fetch(`http://127.0.0.1:${port}/events?after=0`)).json();
  const kinds = events.items.map((e) => e.kind);
  assert.ok(kinds.includes("session.waiting"));
  assert.ok(kinds.includes("session.running"));
  assert.ok(kinds.includes("session.result"));
});
