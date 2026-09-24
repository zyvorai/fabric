# Tutorial 16: Keep — open workstation for an untrusted agent

Run a **Keep**: a personal Linux cell for an agent you do not have to trust,
with a Sentinel policy you can read, approvals out of band, and an honest
measured security profile.

**Level:** Intermediate  
**Time:** 45 minutes  
**Repos:** Fabric agent-runtime, FluxVM reachable, `curl`, `jq`, Node 20+ optional for bundles.

> **Honesty.** Until Keep 0.2 on real SNP/TDX with a user-held key, *the host
> can still see a measured VM.* Evidence class `software-test` must never be
> marketed as “the operator cannot read this.” See [docs/keep/KEEP.md](../keep/KEEP.md).

GitHub Actions runs the unit/policy suite without KVM:
[`.github/workflows/keep.yml`](../../.github/workflows/keep.yml).

---

## What you will learn

1. How Keep maps onto Fabric agent-runtime + FluxVM (no third repo).
2. How to run the same tests CI runs.
3. How to export/import `keep.policy.yaml` with `keepctl`.
4. How to open a session cockpit (taint + last decisions).
5. How training stays off unless you mint an export token.

---

## Step 0 — Run the CI suite locally

```bash
cd fabric
cargo test --manifest-path agent-runtime/Cargo.toml --lib
cargo test --manifest-path agent-runtime/Cargo.toml policy -- --nocapture
./scripts/keepctl --help
```

Expect ~135 lib tests green. That is the same gate as the Keep workflow.

---

## Step 1 — Start the agent runtime

```bash
export ZYVOR_AGENT_LISTEN=127.0.0.1:9096
export ZYVOR_AGENT_API_TOKEN=dev-token
export ZYVOR_AGENT_FLUXVM_URL=http://127.0.0.1:7788
# optional: approval webhook your phone/CLI can reach
# export ZYVOR_AGENT_APPROVAL_WEBHOOK=https://…

cargo run --manifest-path agent-runtime/Cargo.toml --release
```

```bash
export KEEP_API=http://127.0.0.1:9096
export KEEP_TOKEN=dev-token
curl -sS -H "Authorization: Bearer $KEEP_TOKEN" "$KEEP_API/healthz"
```

---

## Step 2 — Deploy an agent (Keep cell)

Use Tutorial 11’s deploy JSON shape, and add Keep fields:

```json
{
  "name": "keep-demo",
  "bundle_base64": "<base64 of bundle.mjs>",
  "manifest": {
    "template": "node22-agent",
    "egress_mode": "ask",
    "egress_allow_hosts": ["api.github.com"],
    "taint": { "trusted_hosts": ["api.github.com"] },
    "model_socket": {
      "base_url": "https://api.x.ai/v1",
      "model": "grok-4",
      "credential": "xai"
    },
    "cell_backend": "firecracker"
  }
}
```

```bash
./scripts/keepctl create -f /tmp/keep-demo-deploy.json
```

`model_socket` is the BYO brain — swap Grok / local GGUF / vLLM without rebuilding the cell.  
`cell_backend: firecracker` records the Keep 0.1 intent (agent kernel ≠ host kernel); the live sandbox still follows FluxVM’s sandbox API today.

---

## Step 3 — Readable Sentinel policy

```bash
./scripts/keepctl policy show keep-demo > /tmp/keep.policy.yaml
cat /tmp/keep.policy.yaml
# edit allow/deny/ask/taint, then:
./scripts/keepctl policy set keep-demo /tmp/keep.policy.yaml
```

Example schema: [docs/keep/sentinel/keep.policy.yaml](../keep/sentinel/keep.policy.yaml).

High-risk actions (buy / send / delete) must go through `/v1/approvals` / your
webhook — never confirm inside the agent chat.

---

## Step 4 — Cockpit: visible taint

After a session exists:

```bash
SID=<session-uuid>
./scripts/keepctl cockpit "$SID" | jq '{tainted_by, taint_visible, last_decisions, honesty}'
```

Untrusted reads paint `tainted_by`; egress flips to ask. Hidden eBPF is not the product — **visible** decisions are.

---

## Step 5 — Pack / unpack (two homes, one disk story)

```bash
./scripts/keepctl pack   /tmp/keep-pack keep-demo
./scripts/keepctl unpack /tmp/keep-pack keep-demo
```

This moves policy + manifest pin. Copy the FluxVM qcow2 / vault export beside
the pack directory when you migrate hosts. Measured image pin travels with the
FluxVM catalog alias you used for `security_profile: measured` VMs.

---

## Step 6 — Training default off

```bash
# Refused without an explicit scoped token:
./scripts/keepctl export-token 'trajectory:read:7d' 3600
```

Sanitization footnotes do not count. No token → no trajectory leaves the box.

---

## Measured profile on FluxVM (optional on this host)

If the node has OVMF + swtpm + a signed catalog:

```bash
# On the FluxVM host — see zyvorai/fluxvm docs/guides/security-profiles-howto.md
curl -sS -X POST http://127.0.0.1:7788/v1/vms \
  -H 'Content-Type: application/json' \
  --data @examples/qemu-measured.json
```

FluxVM CI for that path: `./scripts/test-security-profiles.sh` in the fluxvm repo.

---

## What not to do

- Approvals inside the agent chat  
- Calling `software-test` evidence “hardware attestation”  
- Treating QEMU `extra_args` as proof of confidential launch  
- Opening a third Keep git repository — Keep lives in Fabric  

Next: [docs/keep/KEEP-0.2.md](../keep/KEEP-0.2.md) when you have SNP/TDX + a user-held key.
