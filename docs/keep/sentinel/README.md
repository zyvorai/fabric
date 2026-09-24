# Keep Sentinel — policy schema

Policy is a **signed file** you can diff in git. Unsigned policy must not load.

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

Ed25519 over the canonical YAML bytes (same family as FluxVM catalog signers).
The load path verifies against device-trusted public keys before applying.
