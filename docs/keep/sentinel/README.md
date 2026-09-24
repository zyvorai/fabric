# Keep Sentinel — policy schema

Policy is a **signed file** you can diff in git.

**Keep mode** (`ZYVOR_AGENT_KEEP_MODE=1`): runtime refuses to start without
`ZYVOR_AGENT_POLICY_TRUSTED_SIGNERS`, and every `PUT …/policy` must carry
`X-Keep-Policy-Signature`. Unsigned policy must not load.

Without Keep mode, signatures are required only when trusted signers are configured
(unless `ZYVOR_AGENT_POLICY_REQUIRE_SIGNATURE=0`).

## Example (`keep.policy.yaml`)

```yaml
version: 1
default_egress: deny
allow:
  - { host: api.stripe.com, methods: [POST], action: checkout, ask: always }
  - { host: api.github.com, methods: [GET],  action: read,     ask: first }
deny:
  - { host: "*.onion" }
taint:
  on_untrusted_page: block_egress_until_ask
```

## Fields

| Field | Meaning |
|---|---|
| `default_egress` | `deny` (default) or `allow` |
| `allow[]` | host / methods / action / ask (`always` \| `first` \| `never`) |
| `deny[]` | host patterns always refused |
| `taint.on_untrusted_page` | `block_egress_until_ask` — cockpit paints the process red |

## Signature

Ed25519 over the exact YAML bytes the API receives (`X-Keep-Policy-Signature: <hex>`).

```bash
./agent-runtime/target/release/examples/keep_sign_policy sign "$SEED" keep.policy.yaml \
  > keep.policy.yaml.sig
./scripts/keepctl policy set <agent> keep.policy.yaml keep.policy.yaml.sig
```

See [PRODUCTION.md](../PRODUCTION.md) and [Tutorial 16](../../tutorials/16-keep-workstation.md).
