---
sidebar_position: 10
---

# AG-UI: drive a Keep agent from a chat client

`POST /v1/agui` lets a chat client that speaks the [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui) talk to an agent that runs in a sealed cell. The client posts a
`RunAgentInput` and reads a stream of server-sent events. Keep maps the run onto a session; it adds no new authority. Sessions are started and steered through the same code as
`POST /v1/sessions` and `POST /v1/sessions/{id}/steer`, so scopes, quotas, tenancy and the agent's own policy apply unchanged, and a user token needs the `run` scope.

```bash
curl -N -X POST "$KEEP_API/v1/agui" -H "Authorization: Bearer $KEEP_TOKEN" -H 'content-type: application/json' -d '{
  "threadId": "t-1", "runId": "r-1",
  "messages": [{"id": "m1", "role": "user", "content": "What is the total due?"}],
  "forwardedProps": {"agent": "model-agent"}
}'
```

`forwardedProps.agent` names a deployed Keep agent. In a CopilotKit or other AG-UI client, point the HTTP agent at this URL and put the agent name in `forwardedProps`.

## A small web chat: `scripts/keep-chat.py`

No chat framework needed to try it. `keep-chat.py` serves one static page and forwards exactly one route to `/v1/agui`:

```bash
KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=... ./scripts/keep-chat.py --agent echo-agent      # then open http://127.0.0.1:8787
```

Your token stays in that process; the browser never sees it. The agent is fixed by `--agent` (the page cannot choose another), nothing else on the host is reachable through it, it listens on `127.0.0.1` only and refuses a
foreign `Host` or `Origin`. The page renders text with `textContent` only, streams the reply as it arrives, starts a new thread when the agent has finished the last one, shows an approval request as a notice, and cannot approve it.
It is the lightest client, not a product: one agent, one conversation, no history. With `scripts/keep-demo-local.sh` (a simulator, not sealed) the example agent is already deployed.

## What happens

- **A thread is one session.** The first run on a `threadId` starts the agent's session with `{"message": <latest user text>, "threadId": ..., "state": ...}` as its input. Later runs on the same thread
  **steer** the running session with the new message. If the thread's session has ended the run is refused (409): start a new thread. A thread belongs to the caller: two users who pick the
  same `threadId` never share a session.
- **Events.** The agent's session events become AG-UI events:

| Keep session event | AG-UI events |
|---|---|
| (start) | `RUN_STARTED` |
| `session.log`, stdout | `TEXT_MESSAGE_START` (once), `TEXT_MESSAGE_CONTENT` per line |
| `session.log`, stderr | `CUSTOM` `keep.log` (not assistant text) |
| `session.waiting`, `session.running` | `CUSTOM` `keep.waiting`, `keep.running` |
| an event the agent emitted with `ctx.emit` | `CUSTOM` `keep.event` with `{kind, data}` |
| `approval.requested` | `TEXT_MESSAGE_END` if open, then `CUSTOM` `keep.approval_requested` with the prompt |
| `session.result` | a text message if the result is a string, then `RUN_FINISHED` with `result` |
| `session.failed`, `cancelled`, `expired`, `deleted` | `RUN_ERROR` with a `code` |

## What it cannot do, on purpose

**A chat client cannot approve or deny anything.** An approval the agent asks for is shown as a `CUSTOM` event so the user knows to look, and it is decided on the user's own device through
`/v1/approvals` (in Solvor: with Touch ID). Nothing sent to this endpoint can decide one.

Not implemented: tool-call events, `STATE_SNAPSHOT` / `STATE_DELTA`, `MESSAGES_SNAPSHOT`, and token-level streaming of a model's reply (text arrives per stdout line or as the final result). A
run reconnects by posting again; there is no separate resume call.

## Prerequisite: agent sessions need IP networking

`/v1/agui` drives an **agent session**, not a one-click use case. Use-case cells talk to the host over vsock and need no IP networking; an agent session reaches the runtime's egress broker over the network, so the host must
be set up for it (a FluxVM tap+netns network, or `ZYVOR_AGENT_EGRESS_ADVERTISE_HOST` set to an address the guest can reach). On a host that is only set up for use cases the run ends with a `RUN_ERROR` carrying the
runtime's message (`sandbox did not report a default gateway; use tap+netns or set ZYVOR_AGENT_EGRESS_ADVERTISE_HOST`). Try it first with [`echo-agent`](../../examples/keep-agents/echo-agent/README.md), which needs no model or credentials.

## Verified, and what is not

- The events are validated against the official `@ag-ui/core` 1.0.0 schemas (`EventSchemas`) with ordering checks (RUN_STARTED first, balanced text messages, one terminal event last) in
  `agent-runtime/tests/agui-conformance.mjs`, run by `demos-ci.sh` against a real runtime and a stub cell with a real agent (`model-agent`). Unit tests cover the event mapping, thread isolation and the
  route's authorisation (a user token may POST `/v1/agui`, and nothing else on that path).
- **The chat page and its proxy:** 8 unit tests against a fake host (`agent-runtime/tests/keep-chat-test.py`: token added server-side, agent fixed, events streamed as they arrive, foreign host and origin refused, size and JSON limits, errors passed through),
  a `demos-ci.sh` check against a real runtime and a stub cell, and the page driven in a real browser (typed text is shown literally, the agent's progress note and reply appear, a second message after the agent finished starts a new thread).
- **On the real lab host (FluxVM, Keep mode):** a signed agent was deployed and a run posted. The host is set up only for use cases, so the run ended with the runtime's own refusal, delivered as a valid `RUN_ERROR` (the stream
  validated against the `@ag-ui/core` schemas). That checks the endpoint, the authorisation and the error path on a real host; **the successful path on a real cell is not tested**, because that host has no agent networking.
- **Not tested:** an actual CopilotKit or other AG-UI client, and a successful run on a real FluxVM cell.
