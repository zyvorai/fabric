# Vault / authd

- Agent never sees raw passwords.
- Vault mints **surrogate** tokens; real secret swapped only at approved egress.
- Connector scopes like OAuth for CLI tools: `github:read:one-repo`, not a raw PAT.
- Payment rails are pluggable (Stripe Link / virtual card / paste OTP) — do not hard-wire one.

## Keep 0.2

Vault opens only after the user’s phone or YubiKey unwraps a key onto a
measured/attested guest. No “operator may open for support” on confidential.
