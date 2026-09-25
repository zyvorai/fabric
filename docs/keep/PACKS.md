# Keep packs: `pack.json` reference

A **pack** is a directory with a `pack.json`. One file drives everything: the console,
`keepctl deploy`, `fabric-agent pack`, and the docs. Three kinds:

| `kind` | What it is | Deploy with |
|---|---|---|
| `usecase` | A declarative use case: an extractor and a few summary rules. **No code.** | console form / paste JSON, or `keepctl deploy <dir>` |
| `agent` | A TypeScript agent (`agent.ts`) with a manifest and an optional signed policy. Runs **inside the cell**. | `keepctl deploy <dir>`, or `keepctl bundle` then the console's **Deploy a pack** |
| `builtin` | Documents a use case the runtime already ships (`pdf-brief`, `csv-clean`, ...). Nothing to deploy. | `keepctl deploy <dir> --test` runs it |

A `pack.json` with no `kind` (the older `name` + `manifest` + `goal` shape) is an `agent` pack.

## `usecase`

```json
{
  "kind": "usecase",
  "name": "invoice-check",
  "title": "Invoice check",
  "description": "Pull totals and due dates out of a plain-text invoice.",
  "accepts": ["txt"],
  "extract": "text",
  "summary": [
    { "kind": "keyword_sections", "title": "Totals", "keywords": ["total", "amount due"], "max_lines": 5 },
    { "kind": "top_repeated_lines", "title": "Repeated lines", "top": 5 },
    { "kind": "stats", "title": "Size" }
  ],
  "artifact_title": "invoice-summary.md",
  "sample_file": "sample.txt"
}
```

| Field | Notes |
|---|---|
| `name` | 1-40 lowercase letters, digits, `-`. Becomes the use-case id. Cannot be a built-in id. |
| `accepts` | 1-6 lowercase extensions. `pdftotext` accepts only `pdf`; `text` cannot read `pdf`. |
| `extract` | `pdftotext` (needs poppler in the template) or `text`. **A fixed list, never a command.** |
| `max_bytes` | Upload limit. Text: up to 300 000 (default 200 000). PDF: up to 32 MiB (default 8 MiB). |
| `summary` | 1-20 rules (below). |
| `artifact_title` | Ends in `.md`; default `summary.md`. |
| `sample` / `sample_file` | Optional sample text (text extractors only, up to 200 KB) so the use case runs in one click. |

Rules (all bounded, evaluated on the host over the extracted text, no regex engine, no I/O):

| `kind` | Fields | Output |
|---|---|---|
| `keyword_sections` | `title`, `keywords` (1-40), `max_lines` (1-20, default 5) | Lines that mention any keyword (case-insensitive) |
| `top_repeated_lines` | `title`, `top` (1-20, default 5) | Most repeated lines, digits collapsed so near-duplicates group |
| `stats` | `title` (optional) | Line, non-empty line, word and character counts |
| `csv_columns` | `title`, `columns` (1-10), `top` (1-10, default 5) | Distinct count and most common values per column |

Unknown fields and unknown rule kinds are rejected. At most 50 custom use cases per runtime;
the whole spec is at most 64 KB.

## `agent`

```json
{
  "kind": "agent",
  "name": "infra-ops",
  "entry": "agent.ts",
  "manifest": { "template": "agent-node", "egress_mode": "ask", "confinement": "strict" },
  "goal": { "title": "Read alerts and VM inventory", "text": "Investigate; remediation waits for approval." }
}
```

`manifest` is passed to `POST /v1/agents` unchanged, so it uses the runtime's field names.
If the pack has a `keep.policy.yaml` it is applied after the deploy.

## Signing

In Keep mode (`ZYVOR_AGENT_KEEP_MODE=1`) the runtime only accepts a deploy signed by a trusted
signer. The signature is Ed25519 over the **exact bytes** of the request body (and over the
policy YAML for the policy).

```bash
export KEEP_POLICY_SEED=$(openssl rand -hex 32)      # your key; keep it private
node sdk/agent-runtime/src/cli.js pack keys           # public key: register it on the runtime
                                                      # as ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS
```

`fabric-agent pack` signs with Node's built-in crypto, so no Rust toolchain is needed. A Rust
test pins a Node-made signature against `keep_sign_policy`, so the two cannot drift. The seed
stays on your machine; the console only ever receives a finished, signed `.keeppack.json`.

## Where the boundary is

| Piece | Runs where |
|---|---|
| `usecase` extractor | In the cell: a fixed command, on a file at a fixed path |
| `usecase` rules | On the host, over bounded text; data only |
| `agent` code | In the cell only. Never on the host. |

Every run, either kind, keeps strict confinement (gateway-only egress, `deny_udp`) and the
0-CONNECT check: a connect freezes the session and returns `409`.
