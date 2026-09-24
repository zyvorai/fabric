# Brokered browser

- Chromium remote-debugging HTTP listings only (`/json`, `/json/list`, `/json/version`,
  `/json/protocol`) — no raw DOM dump, no mutating DevTools paths.
- Operator **live view** (Keep 0.1): `GET /v1/sessions/{id}/browser/view` and
  `/keep/browser?session=<uuid>` show open tab titles/URLs. Console Keep session
  (`/app/keep/:sessionId`) also polls the listing. WebSocket debugger URLs are
  stripped so the agent/operator cannot drive CDP from this API.
- fabricd proxies `GET /api/sessions/{id}/browser/view`.
- **Not in Keep 0.1:** screencast, input takeover, a11y-tree product UI. Those need
  a dedicated WebSocket bridge to the guest (tracked for a later release).
- Per-site disposable profiles remain a product goal; template recipes live under
  `agent-runtime/templates/browser-agent/`.
