# Keep goals, plans, and artifacts

Thin product loop on agent-runtime (not a separate platform):

| Object | API | Notes |
|---|---|---|
| Goal | `POST/GET /v1/goals`, `GET/PATCH /v1/goals/{id}` | State-dir JSON (`goals.json`) |
| Plan step | embedded on goal; `POST /v1/goals/{id}/advance` | `pending` / `running` / `blocked` / `done` / `skipped` |
| Artifact | `POST/GET /v1/artifacts`, `GET /v1/artifacts/{id}` | Reports; soft-refuses secret-shaped bodies |
| Approval | reuse `/v1/approvals` | Advance to done with `requires_approval` + `session_id` opens a pending approval and blocks the step. Asking again returns 409 while it is pending; a denied or expired approval keeps the step blocked; only an approved one lets the step finish. A cancelled goal cannot be advanced |

Sessions still execute work. Goals orchestrate status and evidence, and a goal that opts in can also **run its own plan** (next section). Cockpit
(`GET /v1/sessions/{id}/cockpit`) includes `active_goal` and `recent_artifacts`
hrefs.

## The goal worker (opt-in)

Set `"autorun": true` when creating a goal (or `PATCH` it later) and a background worker runs the plan **one step at a time**, so nobody has to call `advance`.
A goal that does not say `autorun` is never touched by the worker, and `PATCH {"autorun": false}` pauses one at once (no further step starts).

```bash
curl -X POST "$KEEP_API/v1/goals" -H "Authorization: Bearer $OPERATOR_TOKEN" -H 'content-type: application/json' -d '{
  "title": "Weekly report", "agent": "report-agent", "user_id": "ana", "autorun": true, "max_attempts": 3,
  "plan": [
    {"title": "Collect", "input": {"folder": "inbox"}},
    {"title": "Draft the summary", "requires_approval": true},
    {"title": "File it", "input": {"to": "archive"}}
  ]
}'
```

For the first step that is not done or skipped the worker does exactly one thing per look (every `ZYVOR_AGENT_GOAL_TICK_MS`, default 5000 ms):

| The step is | The worker |
|---|---|
| pending | starts a session of the goal's agent with the step's `input` (or the goal and step titles: `message`, `goal`, `step`). The session request id is `goal:<goal>:<step>:<attempt>`, so a restart while starting one finds the session it already made. Runs as the goal's `user_id`, with that user's run quota; a quota refusal is not an attempt, the worker just looks again later. |
| running, its session completed | marks it done, or, if the step has `requires_approval`, opens an approval bound to the step's session (`kind: send`) and blocks the step (`blocked_on: approval`). |
| running, its session failed, was cancelled or expired | tries again after a delay that doubles (`ZYVOR_AGENT_GOAL_RETRY_BASE_SECS`, default 15 s, at most 10 min), up to `max_attempts` (default 3, 1 to 10); then blocks the step and the goal with `failed after N attempts: <error>` (`blocked_on: failure`). |
| waiting for approval | approved: done. Denied or expired: stays blocked (`blocked_on: rejected`) and **the worker never goes past a refusal**. |
| blocked for any other reason | nothing: a blocked step is never retried by the worker. |

An approval step here is a **checkpoint after the step ran**, before the goal moves on (an approval needs a session, and that is how the user's ownership of it is decided). It does **not** gate the step's own actions: a real send or purchase is decided where it happens, at the egress broker (a credential with `requires_approval`), which every step's session goes through like any other.

What the worker never does: widen any authority (a step's session is an ordinary session with every policy, quota and approval of one started by hand), approve anything itself, run two steps of a goal at once, or retry what it blocked. Cancelling the goal (`PATCH {"status":"cancelled"}`) cancels the running step's session. A goal with `autorun` refuses `advance` (409) so two hands never move one goal; pause it first if you want to.
Each start, retry, block and completion is journaled (`keep.goal.step.started`, `.retry`, `.blocked`, `.done`, `.approval`, `.cancelled`) with ids and reasons, never step inputs.

**Known limits.** Goals and their routes are operator-only today (a user token cannot create one), so for now an operator creates goals on a user's behalf. The worker looks at goals on a timer (a step starts up to one tick after the last one ends). It has no planner: the plan is what you give it (a model proposing steps for the person to accept is not built). Updates race with a concurrent `PATCH` in a small window: the worker re-reads the goal before saving and drops its move if the step or the cancellation changed, and the next tick looks again.
**Tests.** `goal_worker::tests` (9: every move of the state machine, with three mutation checks: a refusal counted as approval, retries ignoring `max_attempts`, and a blocked failure being restarted each fail a test), `goals::tests` (creation limits, no hand-advancing an autorun goal), and `demos-ci.sh` against a real runtime and the stub cell: a two-step plan runs in order with each step's own input and refuses a hand on it; a failing agent is retried and then blocks the goal with the reason while the next step never starts and nothing retries after the block; an approval step waits, approval finishes the goal, denial stops it for good; a goal without `autorun` is left alone, switching it on runs it, pausing stops further steps.

Packaged agents: [`examples/keep-agents/`](../../examples/keep-agents/).
Demo: [`./scripts/keep-pack-demo.sh`](../../scripts/keep-pack-demo.sh).

See also [PRODUCTION.md](../PRODUCTION.md) and [Tutorial 16](../../tutorials/16-keep-workstation.md).
