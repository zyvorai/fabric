# PDF brief demo

One-click Keep demo: **PDF in → `brief.md` out.** No browser. Expect **0 CONNECT**.

## Surfaces

| Surface | Path |
|---|---|
| Console | `/app/keep` → **Brief this PDF** |
| Script | `./scripts/keep-demo-pdf.sh [file.pdf]` |
| Runtime API | `POST /v1/demos/pdf-brief` (multipart field `pdf`, optional) |
| fabricd proxy | `POST /api/demos/pdf-brief` (JWT) |
| Pack | [`examples/keep-agents/pdf-brief/`](../../examples/keep-agents/pdf-brief/) |

## Pass bar

- Artifact `brief.md` in the session  
- Cockpit `egress_connects == 0`  
- On failure (CONNECT > 0): session `agent_paused_reason: ebpf_deny` + FluxVM freeze  
- Evidence class remains `software-test`

## Requirements

- FluxVM reachable; agent-runtime `/healthz`  
- Template `node22-agent` with `pdftotext` (poppler)  
- Strict confinement applied (`deny_udp` + gateway-only broker/proxy ports) — see [confine.md](../confine.md)

## Honesty

PacketWolf is optional. Zero CONNECT is a **Keep audit** claim (plus FluxVM
`drop_reasons` when the dataplane is attached). Do not claim wire product
surfaces you did not attach.

Hands-on: [Tutorial 17](../../tutorials/17-keep-pdf-brief.md).
