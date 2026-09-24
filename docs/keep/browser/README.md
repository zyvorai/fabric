# Brokered browser

- Chromium remote-debugging HTTP listings only (`/json`, `/json/list`, `/json/version`,
  `/json/protocol`) — no raw DOM dump, no mutating DevTools paths.
- Operator **live view**: `GET /v1/sessions/{id}/browser/view` and
  `/keep/browser?session=<uuid>` show open tab titles/URLs. Console Keep session
  (`/app/keep/:sessionId`) also polls the listing. WebSocket debugger URLs are
  stripped from listing responses so the operator cannot drive CDP from this API.
- **Screenshot (Keep 0.2 scaffolding):** `GET /v1/sessions/{id}/browser/screenshot`
  (fabricd: `/api/sessions/{id}/browser/screenshot`) opens a short-lived CDP
  session through FluxVM `GET /v1/sandboxes/{id}/ws/{port}/{*path}` and returns
  one JPEG. Input / takeover are still not exposed.
- `/keep/browser` polls listing + screenshot. Honesty remains **software-test**.
- Per-site disposable profiles remain a product goal; template recipes live under
  `agent-runtime/templates/browser-agent/`.
