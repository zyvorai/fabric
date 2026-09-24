# Keep 0.2 — gated on hardware

Do **not** claim these until a real SNP/TDX integration run flips FluxVM
`security.snp_launch_verified` / `security.tdx_launch_verified`.

## Required

1. **User-held unwrap** — vault opens only after phone or YubiKey unwraps a key
   onto a measured/attested guest.
2. **Attestation receipt in the app** — image hash, profile achieved, evidence
   class. If class is `software-test`, UI must not say the operator cannot read.
3. **No host recover on confidential** — break-glass exists only on
   `measured`/`standard`, requires two keys, immutable audit. Confidential
   profiles have **no** host recover path.
4. Align with [confidential-agent-vms.md](../design/confidential-agent-vms.md).

Until then Keep 0.1 honesty clause stands: *the host can still see a measured VM.*
