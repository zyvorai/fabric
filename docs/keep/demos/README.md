# Keep one-click demos

Drop an untrusted file into a sealed cell, get an artifact back. Every demo runs with
**no browser** and expects **0 CONNECT**. If the audit journal ever shows an outbound
connection, the run fails closed: the session is frozen with `agent_paused_reason: ebpf_deny`
and the API returns `409`.

| Demo | Input | Artifact | Page |
|---|---|---|---|
| `pdf-brief` | PDF | `brief.md` | [pdf-brief.md](pdf-brief.md) |
| `contract-clauses` | contract PDF | `clauses.md` | [contract-clauses.md](contract-clauses.md) |
| `security-questionnaire` | questionnaire PDF | `answers.md` | [security-questionnaire.md](security-questionnaire.md) |
| `meeting-actions` | `.txt` / `.vtt` transcript | `actions.md` | [meeting-actions.md](meeting-actions.md) |
| `log-triage` | `.log` / `.txt` | `triage.md` | [log-triage.md](log-triage.md) |
| `sbom-summary` | CycloneDX / SPDX / SARIF JSON | `summary.md` | [sbom-summary.md](sbom-summary.md) |
| `csv-clean` | `.csv` | `clean.csv` + `report.md` | [csv-clean.md](csv-clean.md) |

## One API for all of them

```bash
./scripts/keep-demo.sh list                 # what this runtime offers
./scripts/keep-demo.sh csv-clean            # built-in sample
./scripts/keep-demo.sh log-triage app.log   # your own file
```

| Surface | Path |
|---|---|
| Console | `/app/keep` (pick a use case) |
| Runtime API | `GET /v1/demos`, `POST /v1/demos/{id}` (multipart field `file`) |
| fabricd proxy | `GET /api/demos`, `POST /api/demos/{id}` (JWT) |
| Registry | `agent-runtime/src/demos.rs` (`DEMOS`) |
| Builders | `agent-runtime/src/demo_builders.rs` |

## What "extractive" means

The guest runs one fixed command to pull text out of the upload (`pdftotext`, or `head`
for text formats). The summary is then built **on the host** with plain string handling.
No model is called, nothing found in the file is executed, opened or sent, and every
untrusted line is defanged before it lands in markdown. A model-written summary would
need a model socket, which these demos deliberately do not use.

## Adding a use case

1. Add a builder to `demo_builders.rs` (`fn(filename, extract) -> BuildResult`) with a
   unit test that feeds it a small fixture.
2. Add a `DemoSpec` to `DEMOS` in `demos.rs`: accepted extensions, the fixed guest file
   name and extract command, a size limit, and a built-in sample.
3. Add `examples/keep-agents/<id>/` (pdf-brief shape) and `docs/keep/demos/<id>.md`.

The console picker, the fabricd proxy and `keep-demo.sh` pick the new demo up without
further changes. A demo that needs the network or a browser is not this shape; use a
pack with an allowlist instead.

Honesty: evidence class stays `software-test`; zero CONNECT is a Keep audit claim, not
"the operator cannot read the cell".
