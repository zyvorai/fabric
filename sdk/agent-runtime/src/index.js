// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

export function defineAgent(definition) {
  if (typeof definition === "function") return definition;
  if (!definition || typeof definition.run !== "function") {
    throw new TypeError("defineAgent() requires a function or { run(ctx) }");
  }
  return definition;
}

export class Fabric {
  constructor({ baseUrl = "http://127.0.0.1:9096", token, fetch: fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
    this.sessions = {
      create: async (request) => new Session(this, await this.request("POST", "/v1/sessions", request)),
      get: async (id) => new Session(this, await this.request("GET", `/v1/sessions/${id}`)),
      list: async () => (await this.request("GET", "/v1/sessions")).items.map((v) => new Session(this, v)),
    };
    this.agents = {
      list: async () => (await this.request("GET", "/v1/agents")).items,
      get: async (name) => this.request("GET", `/v1/agents/${encodeURIComponent(name)}`),
    };
  }

  agent(name) {
    return {
      run: (input = {}, options = {}) => this.sessions.create({ agent: name, input, ...options }),
    };
  }

  async request(method, path, body) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Fabric Agent Runtime returned HTTP ${response.status}`);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }
}

export class Session {
  constructor(client, value) {
    this.client = client;
    Object.assign(this, value);
  }

  async refresh() {
    Object.assign(this, await this.client.request("GET", `/v1/sessions/${this.id}`));
    return this;
  }

  async steer(message) {
    return this.client.request("POST", `/v1/sessions/${this.id}/steer`, { message });
  }

  async hibernate() {
    Object.assign(this, await this.client.request("POST", `/v1/sessions/${this.id}/hibernate`, {}));
    return this;
  }

  async resume() {
    Object.assign(this, await this.client.request("POST", `/v1/sessions/${this.id}/resume`, {}));
    return this;
  }

  async cancel() {
    Object.assign(this, await this.client.request("POST", `/v1/sessions/${this.id}/cancel`, {}));
    return this;
  }

  async delete() {
    await this.client.request("DELETE", `/v1/sessions/${this.id}`);
  }

  async *events({ after = 0, signal } = {}) {
    const headers = { accept: "text/event-stream" };
    if (this.client.token) headers.authorization = `Bearer ${this.client.token}`;
    const response = await this.client.fetch(`${this.client.baseUrl}/v1/sessions/${this.id}/events?after=${after}`, {
      headers,
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`event stream returned HTTP ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        for (;;) {
          const cut = buffer.indexOf("\n\n");
          if (cut < 0) break;
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const parsed = parseSse(block);
          if (parsed?.data) yield JSON.parse(parsed.data);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async result() {
    let cursor = 0;
    for await (const event of this.events({ after: cursor })) {
      cursor = event.seq;
      if (event.kind === "session.result") return event.data;
      if (event.kind === "session.failed") throw new Error(event.data?.error || "agent session failed");
      if (event.kind === "session.cancelled") throw new Error("agent session cancelled");
    }
    const latest = await this.refresh();
    if (latest.status === "completed") return undefined;
    throw new Error(`session stream ended with status ${latest.status}`);
  }
}

function parseSse(block) {
  const out = {};
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const cut = line.indexOf(":");
    const key = cut < 0 ? line : line.slice(0, cut);
    const value = cut < 0 ? "" : line.slice(cut + 1).replace(/^ /, "");
    if (key === "data") out.data = out.data ? `${out.data}\n${value}` : value;
    else out[key] = value;
  }
  return out;
}
