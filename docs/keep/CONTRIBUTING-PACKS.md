---
sidebar_position: 6
---

# Contributing a use-case pack

A use case is one small JSON file, so this is the easiest way to contribute. The full field reference is [PACKS.md](PACKS.md); this page is the
process. The starting point is [`pack-template/`](pack-template/) (a valid pack you can copy).

## The five steps

1. **Pick a file a real person has** and can get without a developer (an export, a statement, a report). Write down the command or menu that produces it: it goes in the README.
2. **Copy the template** to `examples/keep-agents/<your-pack>/` and rename `name` (lowercase letters, digits, `-`, at most 40 characters).
3. **Write a synthetic sample** (`sample.txt`, `.csv`, `.eml`, `.mbox` or `.html`). **Never commit real data**: invent names, use example domains and fake identifiers.
   Text-based extractors can carry a sample; PDF, Word, Excel, PowerPoint and photos cannot, so those packs are deploy-tested only.
4. **Choose the rules** (`keyword_sections`, `regex_extract`, `csv_columns`, `table`, `stats`, `json_path`). Keep each pattern under 200 characters, each pack under 20 rules. If a pattern needs to be longer, split it in two rules.
5. **Prove it**, then open the PR:

```bash
cargo test --manifest-path agent-runtime/Cargo.toml --lib every_shipped     # validates every shipped pack with the runtime's own checks
./scripts/keepctl deploy examples/keep-agents/<your-pack> --dry-run
./scripts/keepctl deploy examples/keep-agents/<your-pack> --test           # runs the sample in a real cell (needs a Keep host)
```

## What a good pack looks like

- The description says what goes in and what comes out in one sentence. The README says how to get the file, what the pack does not read, and repeats the `software-test` caveat.
- The sample makes every rule produce something, so the test can assert on it. Add a check to `agent-runtime/tests/demos-ci.sh` next to the others (`pack_test <name> <artifact>`), asserting a line the pack should print.
- It is extractive. A model step is possible but needs an explicit endpoint and is off unless the operator allows it ([MODEL.md](MODEL.md)).
- It claims only what it does. No "compliance", no "accurate", no "secure". Say what it reads.

## Then

Add the pack to the tables in [SCENARIOS.md](SCENARIOS.md) and a line to the changelog. The website gallery ([`/keep/packs`](https://zyvorai.github.io/fabric/keep/packs)) and
the Solvor catalogue are generated from the packs, so you do not edit them by hand (`npm run gen:packs` in `website/`, `python3 integrations/macos-keep/tools/gen_catalog.py`).

## Good first packs

Things people ask for that are not shipped yet, each a good first contribution: a payslip or salary-slip text export, a Google Takeout activity summary, a Kindle or
Notion export digest, an Android call-log CSV, a fuel or toll receipt photo, a school fee receipt photo, a health-insurance claim mail, a rent receipt. Open an issue first if
you want to claim one.
