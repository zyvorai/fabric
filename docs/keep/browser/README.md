# Brokered browser

- Chromium remote-debugging HTTP listings only (`/json`, `/json/list`, `/json/version`,
  `/json/protocol`) — no raw DOM dump, no mutating DevTools paths.
- Operator **live view**: `GET /v1/sessions/{id}/browser/view` and
  `/keep/browser?session=<uuid>` show open tab titles/URLs. Console Keep session
  (`/app/keep/:sessionId`) also polls the listing. WebSocket debugger URLs are
  stripped from listing responses so the operator cannot drive CDP from this API.
- **Screenshot:** `GET /v1/sessions/{id}/browser/screenshot` — one JPEG via host CDP.
- **Screencast:** `WS /v1/sessions/{id}/browser/screencast` (agent-runtime) and
  fabricd `WS /ws/sessions/{id}/browser/screencast?token=` (JWT) — frames only;
  operator may send `stop` / `ack` / `ping`. Input takeover is refused.
- FluxVM bridge: `GET /v1/sandboxes/{id}/ws/{port}/{*path}`.
- Lab proof (CDP stub): [pilot-runs/20260924T190954Z](../pilot-runs/20260924T190954Z/).
- Bake Chromium template: [`scripts/keep-bake-browser-agent.sh`](../../scripts/keep-bake-browser-agent.sh).
- Honesty remains **software-test**.
