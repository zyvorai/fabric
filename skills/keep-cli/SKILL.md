---
name: keep-cli
description: Drive a Keep runtime with keepctl. Use when asked to run a Keep use case, deploy a pack, list runs or artifacts, read the audit journal, or check pending approvals.
---

# keepctl

`keepctl` is `scripts/keepctl`. Reference: `docs/keep/keepctl/README.md`.

## Setup

```bash
export KEEP_API=http://127.0.0.1:9096
export KEEP_TOKEN=...   # the runtime's ZYVOR_AGENT_API_TOKEN, never print it
```

## Common tasks

| Task | Command |
|---|---|
| What can this runtime run? | `keepctl list` |
| Run a use case on a file | `keepctl run csv-clean ./orders.csv` (exit code 2 means the cell made an outbound connection) |
| Many files | `keepctl run csv-clean jan.csv feb.csv` (one cell per file) |
| Past outputs | `keepctl artifacts --use-case csv-clean --since 2026-09-01T00:00:00Z` |
| What changed between runs | `keepctl diff <older-id> <newer-id>` |
| Journal for a session | `keepctl audit <session-uuid> --limit 20` (the hash-chain check prints to stderr) |
| Pending approvals | `keepctl approvals pending` |
| Deploy a pack | `keepctl deploy <dir>`; add `--test` to run a `builtin` pack |
| Triggers | `keepctl trigger add-webhook|add-folder|list|fire` (see `docs/keep/TRIGGERS.md`) |

## Rules

- Read `docs/keep/PACKS.md` before writing a `pack.json`. The `extract` field is a fixed list, never a command.
- Do not print, log or commit `KEEP_TOKEN`.
- Policy changes go through the `keep-policy` skill, not ad-hoc PUTs.
