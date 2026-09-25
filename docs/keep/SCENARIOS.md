---
sidebar_position: 8
---

# Scenarios

Ready-made use cases for common jobs. Each is a `pack.json` under
[`examples/keep-agents/`](../../examples/keep-agents/): copy one, change the keywords, deploy it. None of them needs
code, and the extractive ones call no model, so the cell reports `0` outbound connections.

**Prerequisite:** a cell template. Bake `node22-agent` once on the FluxVM host:
`./scripts/keep-bake-node22-agent.sh` ([template](../../agent-runtime/templates/node22-agent/README.md)).

```bash
./scripts/keepctl deploy examples/keep-agents/<name> --test     # deploy, then run its sample
```

## The scenarios

| Pack | You drop in | You get | Reads with | Sample |
|---|---|---|---|---|
| [`status-page-watch`](../../examples/keep-agents/status-page-watch/README.md) | a saved vendor status page (`.html`) | what is down, degraded, under maintenance, recovered, and the times | `html` | yes |
| [`mailbox-triage`](../../examples/keep-agents/mailbox-triage/README.md) | a mail export (`.mbox`, `.eml`) | subjects, senders, and lines about replies, money, meetings | `eml` | yes |
| [`api-facts`](../../examples/keep-agents/api-facts/README.md) | a JSON document | the fields you named, by path | `text` + `json_path` | yes |
| [`expense-sheet`](../../examples/keep-agents/expense-sheet/README.md) | an Excel sheet (`.xlsx`) | top categories and vendors, the first rows | `xlsx` | no |
| [`nda-review`](../../examples/keep-agents/nda-review/README.md) | a Word contract (`.docx`) | term, confidentiality, liability and governing-law passages; durations and amounts | `docx` | no |
| [`invoice-model-brief`](../../examples/keep-agents/invoice-model-brief/README.md) | an invoice PDF | rule sections **plus a generated summary** | `pdftotext` + model | no |
| [`meeting-notes-model`](../../examples/keep-agents/meeting-notes-model/README.md) | a transcript (`.txt`, `.vtt`) | decisions and actions **plus a generated summary** | `text` + model | yes |

The two model packs send the extracted text to an endpoint **you** allow, after **you** approve it once. Out of the
box they are refused, because the vault has no such credential. See [MODEL.md](MODEL.md).

Already built in (no pack needed): `pdf-brief`, `contract-clauses`, `security-questionnaire`, `meeting-actions`,
`log-triage`, `sbom-summary`, `csv-clean`. See [demos/](demos/README.md).

## Ways to feed them

| You want | Use |
|---|---|
| One file now | the console at `/app/keep`, or `keepctl run <pack> <file>` |
| A month of files | `keepctl run <pack> a.xlsx b.xlsx c.xlsx` (one cell per file), or one **zip** of them |
| Files that arrive in a directory | a **folder trigger**: `keepctl trigger add-folder <pack> inbox 30` |
| A system that can POST | a **webhook trigger**: `keepctl trigger add-webhook <pack>` |
| To see what changed since last time | **Keep history → Runs → Compare selected** |
| A ping when it finishes | set `ZYVOR_AGENT_APPROVAL_WEBHOOK`; runs send `run.finished` / `run.failed` |

All of it is described in [TRIGGERS.md](TRIGGERS.md).

## Recipes

**Incident log bundle.** Zip the logs from a host, then `keepctl run log-triage incident.zip`. Each `.log` and
`.txt` inside runs in its own sealed cell, and you get one `triage.md` per file under one batch id.

**Vendor contracts in bulk.** `keepctl run contract-clauses a.pdf b.pdf c.pdf` for PDFs, or deploy
[`nda-review`](../../examples/keep-agents/nda-review/README.md) for Word files. Compare two versions of one contract
in **Keep history**.

**Daily status check.** A cron job fetches the vendor status page and posts it to a webhook trigger for
`status-page-watch`. Keep does not fetch pages itself; you give it the file.

**A drop folder for expenses.** Set `ZYVOR_AGENT_WATCH_ROOT`, add a folder trigger for `expense-sheet`, and save
each month's `.xlsx` into that folder. Each file runs once.

## Test them on a real host

`agent-runtime/tests/demos-ci.sh` uses a FluxVM stand-in. To run the scenarios in **real cells**, bake the template
and point the live script at your runtime:

```bash
export KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=...
./scripts/keep-live-scenarios.sh            # built-ins, scenario packs, batch, zip, webhook trigger, history
./scripts/keep-live-scenarios.sh --quick    # a smaller run
```

It deletes the custom use cases it created. Evidence class stays `software-test`: a passing run shows the runtime,
the cell and the extractors work, not that the host cannot read the VM. The model step is not part of this script
because it needs an endpoint you allow; [MODEL.md](MODEL.md) describes how to test it.

## Making your own

Copy the closest pack, change `title`, `accepts` and the rules, and follow
[Tutorial 19](../tutorials/19-build-your-own-use-case.md). The extractors and rules are listed in
[PACKS.md](PACKS.md).
