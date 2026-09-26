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
| `approval.requested` | `TEXT_MESSAGE_END` if open, then `CUSTOM` `keep.approval_requested` with the prompt |
| `session.result` | a text message if the result is a string, then `RUN_FINISHED` with `result` |
| `session.failed`, `cancelled`, `expired`, `deleted` | `RUN_ERROR` with a `code` |

## What it cannot do, on purpose

**A chat client cannot approve or deny anything.** An approval the agent asks for is shown as a `CUSTOM` event so the user knows to look, and it is decided on the user's own device through
`/v1/approvals` (in Solvor: with Touch ID). Nothing sent to this endpoint can decide one.

Not implemented: tool-call events, `STATE_SNAPSHOT` / `STATE_DELTA`, `MESSAGES_SNAPSHOT`, and token-level streaming of a model's reply (text arrives per stdout line or as the final result). A
run reconnects by posting again; there is no separate resume call.

## Verified, and what is not

- The events are validated against the official `@ag-ui/core` 1.0.0 schemas (`EventSchemas`) with ordering checks (RUN_STARTED first, balanced text messages, one terminal event last) in
  `agent-runtime/tests/agui-conformance.mjs`, run by `demos-ci.sh` against a real runtime and a stub cell with a real agent (`model-agent`). Unit tests cover the event mapping, thread isolation and the
  route's authorisation (a user token may POST `/v1/agui`, and nothing else on that path).
- **Not tested:** against an actual CopilotKit or other AG-UI client, and against a live FluxVM cell.
