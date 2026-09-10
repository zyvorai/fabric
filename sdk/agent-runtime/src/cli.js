#!/usr/bin/env node
// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function usage(exitCode = 0) {
  console.log(`fabric-agent deploy <agent.ts> --name <name> --template <fluxvm-template> [options]\n\nOptions:\n  --allow-host <host>       repeatable egress allow host\n  --credential <name>       repeatable host-side credential grant\n  --allow-private-network  permit brokered private/link-local destinations\n  --runtime-port <port>     guest worker port (default 8080)\n  --ttl <seconds>           default session TTL\n  --max-concurrency <n>     cap non-terminal sessions for this agent\n  --idle-hibernate <sec>    hibernate only while blocked in ctx.nextSteer()\n  --warm-pool <n>           keep n single-use sandboxes prewarmed\n  --url <url>               Fabric Agent Runtime URL\n  --token <token>           Fabric Agent Runtime bearer token`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args[0] !== "deploy" || !args[1]) usage(1);
const entry = resolve(args[1]);
const flags = parseFlags(args.slice(2));
if (!flags.name || !flags.template) usage(1);

await readFile(entry); // fail with a clear local path error before invoking esbuild
const output = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  legalComments: "inline",
  // Resolve the SDK by its published package name against this local
  // checkout's own source -- the deployed bundle only ever needs the
  // ctx helpers inlined, and requiring a real npm publish before anyone
  // can deploy an agent would make the documented workflow unusable.
  alias: { "@zyvor/fabric-agent": resolve(dirname(fileURLToPath(import.meta.url)), "index.js") },
});
const bundle = output.outputFiles[0].contents;
const baseUrl = (flags.url || process.env.FABRIC_AGENT_URL || "http://127.0.0.1:9096").replace(/\/$/, "");
const token = flags.token || process.env.FABRIC_AGENT_TOKEN;
const response = await fetch(`${baseUrl}/v1/agents`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({
    name: flags.name,
    bundle_base64: Buffer.from(bundle).toString("base64"),
    manifest: {
      template: flags.template,
      credentials: flags.credential,
      egress_allow_hosts: flags.allowHost,
      allow_private_networks: flags.allowPrivateNetwork,
      runtime_port: Number(flags.runtimePort || 8080),
      ttl_seconds: flags.ttl ? Number(flags.ttl) : null,
      max_concurrent_sessions: flags.maxConcurrency ? Number(flags.maxConcurrency) : null,
      idle_hibernate_seconds: flags.idleHibernate ? Number(flags.idleHibernate) : null,
      warm_pool_size: flags.warmPool ? Number(flags.warmPool) : 0,
    },
  }),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(result.error || `deploy failed with HTTP ${response.status}`);
  process.exit(1);
}
console.log(`Deployed ${result.name}@${result.version} (${basename(entry)})`);
console.log(`sha256:${result.digest_sha256}`);

function parseFlags(argv) {
  const out = { credential: [], allowHost: [], allowPrivateNetwork: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-private-network") {
      out.allowPrivateNetwork = true;
      continue;
    }
    const value = argv[i + 1];
    if (!arg.startsWith("--") || value === undefined || value.startsWith("--")) usage(1);
    i += 1;
    switch (arg) {
      case "--name": out.name = value; break;
      case "--template": out.template = value; break;
      case "--credential": out.credential.push(value); break;
      case "--allow-host": out.allowHost.push(value); break;
      case "--runtime-port": out.runtimePort = value; break;
      case "--ttl": out.ttl = value; break;
      case "--max-concurrency": out.maxConcurrency = value; break;
      case "--idle-hibernate": out.idleHibernate = value; break;
      case "--warm-pool": out.warmPool = value; break;
      case "--url": out.url = value; break;
      case "--token": out.token = value; break;
      default: console.error(`unknown option: ${arg}`); usage(1);
    }
  }
  return out;
}
