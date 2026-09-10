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

test("request_id is forwarded for idempotent session creation", async () => {
  let body;
  const client = new Fabric({
    fetch: async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: "same", agent: "research", agent_version: "v1", sandbox_id: "vm1",
        status: "running", last_event_seq: 0, request_id: body.request_id,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });
  const session = await client.agent("research").run({ prompt: "x" }, { request_id: "job:42" });
  assert.equal(body.request_id, "job:42");
  assert.equal(session.request_id, "job:42");
});

test("createMany bounds concurrency and preserves result order", async () => {
  let active = 0;
  let peak = 0;
  const client = new Fabric({
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return new Response(JSON.stringify({
        id: request.request_id, agent: request.agent, agent_version: "v1", sandbox_id: `vm-${request.request_id}`,
        status: "running", last_event_seq: 0, request_id: request.request_id,
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });

  const sessions = await client.sessions.createMany([
    { agent: "a", input: 1, request_id: "one" },
    { agent: "a", input: 2, request_id: "two" },
    { agent: "a", input: 3, request_id: "three" },
    { agent: "a", input: 4, request_id: "four" },
  ], { concurrency: 2 });

  assert.ok(peak <= 2, `peak concurrency was ${peak}`);
  assert.deepEqual(sessions.map((s) => s.id), ["one", "two", "three", "four"]);
});

test("createMany rejects invalid concurrency", async () => {
  const client = new Fabric({ fetch: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(() => client.sessions.createMany([], { concurrency: 0 }), /positive integer/);
});
