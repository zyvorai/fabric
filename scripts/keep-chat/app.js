// Keep chat: talks to /agui, /threads on this page's own server, which forwards to the Keep host with the token added there.
// Text from the network or the user is only ever inserted with textContent; there is no innerHTML anywhere in this file.
"use strict";
const $ = (id) => document.getElementById(id);
const app = $("app"), log = $("log"), statusEl = $("status"), form = $("form"), input = $("input"), sendBtn = $("send");
const threadsEl = $("threads"), threadsEmpty = $("threads-empty"), hello = $("hello");
const agentName = $("agent-name").textContent.trim();
const KEY = "keep-chat-thread";   // the conversation to reopen after a reload; only a convenience, so a blocked or empty storage is fine
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const remember = (id) => { try { localStorage.setItem(KEY, id); } catch { /* storage may be blocked */ } };

let threadId = remembered() || crypto.randomUUID();
remember(threadId);   // a first conversation must survive a reload too
let busy = false;
let known = [];

// ---- avatars: a colour from the name, set through the CSS object model (the page's CSP forbids style attributes) ----
function hueOf(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function paintAvatar(el, name) { el.textContent = (name || "?").trim().charAt(0).toUpperCase(); el.style.setProperty("--h", String(hueOf(name || "?"))); }
paintAvatar($("avatar"), agentName); paintAvatar($("hello-avatar"), agentName);

// ---- time ----
const pad = (n) => String(n).padStart(2, "0");
const clock = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes());
function dayLabel(d) {
  const t = new Date(), y = new Date(Date.now() - 864e5);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, t)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
}
function listTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dayLabel(d) === "Today" ? clock(d) : dayLabel(d);
}

// ---- the message list ----
let lastSide = null, lastDay = "", typingEl = null, lastMine = [];
function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 140; }
function toBottom() { log.scrollTop = log.scrollHeight; }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function place(node) { if (typingEl && typingEl.parentNode === log) log.insertBefore(node, typingEl); else log.appendChild(node); }
function refreshHello() { hello.hidden = log.children.length > 0; }

function dayBreak(when) {
  const label = dayLabel(when);
  if (label !== lastDay) { lastDay = label; place(el("li", "day", label)); lastSide = null; }
}
function bubble(side, text, when) {
  when = when || new Date();
  const stick = nearBottom();
  dayBreak(when);
  const li = el("li", "msg " + side + (lastSide === side ? " join" : (lastSide ? " gap" : "")));
  lastSide = side;
  li.appendChild(document.createTextNode(text));
  const meta = el("span", "meta");
  meta.appendChild(el("time", "", clock(when)));
  if (side === "me") { const tick = el("span", "tick", "✓"); meta.appendChild(tick); li.tick = tick; lastMine.push(li); }
  li.appendChild(meta);
  place(li); refreshHello();
  if (stick) toBottom();
  return li;
}
function note(kind, text) {
  const stick = nearBottom();
  place(el("li", "note " + kind, text)); lastSide = null; refreshHello();
  if (stick) toBottom();
}
function markMine(state) {   // ✓ sent, ✓✓ the agent took it, blue ✓✓ the agent answered
  for (const li of lastMine) { li.tick.textContent = state === "sent" ? "✓" : "✓✓"; li.tick.classList.toggle("read", state === "read"); }
  if (state === "read") lastMine = [];
}
function showTyping(on) {
  if (on && !typingEl) {
    typingEl = el("li", "msg agent typing" + (lastSide === "agent" ? " join" : ""));
    for (let i = 0; i < 3; i++) typingEl.appendChild(el("i"));
    typingEl.setAttribute("aria-label", "The agent is working");
    log.appendChild(typingEl); toBottom();
  } else if (!on && typingEl) { typingEl.remove(); typingEl = null; }
}
function clearLog() { log.textContent = ""; lastSide = null; lastDay = ""; typingEl = null; lastMine = []; refreshHello(); }

function setBusy(b, text, live) {
  busy = b; sendBtn.disabled = b;
  form.classList.toggle("working", b);   // the glow around the field
  statusEl.textContent = text || "Runs on your Keep host";
  statusEl.classList.toggle("live", !!live);
  for (const btn of threadsEl.querySelectorAll("button")) btn.disabled = b;
  $("new").disabled = b;
}

