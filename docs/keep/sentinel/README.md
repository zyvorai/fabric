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

## Risk check on policy changes

Every `PUT …/policy` is compared with the policy the agent runs now, after the signature check. The check is
syntactic: it reports what the change *adds*, and it is not a proof of what a cell can reach.

| Severity | Codes |
|---|---|
| High | `default_egress_allow`, `metadata_host`, `private_ip_host`, `wildcard_all_hosts`, `methods_widened` (a write method added, or the methods list dropped), `approval_weakened`, `taint_guard_removed` |
| Medium | `internal_name_host`, `wildcard_host`, `new_host_any_method`, `new_write_host_no_approval`, `deny_removed`, `methods_widened` (read methods only) |
| Info | `new_host` |

A change with a High finding is refused with `409` and the reasons. Review it, then resend with
`X-Keep-Policy-Ack-Risk: 1` (`KEEP_POLICY_ACK_RISK=1 keepctl policy set …`). The response lists every finding under
`risks`, and the audit row `keep.policy.set` records the codes and whether they were acknowledged. Per-host checks
run for newly added hosts only, so an unchanged entry does not block later edits.

## Signature

Ed25519 over the exact YAML bytes the API receives (`X-Keep-Policy-Signature: <hex>`).

```bash
./agent-runtime/target/release/examples/keep_sign_policy sign "$SEED" keep.policy.yaml \
  > keep.policy.yaml.sig
./scripts/keepctl policy set <agent> keep.policy.yaml keep.policy.yaml.sig
```

See [PRODUCTION.md](../PRODUCTION.md) and [Tutorial 16](../../tutorials/16-keep-workstation.md).
