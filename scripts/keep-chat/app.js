// Keep chat: talks to /agui on this page's own server, which forwards to the Keep host's AG-UI endpoint. Text is only ever inserted with textContent.
"use strict";
const log = document.getElementById("log");
const statusEl = document.getElementById("status");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
let threadId = crypto.randomUUID();
let busy = false;

function add(cls, text) {
  const li = document.createElement("li");
  li.className = "msg " + cls;
  li.textContent = text;
  log.appendChild(li);
  log.scrollTop = log.scrollHeight;
  return li;
}
function setBusy(b, text) { busy = b; sendBtn.disabled = b; statusEl.textContent = text || ""; }

async function run(text, retried) {
  const res = await fetch("/agui", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, runId: crypto.randomUUID(), messages: [{ id: crypto.randomUUID(), role: "user", content: text }], state: {}, forwardedProps: {} }),
  });
  if (res.status === 409 && !retried) { threadId = crypto.randomUUID(); return run(text, true); }   // the thread belongs to another agent (the server keeps a thread with one agent): start a new one
  if (!res.ok) { add("error", "The Keep host answered " + res.status + ": " + (await res.text()).slice(0, 300)); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", bubble = null, sawText = false;
  const handle = (e) => {
    switch (e.type) {
      case "RUN_STARTED": setBusy(true, "The agent is working…"); break;
      case "TEXT_MESSAGE_START": bubble = add("agent", ""); sawText = true; break;
      case "TEXT_MESSAGE_CONTENT": if (!bubble) bubble = add("agent", ""); bubble.textContent += e.delta; log.scrollTop = log.scrollHeight; break;
      case "TEXT_MESSAGE_END": bubble = null; break;
      case "CUSTOM":
        if (e.name === "keep.approval_requested") add("notice", "Waiting for your approval: " + String((e.value || {}).prompt ?? "") + "\nDecide it on your device; this chat cannot approve or deny.");
        else if (e.name === "keep.waiting") setBusy(true, "The agent is waiting…");
        else if (e.name === "keep.event") add("meta", String((e.value || {}).kind ?? "event"));
        break;
      case "RUN_FINISHED":
        if (!sawText && e.result !== undefined && e.result !== null) add("agent", typeof e.result === "string" ? e.result : JSON.stringify(e.result, null, 2));
        setBusy(false, "");
        break;
      case "RUN_ERROR": add("error", String(e.message || "The run failed") + (e.code ? " (" + e.code + ")" : "")); setBusy(false, ""); break;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try { handle(JSON.parse(line.slice(5).trim())); } catch { /* ignore a malformed event */ }
      }
    }
  }
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = ""; input.style.height = "";
  add("me", text);
  setBusy(true, "Sending…");
  try { await run(text, false); }
  catch (err) { add("error", "Could not reach the chat server: " + err.message); }
  finally { setBusy(false, ""); input.focus(); }
});
input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); } });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 128) + "px"; });
document.getElementById("new").addEventListener("click", () => { threadId = crypto.randomUUID(); log.textContent = ""; statusEl.textContent = ""; input.focus(); });
input.focus();
