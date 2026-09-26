---
sidebar_position: 5
---

# Keep and Solvor: open items that need a person or a resource

Everything that can be built and tested without these is done or in flight. This page lists what is **blocked on something only the
owner can provide**, what it unblocks, and how to tell when it is done. The plan behind it: make Keep and Solvor easy to try, easy to
trust, and easy to talk about ([ROADMAP.md](ROADMAP.md) has the product side).

## Needs a resource

| Item | Needs | Unblocks | Done when |
|---|---|---|---|
| **Test `keep-up.sh` from nothing** | A disposable x86_64 Linux VM with KVM (bare metal or nested virtualization), about 20 GiB free, root | The one-command starter ([`scripts/keep-up.sh`](../../scripts/keep-up.sh)) and its `--install-fluxvm` path are only tested with fake facts | `sudo ./scripts/keep-up.sh --install-fluxvm` ends with Solvor connected and `demos-ci.sh` green on that VM |
| **Cloud-init / compose starter** | The VM above, plus a decision on which cloud | A copy-paste "create a VM, done" path; not written yet because an untested file that spends money is worse than none | Boots a clean VM to a working Keep host with one file |
| **Signed and notarized Solvor** | An Apple Developer ID certificate and an App Store Connect API key or app-specific password, added as repository secrets (never given to Claude) | Installing Solvor without Gatekeeper blocking it; the release workflow is written and waits for these | A tagged release produces a `.dmg` that `spctl -a -vv` accepts on a clean Mac |
| **Approvals push relay** | The same Apple account (APNs key) | Approvals that arrive when Solvor is closed; today they are polled every 20 s while the app runs | A phone or Mac receives a push for a waiting approval |
| **Hardware-attested runs (Keep 0.2)** | Time on an AMD SEV-SNP or Intel TDX host | The evidence class above `software-test`; flips `security.snp_launch_verified` / `tdx_launch_verified` | One verified hardware launch is recorded in [pilot-runs](pilot-runs/README.md) |
| **Lab deploy job in CI** | A working SSH key/secret for the lab host (the workflow targets `80.79.5.173`; the lab box used for testing is `212.8.248.187`) | A green `Lab deploy` badge | `Lab deploy` passes on `main` |
| **A design partner** | An introduction to one phone vendor and one bank operations team | Real feedback; the vendor pilot kit and bank packs are written but unvalidated | A pilot runs with their data shapes |
| **Real (anonymised) bank exports** | Sample NEFT/RTGS return files, NACH return reports, reconciliation exports, UPI dispute mail from a partner | The four bank packs' patterns are generic and unchecked against any real export | Packs pass against real samples, patterns fixed where they miss |

## Needs you to try it (checklists exist)

- **Solvor paths only you can verify**: [browser email on real webmail, Siri and Shortcuts, Talk to Solvor, Services / menu bar / `keep://`, approving with Touch ID](https://github.com/zyvorai/solvor/blob/main/docs/VERIFY.md). Each is built and unit-tested; none is marked verified until it passes on a real Mac.
- **Photos and scans**: OCR is verified in real cells with generated images. Try real phone photos of receipts and bills and report what it misses (blurry, angled and non-English photos are known weak spots).
- **PDF packs on real documents**: `loan-sanction-letter` and `rbi-circular-brief` have no sample and have never read a real sanction letter or circular.

## Decisions for the owner

- **Posting publicly.** Launch drafts live in [`docs/keep/launch/`](launch/); nothing is posted by tooling. Decide when, where and under which account.
- **`zyvor-web` and `docs/keep/marketing.json`.** Shared with the marketing site; changed only on request.
- **Old branches on your personal mirror** (`ssahani/zyvor-fabric`, about 60, mostly Dependabot) and the unmerged local branches `fix-pr-*`, `review/agent-runtime-v3`, `try-devops`.
- **Major-version Dependabot bumps** in other zyvorai repos (`relay-edge#12`, `atlas#32`, and the crate bumps) and `zorvia#28`, which needs a required review.

## Known and unresolved

- **An intermittent FluxVM eBPF refusal** (`bpftool prog load` refused when applying the deny-all network policy) was seen in 4 of 56 live scenarios on one day. It has not reproduced in four full passes (57/57, 62/62, 62/62, 62/62) and 40 sequential runs since, and FluxVM's journal does not record it (the error only reaches the API response). The runtime fails closed either way. If it returns, capture the untruncated error and `dmesg` at that moment.
- **A stale `qemu-nbd`** (up for about 12 hours, no VMs running) holds the old `node22-agent.qcow2` on the lab host, which is why rebuilds go to a new image now. Disconnecting it is a host operation for the owner.
