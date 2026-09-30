# Vault / authd

## Keep 0.1 — credential authority (host-side)

- Agent never sees raw passwords in tool results: the egress broker injects
  secrets after allowlist checks.
- `CredentialVault::authorize_resolve` only returns a secret when
  `(credential_id, host, method, path, port, user_id)` matches the descriptor
  (`host`, `allowed_methods`, `path_prefixes`, `allowed_ports`, `allowed_users`).
- Surrogate tokens (`zy_sur_…`) can stand in for intercepted TLS hosts; the real
  secret is swapped only at approved egress (see `mitm`).
- **Honesty:** secret material still lives in the **host process environment** /
  descriptor file. The operator of the host can read it. This is **not** a claim
  that the agent cell is unread by the operator.

### Credentials from a file (`source`)

A descriptor can name a file instead of an environment variable, so the secret does not have to live in a unit file, an env file or a pod
spec, and can be rotated without restarting the runtime:

```json
{ "stripe": { "host": "api.stripe.com", "header": "authorization", "prefix": "Bearer ",
              "source": { "kind": "file", "path": "/run/secrets/stripe-key", "ttl_seconds": 60 } } }
```

This covers Vault Agent (which renders secrets to files), Kubernetes Secrets mounted as volumes, the CSI Secrets Store driver and systemd
`LoadCredential=`. Set **either** `env` **or** `source`, not both; `source` is not for `fabric` or `oauth-refresh` credentials.

- **Same checks.** Host, method, path, port, user and approval are checked first and unchanged. A request that fails them **never causes the
  file to be read**.
- **Cached, then re-read.** The value is cached for `ttl_seconds` (default 60, at most 3600) with one read in flight however many requests
  arrive. The TTL is also how long a rotated or revoked secret keeps working.
- **Fails closed.** If the file cannot be read after the cache expires, the request is refused; a cached value is never used past its TTL.
  Errors name the credential and the file, never its contents.
- **The file must be private.** A file readable by group or others (anything but 0400 or 0600) stops startup, unless the source sets
  `allow_loose_permissions: true`; a Kubernetes Secret volume is 0644 unless its `defaultMode` says otherwise. A file that does not exist yet only
  warns at startup, since whatever renders it may start later.
- **What is read.** A regular file (symlinks are followed, as Kubernetes needs), at most 64 KiB, UTF-8, trimmed. An empty file, or a value with
  a control character such as a newline inside it, is refused so it cannot add a second header.
- **The limit.** The secret is still in the runtime's memory while it is used, so the host operator can read it. A source changes where it is
  kept and who can rotate it, not that.

The design and the later Vault source are in [design/credential-sources.md](../design/credential-sources.md).

### Refreshing OAuth credentials

A descriptor with `kind: "oauth-refresh"` keeps its client id, client secret and refresh token in host env and injects a short-lived access token that the runtime refreshes in the background; a failed refresh fails closed. See [connectors](../connectors/README.md) (Google Gmail and Calendar).

### Optional software unwrap ceremony

When `ZYVOR_AGENT_VAULT_UNWRAP_REQUIRED=1`:

```bash
keepctl unwrap-token vault          # → token (still host-env secrets)
keepctl unwrap "$TOKEN"             # unlocks inject for ~1h
keepctl vault-status                # names + honesty; never secret values
```

`POST /v1/vault/unwrap-tokens`, `POST /v1/vault/unwrap`, `GET /v1/vault/status`.
Cockpit includes `vault.{secret_backend,unwrap_required,unlocked,honesty}`.
Set `ZYVOR_AGENT_VAULT_USER_HELD=1` to label `secret_backend: user-held-pending`
(still host-env material).

## Keep 0.2 scaffolding (software-test)

```bash
keepctl user-held-challenge         # → {id, nonce} for phone/YubiKey ceremony design
keepctl user-held-complete ID NONCE # → 403 until snp/tdx_launch_verified
```

`POST /v1/vault/user-held/challenge` and `…/complete`. Complete reads FluxVM
`GET /v1/security/capabilities` and is **fail-closed** while verified flags are
false. When a hardware run flips them, complete grants a vault lease via the
key-broker **stub** (wrapped LUKS disk key still not implemented). Vault opens
for real only after the user’s phone or YubiKey unwraps a key onto a
measured/attested guest. No “operator may open for support” on confidential.
Connector scopes like OAuth for CLI tools: `github:read:one-repo`, not a raw PAT.
Payment rails stay pluggable (Stripe Link / virtual card / paste OTP).