// ---- the chat list: what the Keep host keeps for this agent ----
async function refreshThreads() {
  try {
    const res = await fetch("/threads");
    if (!res.ok) return;
    known = (await res.json()).items || [];
  } catch { return; }
  threadsEl.textContent = "";
  threadsEmpty.hidden = known.length > 0;
  for (const t of known) {
    const li = el("li", "thread" + (t.client_thread_id === threadId ? " current" : ""));
    const open = el("button", "open"); open.type = "button"; open.disabled = busy;
    const av = el("div", "avatar"); paintAvatar(av, agentName);
    const text = el("div", "text");
    text.append(el("span", "title", t.title || "(untitled)"), el("span", "sub", (t.message_count || 0) + (t.message_count === 1 ? " message" : " messages")));
    open.append(av, text, el("span", "when", listTime(t.updated_at)));
    open.addEventListener("click", () => openThread(t));
    const forget = el("button", "forget", "Forget"); forget.type = "button"; forget.disabled = busy;
    forget.setAttribute("aria-label", "Forget this chat: " + (t.title || "untitled"));
    forget.addEventListener("click", () => forgetThread(t, forget));
    li.append(open, forget);
    threadsEl.appendChild(li);
  }
}
async function openThread(t) {
  if (busy) return;
  const res = await fetch("/threads/" + encodeURIComponent(t.id) + "/messages");
  if (!res.ok) { note("error", "Could not open that chat (" + res.status + ")."); return; }
  const items = (await res.json()).items || [];
  clearLog(); statusEl.textContent = "Runs on your Keep host";
  items.forEach((m, i) => {
    const side = m.role === "user" ? "me" : m.role === "assistant" ? "agent" : null;
    const when = m.at ? new Date(m.at) : new Date();
    if (side) {
      const li = bubble(side, String(m.text ?? ""), Number.isNaN(when.getTime()) ? new Date() : when);
      if (side === "me") { li.tick.textContent = "✓✓"; if (items.slice(i + 1).some((n) => n.role === "assistant")) li.tick.classList.add("read"); }
    } else note("meta", String(m.text ?? ""));
  });
  lastMine = [];
  threadId = t.client_thread_id; remember(threadId);
  toBottom(); refreshThreads(); leaveList(); input.focus();
}
async function forgetThread(t, button) {
  if (busy) return;
  if (!button.classList.contains("sure")) {   // two clicks, so a stray one deletes nothing
    button.classList.add("sure"); button.textContent = "Sure?";
    setTimeout(() => { button.classList.remove("sure"); button.textContent = "Forget"; }, 3000);
    return;
  }
  const res = await fetch("/threads/" + encodeURIComponent(t.id), { method: "DELETE" });
  if (!res.ok) { note("error", "Could not forget that chat (" + res.status + ")."); return; }
  if (t.client_thread_id === threadId) newChat();
  refreshThreads();
}
function newChat() { threadId = crypto.randomUUID(); remember(threadId); clearLog(); statusEl.textContent = "Runs on your Keep host"; refreshThreads(); leaveList(); input.focus(); }
function leaveList() { app.classList.remove("show-list"); }

// ---- a run over AG-UI ----
async function run(text, retried) {
  const res = await fetch("/agui", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, runId: crypto.randomUUID(), messages: [{ id: crypto.randomUUID(), role: "user", content: text }], state: {}, forwardedProps: {} }),
  });
  if (res.status === 409 && !retried) { threadId = crypto.randomUUID(); remember(threadId); return run(text, true); }   // the thread belongs to another agent (the server keeps a thread with one agent): start a new one
  if (!res.ok) { note("error", "The Keep host answered " + res.status + ": " + (await res.text()).slice(0, 300)); return; }
  markMine("sent");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", bubbleEl = null, sawText = false;
  const handle = (e) => {
    switch (e.type) {
      case "RUN_STARTED": markMine("taken"); setBusy(true, "working…", true); showTyping(true); break;
      case "MESSAGES_SNAPSHOT": break;   // the page already shows this conversation
      case "TEXT_MESSAGE_START": showTyping(false); markMine("read"); bubbleEl = bubble("agent", ""); sawText = true; break;
      case "TEXT_MESSAGE_CONTENT": {
        if (!bubbleEl) { showTyping(false); bubbleEl = bubble("agent", ""); }
        const stick = nearBottom();
        bubbleEl.firstChild.textContent += e.delta;
        if (stick) toBottom();
        break;
      }
      case "TEXT_MESSAGE_END": bubbleEl = null; break;
      case "CUSTOM":
        if (e.name === "keep.approval_requested") { showTyping(false); note("notice", "Waiting for your approval: " + String((e.value || {}).prompt ?? "") + "\nDecide it on your device; this chat cannot approve or deny."); setBusy(true, "waiting for your approval", true); }
        else if (e.name === "keep.waiting") setBusy(true, "waiting…", true);
        else if (e.name === "keep.event") note("meta", String((e.value || {}).kind ?? "event"));
        break;
      case "RUN_FINISHED":
        showTyping(false); markMine("read");
        if (!sawText && e.result !== undefined && e.result !== null) bubble("agent", typeof e.result === "string" ? e.result : JSON.stringify(e.result, null, 2));
        setBusy(false, "");
        break;
      case "RUN_ERROR": showTyping(false); note("error", String(e.message || "The run failed") + (e.code ? " (" + e.code + ")" : "")); setBusy(false, ""); break;
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
  bubble("me", text);
  setBusy(true, "sending…", true);
  try { await run(text, false); }
  catch (err) { showTyping(false); note("error", "Could not reach the chat server: " + err.message); }
  finally { showTyping(false); setBusy(false, ""); input.focus(); refreshThreads(); }
});
input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); } });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 136) + "px"; });
$("new").addEventListener("click", () => { if (!busy) newChat(); });
$("back").addEventListener("click", () => { app.classList.add("show-list"); });
input.focus();
refreshHello();
// on load: reopen the remembered conversation if the host still has it
refreshThreads().then(() => { const t = known.find((x) => x.client_thread_id === threadId); if (t) openThread(t); });
