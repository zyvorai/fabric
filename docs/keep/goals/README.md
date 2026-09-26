# Keep goals, plans, and artifacts

Thin product loop on agent-runtime (not a separate platform):

| Object | API | Notes |
|---|---|---|
| Goal | `POST/GET /v1/goals`, `GET/PATCH /v1/goals/{id}` | State-dir JSON (`goals.json`) |
| Plan step | embedded on goal; `POST /v1/goals/{id}/advance` | `pending` / `running` / `blocked` / `done` / `skipped` |
| Artifact | `POST/GET /v1/artifacts`, `GET /v1/artifacts/{id}` | Reports; soft-refuses secret-shaped bodies |
| Approval | reuse `/v1/approvals` | Advance to done with `requires_approval` + `session_id` opens a pending approval and blocks the step. Asking again returns 409 while it is pending; a denied or expired approval keeps the step blocked; only an approved one lets the step finish. A cancelled goal cannot be advanced |

Sessions still execute work. Goals orchestrate status and evidence. Cockpit
(`GET /v1/sessions/{id}/cockpit`) includes `active_goal` and `recent_artifacts`
hrefs.

Packaged agents: [`examples/keep-agents/`](../../examples/keep-agents/).
Demo: [`./scripts/keep-pack-demo.sh`](../../scripts/keep-pack-demo.sh).

See also [PRODUCTION.md](../PRODUCTION.md) and [Tutorial 16](../../tutorials/16-keep-workstation.md).
