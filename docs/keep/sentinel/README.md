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
| `allow[].rpc_methods` | JSON-RPC method names the request body may call (MCP: `tools/list`, `tools/call`, ...) |
| `allow[].mcp_tools` | For an MCP `tools/call`, the tool names (`params.name`) that may be called |
| `allow[].graphql_operations` | GraphQL operation types the body may run: `query`, `mutation`, `subscription` |
| `deny[]` | host patterns always refused |
| `taint.on_untrusted_page` | `block_egress_until_ask` — cockpit paints the process red |

## Risk check on policy changes

Every `PUT …/policy` is compared with the policy the agent runs now, after the signature check. The check is
syntactic: it reports what the change *adds*, and it is not a proof of what a cell can reach.

| Severity | Codes |
|---|---|
| High | `default_egress_allow`, `metadata_host`, `private_ip_host`, `wildcard_all_hosts`, `methods_widened` (a write method added, or the methods list dropped), `approval_weakened`, `taint_guard_removed`, `body_rules_widened` |
| Medium | `internal_name_host`, `wildcard_host`, `new_host_any_method`, `new_write_host_no_approval`, `deny_removed`, `methods_widened` (read methods only) |
| Info | `new_host` |

A change with a High finding is refused with `409` and the reasons. Review it, then resend with
`X-Keep-Policy-Ack-Risk: 1` (`KEEP_POLICY_ACK_RISK=1 keepctl policy set …`). The response lists every finding under
`risks`, and the audit row `keep.policy.set` records the codes and whether they were acknowledged. Per-host checks
run for newly added hosts only, so an unchanged entry does not block later edits.

## Suggested rules from denials

A `deny`-mode agent that asks for a host outside its allowlist leaves a `Denied` journal row. `GET
/v1/agents/{name}/policy-suggestions` (operator token only) groups those rows by host and returns the narrowest allow
entry that would have let the calls through, with `ask: always`:

```bash
keepctl policy suggest my-agent draft.yaml     # summary, and the draft policy in draft.yaml
$EDITOR draft.yaml                              # read it; drop what you do not want
keepctl policy sign draft.yaml && keepctl policy set my-agent draft.yaml draft.yaml.sig
```

It changes nothing itself. The agent chooses which hosts it asks for, so a suggestion is a prompt for a person, not a
request that can be approved by the agent. Every suggestion is run through the risk check above; one with a High
finding is listed with `NEEDS ACK` and is left out of the draft. Only denials for a host missing from the allowlist
count: an operator's refusal or a reviewer's verdict does not produce a suggestion. Hosts are limited to plain host or
IP characters, so an agent cannot put YAML or terminal escapes into the draft.

## Body rules: JSON-RPC, MCP and GraphQL

A host with `methods` only limits the verb. For a JSON-RPC, MCP or GraphQL endpoint every call is a `POST` to one
URL, so the verb says nothing. The three body fields make the broker read the request body before anything leaves:

```yaml
allow:
  - host: mcp.example.com
    methods: [POST]
    rpc_methods: [tools/list, tools/call]
    mcp_tools: [search]              # a tools/call to any other tool is refused
    ask: first
  - host: api.github.com
    methods: [POST]
    graphql_operations: [query]      # no mutations
    ask: first
```

- Fail closed: a body that is not the expected JSON, is empty, or is over 1 MiB never satisfies a rule that reads the
  body. A JSON-RPC batch, or a GraphQL batch, needs every entry allowed. A `tools/call` with no readable tool name is
  refused.
- JSON-RPC method names are case-sensitive. A response to a server-initiated request (an `id` and a `result` or
  `error`, no `method`) is passed, since MCP clients send them.
- GraphQL: every operation in the document must be an allowed type, whichever `operationName` selects. A document the
  scanner cannot read with confidence (unbalanced braces, an unclosed string, `extend`, an unknown keyword) is refused.
  Only request bodies are read, so a GraphQL `GET` with the query in the URL cannot satisfy such a rule.
- The CONNECT proxy cannot read a body, so it already refuses any host that has rules. Dropping or widening these
  lists in a policy change is a High finding (`body_rules_widened`) in the risk check above.
- This limits what the agent may ask for. It does not make the endpoint's tools safe, and a rule that allows
  `tools/call` for a tool allows whatever that tool does.

## Signature

Ed25519 over the exact YAML bytes the API receives (`X-Keep-Policy-Signature: <hex>`).

```bash
./agent-runtime/target/release/examples/keep_sign_policy sign "$SEED" keep.policy.yaml \
  > keep.policy.yaml.sig
./scripts/keepctl policy set <agent> keep.policy.yaml keep.policy.yaml.sig
```

See [PRODUCTION.md](../PRODUCTION.md) and [Tutorial 16](../../tutorials/16-keep-workstation.md).
