# Keep

**Pitch:** *the agent gets a real computer; you keep the keys, the policy, and the right to leave.*

Keep is a personal workstation for an untrusted agent. Muse got the threat model right; Keep ships the open version Meta cannot: **you run it, you read it, you take it with you.**

Apache-2.0, same as FluxVM. Keep is a **product layer in Fabric** on FluxVM —
not a third repo and not a second VMM.

**Docs home:** `fabric/docs/keep/` (this tree).  
**CLI:** `fabric/scripts/keepctl` (alias-worthy as `keepctl` on PATH).  
**Runtime:** `fabric/agent-runtime` (Sentinel, vault, egress ask, browser, approvals).  
**Hypervisor:** FluxVM Phase 6 `security_profile` only.

## How to test (same as CI)

```bash
# From fabric repo root — no KVM required
cargo test --manifest-path agent-runtime/Cargo.toml --lib
cargo test --manifest-path agent-runtime/Cargo.toml policy -- --nocapture

# Full Keep end-to-end (live runtime + FluxVM stub + keepctl)
./scripts/keep-e2e.sh

# Runtime control-plane e2e (proxy / Sentinel / DLP / phone approvals)
cargo build --manifest-path agent-runtime/Cargo.toml --release
BIN=agent-runtime/target/release/zyvor-fabric-agent-runtime \
  ./agent-runtime/scripts/e2e-no-fluxvm.sh
```

GitHub Actions: [`.github/workflows/keep.yml`](../../.github/workflows/keep.yml)  
Hands-on: [Tutorial 16](../tutorials/16-keep-workstation.md)  
Production checklist: [PRODUCTION.md](PRODUCTION.md)  
FluxVM measured profiles (sibling repo): `./scripts/test-security-profiles.sh`

## Quiet part (read this first)

Until Keep 0.2 on real SNP/TDX hardware with a user-held wrapping key:

> **The host can still see a measured VM.**

Evidence class `software-test` must never be marketed as “the operator cannot read this.” Muse Secure VM has the same limit today; they put it in a footnote. We put it here.

## What Muse got right

Treat the model as compromised the moment it reads a webpage.

- One persistent Linux computer per person, not a chat session.
- Two domains on one box: untrusted agent cell vs host-side authority.
- Agent never sees real passwords; surrogates swap at the egress boundary.
- Approvals are capabilities bound to a connector, not a sentence in the chat.
- Browser driver sees an accessibility tree, not raw DOM + JS.

## Why Keep beats Muse on purpose

| Muse | Keep |
|---|---|
| Meta cloud only | Laptop, mini-PC, FluxVM host, rented SNP/TDX — same API |
| Closed Sentinel | Signed `keep.policy.yaml` you can diff in git |
| Operator may open the VM | Confidential = no host recover; measured says so honestly |
| Trajectories may train after sanitization | Training default **off**; export needs a scoped token |
| `systemd-nspawn` (shared kernel with Sentinel) | Firecracker/KVM microVM cell |
| Married to Muse Spark | BYO model socket |
| Fat client helper surface | vsock admin; no SSH to the agent |

## Architecture

```
You (phone / laptop / YubiKey)
  |  wrapping key + approval channel
  v
+------------------------------------------------------------------+
| HOST (Linux + KVM) — FluxVM node you control                     |
|                                                                  |
|  [Keep Sentinel]  eBPF L4/L7 + action policy + taint             |
|       ^ sole egress + connector authority                        |
|       |                                                          |
|  [Vault / authd]  secrets sealed to your key or vTPM             |
|       | surrogate in, real secret only at approved egress        |
|       v                                                          |
|  [Keep Supervisor]  measured/confidential FluxVM guest           |
|     +----------------------------------------------------------+ |
|     | FIRECRACKER / QEMU MICROVM  (untrusted agent cell)       | |
|     |   agent runtime + tools + workspace                      | |
|     |   no raw secrets, no CAP_NET_ADMIN, no host fs           | |
|     |   brokered Chromium (a11y tree only)                     | |
|     +----------------------------------------------------------+ |
|                                                                  |
|  durable state: postgres/sqlite on host, not in the cell         |
+------------------------------------------------------------------+
```

Security profiles (FluxVM Phase 6):

| Profile | Evidence | Hardware attestation? |
|---|---|---|
| `standard` | none | no |
| `measured` | `software-test` | **never** |
| `confidential-snp` / `confidential-tdx` | `sev-snp` / `tdx` only after verified hardware run | gated |

## Keep 0.1 — six-pack (ship this)

1. **BYO model socket** — Grok / local GGUF / vLLM / Muse-class API; cell unchanged.
2. **Signed YAML Sentinel** — `sentinel/keep.policy.yaml`.
3. **Firecracker cell** — agent kernel ≠ host kernel.
4. **Phone-only high-risk approvals** — buy / send / delete never in chat.
5. **Pack / unpack** — `keepctl pack` → USB or S3 → `keepctl unpack` on another FluxVM node.
6. **Cockpit with visible taint** — browser / terminal / files / cron / last 20 Sentinel decisions; red paint on untrusted tabs.

## Keep 0.2 — Muse’s “later,” without the wait-as-product

- User-held unwrap (phone / YubiKey) onto an attested guest.
- Attestation receipt on the phone: image hash, profile achieved, evidence class.
- Confidential profiles: **no** host recover path.
- Flip FluxVM `security.snp_launch_verified` / `tdx_launch_verified` only after one hardware run.

## What not to add

- Approvals inside the agent chat
- Helper-app Messages/Notes/file slurp as default
- Silent training on trajectories
- `extra_args` counting as confidential
- A second control plane besides FluxVM

## Layout (in Fabric — no third repo)

```
fabric/docs/keep/
  KEEP.md           # pitch, Muse deltas, honesty clause
  KEEP-0.2.md       # hardware gate
  STATUS.md
  sentinel/         # keep.policy.yaml example
  vault/ cell/ browser/ approve/ cockpit/
fabric/scripts/keepctl
fabric/agent-runtime/   # policy, model_socket, cockpit API, export-token
```

## Related code

- FluxVM: https://github.com/zyvorai/fluxvm — Phase 6 `security_profile` (hypervisor only)
- Fabric: agent-runtime + **`zyvorctl keep` / `keepctl`** + `docs/keep/` (this product surface)
- Design precursor: `fabric/docs/design/confidential-agent-vms.md`

There is no separate Keep git repository.
