import test from "node:test";
import assert from "node:assert/strict";
import { Fabric, defineAgent } from "../src/index.js";

test("defineAgent validates definitions", () => {
  const fn = async () => 1;
  assert.equal(defineAgent(fn), fn);
  assert.throws(() => defineAgent({}), /requires a function/);
});

test("session create uses bearer token and model-independent input", async () => {
  const calls = [];
  const client = new Fabric({
    baseUrl: "https://fabric.example",
    token: "fabric-token",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        id: "s1", agent: "research", agent_version: "abc", sandbox_id: "vm1",
        status: "running", last_event_seq: 0,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });
  const session = await client.agent("research").run({ prompt: "hello", model: "anything" });
  assert.equal(session.id, "s1");
  assert.equal(calls[0].url, "https://fabric.example/v1/sessions");
  assert.equal(calls[0].init.headers.authorization, "Bearer fabric-token");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    agent: "research", input: { prompt: "hello", model: "anything" },
  });
});

test("steer targets the durable session endpoint", async () => {
  let seen;
  const client = new Fabric({
    fetch: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "content-type": "application/json" } });
    },
  });
  const session = { id: "abc", client };
  const { Session } = await import("../src/index.js");
  await Session.prototype.steer.call(session, { focus: "KVM" });
  assert.match(seen.url, /\/v1\/sessions\/abc\/steer$/);
  assert.deepEqual(JSON.parse(seen.init.body), { message: { focus: "KVM" } });
});
