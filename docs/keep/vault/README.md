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

### Optional software unwrap ceremony

When `ZYVOR_AGENT_VAULT_UNWRAP_REQUIRED=1`:

```bash
keepctl unwrap-token vault          # → token (still host-env secrets)
keepctl unwrap "$TOKEN"             # unlocks inject for ~1h
keepctl vault-status                # names + honesty; never secret values
```

`POST /v1/vault/unwrap-tokens`, `POST /v1/vault/unwrap`, `GET /v1/vault/status`.
Cockpit includes `vault.{secret_backend,unwrap_required,unlocked,honesty}`.
Backend is always labeled `host-env` until Keep 0.2.

## Keep 0.2

Vault opens only after the user’s phone or YubiKey unwraps a key onto a
measured/attested guest. No “operator may open for support” on confidential.
Connector scopes like OAuth for CLI tools: `github:read:one-repo`, not a raw PAT.
Payment rails stay pluggable (Stripe Link / virtual card / paste OTP).
