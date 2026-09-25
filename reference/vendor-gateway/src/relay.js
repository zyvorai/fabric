// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

// Push relay: the runtime POSTs a signed "approval.requested" message here; this turns it into a push.
// Keep embeds no vendor push SDK. Each `push.kind` is an adapter: implement `send(device, message)`.

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRelaySignature(secret, rawBody, header) {
  const want = createHmac("sha256", secret).update(rawBody).digest();
  const got = Buffer.from(String(header ?? "").replace(/^sha256=/, ""), "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** What the phone is shown. Never the request's contents: the runtime does not send them. */
export function notification(message) {
  const a = message.approval;
  return {
    title: `${a.kind} approval`,
    body: a.prompt,
    data: { approval_id: a.id, session_id: a.session_id, device_id: message.device.id, sign: message.sign },
  };
}

/** Adapters by `push.kind`. `webhook` and `log` work as they are; the rest are the vendor's to write. */
export function defaultAdapters({ fetchImpl = fetch, log = console.log } = {}) {
  const needsVendor = (name) => async () => {
    throw new Error(`the ${name} adapter is not implemented: it needs the vendor's push credentials (see README)`);
  };
  return {
    // POST the notification to the URL the device enrolled as its push token (your own delivery service).
    webhook: {
      async send(device, message) {
        const res = await fetchImpl(device.push.token, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(notification(message)),
        });
        if (!res.ok) throw new Error(`webhook answered HTTP ${res.status}`);
      },
    },
    log: { async send(device, message) { log("push", device.id, JSON.stringify(notification(message))); } },
    fcm: { send: needsVendor("fcm") },
    mipush: { send: needsVendor("mipush") },
    hms: { send: needsVendor("hms") },
    oppo: { send: needsVendor("oppo") },
    vivo: { send: needsVendor("vivo") },
  };
}

/** Handle one relay request. Returns [status, body]. */
export async function handleRelay({ secret, adapters, rawBody, signature }) {
  if (!verifyRelaySignature(secret, rawBody, signature)) return [401, { error: "bad signature" }];
  let message;
  try { message = JSON.parse(rawBody); } catch { return [400, { error: "not JSON" }]; }
  const kind = message?.device?.push?.kind;
  const adapter = adapters[kind];
  if (!adapter) return [422, { error: `no adapter for push kind ${JSON.stringify(kind)}` }];
  try {
    await adapter.send(message.device, message);
    return [202, { sent: true, kind }];
  } catch (e) {
    // A 5xx makes the runtime retry (twice) and then journal the failure.
    return [502, { error: String(e.message ?? e) }];
  }
}
