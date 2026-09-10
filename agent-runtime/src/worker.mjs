// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import http from "node:http";
import { Buffer } from "node:buffer";

const nativeFetch = globalThis.fetch.bind(globalThis);
const sessionId = process.env.ZYVOR_SESSION_ID;
const capability = process.env.ZYVOR_EGRESS_CAPABILITY;
const broker = process.env.ZYVOR_EGRESS_BROKER;
const port = Number(process.env.ZYVOR_AGENT_PORT || "8080");
const bundlePath = process.env.ZYVOR_AGENT_BUNDLE || "/opt/zyvor/agent/bundle.mjs";

if (!sessionId || !capability || !broker) {
  throw new Error("ZYVOR_SESSION_ID, ZYVOR_EGRESS_CAPABILITY and ZYVOR_EGRESS_BROKER are required");
}

let seq = 0;
const events = [];
const steering = [];
const waiters = [];
let state = "idle";
let lastError = null;
let cancelled = false;
let runPromise = null;

function emit(kind, data = null) {
  const event = { seq: ++seq, kind, data, timestamp: new Date().toISOString() };
  events.push(event);
  if (events.length > 10000) events.splice(0, events.length - 10000);
  return event;
}

function wakeSteerers() {
  while (waiters.length && steering.length) waiters.shift()(steering.shift());
}

async function nextSteer({ timeoutMs = 0 } = {}) {
  if (steering.length) return steering.shift();
  if (cancelled) return null;
  return new Promise((resolve) => {
    let timer;
    const done = (value) => {
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    waiters.push(done);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        const idx = waiters.indexOf(done);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
    }
  });
}

async function brokerFetch(url, options = {}) {
  const { credential, headers = {}, body, ...rest } = options;
  const requestBody = body == null
    ? null
    : Buffer.from(typeof body === "string" ? body : JSON.stringify(body)).toString("base64");
  const response = await nativeFetch(`${broker}/v1/egress`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zyvor-session-id": sessionId,
      "x-zyvor-egress-capability": capability,
    },
    body: JSON.stringify({
      url: String(url),
      method: rest.method || "GET",
      headers: Object.fromEntries(new Headers(headers).entries()),
      body_base64: requestBody,
      credential: credential || null,
    }),
  });
  const envelope = await response.json().catch(() => ({ error: `broker returned HTTP ${response.status}` }));
  if (!response.ok) throw new Error(envelope.error || `egress broker returned HTTP ${response.status}`);
  return new Response(Buffer.from(envelope.body_base64 || "", "base64"), {
    status: envelope.status,
    headers: envelope.headers || {},
  });
}

async function run(input) {
  if (runPromise) throw new Error("session already started");
  state = "running";
  emit("session.started", { input });
  runPromise = (async () => {
    try {
      const mod = await import(`${bundlePath}?v=${Date.now()}`);
      const fn = typeof mod.default === "function" ? mod.default : mod.default?.run || mod.run;
      if (typeof fn !== "function") throw new Error("agent bundle must export a default function or { run() }");
      const ctx = Object.freeze({
        sessionId,
        input,
        emit,
        fetch: brokerFetch,
        nextSteer,
        isCancelled: () => cancelled,
      });
      const result = await fn(ctx);
      if (cancelled) {
        state = "cancelled";
        emit("session.cancelled", null);
      } else {
        state = "completed";
        emit("session.result", result === undefined ? null : result);
      }
    } catch (error) {
      lastError = error?.stack || String(error);
      state = "failed";
      emit("session.failed", { error: lastError });
    }
  })();
  return { accepted: true };
}

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { "content-type": "application/json", "content-length": String(body.length) });
  res.end(body);
}

async function bodyJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 16 * 1024 * 1024) throw new Error("request too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "GET" && url.pathname === "/status") return json(res, 200, { status: state, error: lastError });
    if (req.method === "GET" && url.pathname === "/events") {
      const after = Number(url.searchParams.get("after") || "0");
      return json(res, 200, { items: events.filter((e) => e.seq > after) });
    }
    if (req.method === "POST" && url.pathname === "/run") return json(res, 202, await run((await bodyJson(req)).input));
    if (req.method === "POST" && url.pathname === "/steer") {
      const payload = (await bodyJson(req)).message;
      steering.push(payload);
      emit("session.steer", payload);
      wakeSteerers();
      return json(res, 202, { accepted: true });
    }
    if (req.method === "POST" && url.pathname === "/checkpoint") {
      emit("session.checkpoint", { state, pending_steering: steering.length });
      return json(res, 200, { ok: true, state, seq });
    }
    if (req.method === "POST" && url.pathname === "/cancel") {
      cancelled = true;
      state = "cancelled";
      emit("session.cancel.requested", null);
      while (waiters.length) waiters.shift()(null);
      return json(res, 202, { accepted: true });
    }
    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 500, { error: error?.stack || String(error) });
  }
});

server.listen(port, "0.0.0.0", () => emit("runtime.ready", { port }));
