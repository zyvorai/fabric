---
name: keep-policy
description: Write, sign and load a Keep Sentinel policy (keep.policy.yaml). Use when asked to allow or deny an agent's network access, tighten egress, or set which actions need approval.
---

# Keep policy

Reference: `docs/keep/sentinel/README.md`, example `docs/keep/sentinel/keep.policy.yaml`.

## Shape

```yaml
version: 1
default_egress: deny
allow:
  - { host: api.github.com, methods: [GET], action: read, ask: first }
deny:
  - { host: "*.onion" }
taint:
  on_untrusted_page: block_egress_until_ask
```

- `default_egress`: keep it `deny`. Only change it if the user explicitly asks.
- `allow[]`: one entry per host. List the narrowest `methods`. `ask` is `always`, `first` or `never`; use `always` for anything that spends money or sends data out.
- `deny[]`: host patterns that are always refused; deny wins.

## Load it

Keep mode (`ZYVOR_AGENT_KEEP_MODE=1`) refuses unsigned policy. The signature is Ed25519 over the exact bytes of the file, so do not reformat the YAML after signing.

```bash
./agent-runtime/target/release/examples/keep_sign_policy sign "$SEED" keep.policy.yaml > keep.policy.yaml.sig
./scripts/keepctl policy set <agent> keep.policy.yaml keep.policy.yaml.sig
keepctl policy show <agent>
```

## Drafting from denials

If an agent was blocked from hosts it needs, `keepctl policy suggest <agent> draft.yaml` lists the denied hosts and writes a draft policy with a narrow `allow` entry (`ask: always`) for each. Read the draft with the user, remove anything not wanted, then sign and load it as above. Suggestions marked `NEEDS ACK` are not in the draft; do not add them without the user asking.

## Before proposing a change

Tell the user, in plain words, what the change adds: new hosts, new methods, wider `ask`, wildcards. Flag any host that is a private address, a cloud metadata address, or a wildcard. Never sign a policy yourself; the signing seed is the owner's.
