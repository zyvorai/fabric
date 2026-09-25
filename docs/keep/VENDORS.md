---
sidebar_position: 11
---

# Keep for a phone vendor

How an Android maker, or any company with a phone and an account system, offers its users a personal agent that
runs on a **cloud computer of its own** while the **phone holds the keys**. This is the shape Meta's Muse
describes; Keep is the version the vendor runs, reads and can take apart.

This page is a blueprint and a list of what exists. It is honest about what does not. Read
[the limits](#what-you-can-and-cannot-claim) before you promise anything to a user.

## The shape

```
Phone app ── vendor login ──> Vendor gateway ──> shard router (user → shard, region)
   ▲  push (Mi Push / HMS / OPPO / vivo / FCM)              │
   │                                                        ▼
Vendor push relay <── signed message ─────── Shard: Keep runtime + FluxVM (sealed cells, policy, vault, audit)
```

A **shard** is one Keep host. Keep stays a single-host building block; the vendor runs many and puts a router in
front, so nothing here needs a distributed scheduler.

| The vendor owns | Keep provides |
|---|---|
| User accounts and login, and step-up (biometric, second factor) | A sealed cell per job, on hardware you control |
| Which shard a user lives on, and in which region | Signed policy, deny-by-default egress, taint rules |
| Push delivery to phones (its own push channels) | Approvals that only an enrolled phone key can sign |
| Billing, metering, quotas policy | Per-user isolation, quotas and a usage report |
| The app and its UI | A vault: the agent never holds an API key |
| Which model answers | Any OpenAI-compatible endpoint, gated by the vault |
| Hosts, regions, capacity | An audit journal per shard |

## What a user's day looks like

1. **Sign up.** The vendor's app logs the user in. The gateway assigns a shard in their region, once.
2. **Enrol the phone.** After a strong login the app makes a P-256 key in the phone's keystore and the gateway
   enrols its public key on the user's shard.
3. **Ask for something.** The app calls the gateway; the gateway calls the user's shard with a short-lived token that
   reaches only that user's data. The agent works inside a sealed cell.
4. **Approve.** When the agent wants to send, buy or delete, the shard pushes to the phone (through the vendor's
   push relay). The phone shows what is being approved, the person confirms with biometrics, and the phone signs the
   decision. The shard refuses anything the enrolled key did not sign.
5. **See what happened.** Runs, artifacts and the audit trail come back through the same path.

## What exists today, and where it is documented

| Piece | Status | Where |
|---|---|---|
| Sealed cell, signed policy, vault, egress control, audit | Built | [KEEP.md](KEEP.md), [SECURITY-PROFILES.md](SECURITY-PROFILES.md) |
| Many users on one shard: user tokens, isolation, quotas, usage, revocation | Built and tested | [TENANCY.md](TENANCY.md) |
| Phone-signed approvals, device enrolment, push relay interface | Built and tested (server side); Node reference client | [mobile/README.md](mobile/README.md) |
| The vendor's choice of model (Qwen, DeepSeek, GLM, local, its own) | Built and tested | [MODELS.md](MODELS.md), [MODEL.md](MODEL.md) |
| Document use cases, triggers, batch, ready-made scenarios | Built | [PACKS.md](PACKS.md), [TRIGGERS.md](TRIGGERS.md), [SCENARIOS.md](SCENARIOS.md) |
| Gateway: login, placement by region, token minting, push relay | **Reference code**, tested | [`reference/vendor-gateway`](../../reference/vendor-gateway/README.md) |
| Benchmark for cold-start and concurrency | Script | `scripts/keep-bench.sh` |
| An Android app | **Not built.** A sketch of the signing code is in the mobile guide | [mobile/README.md](mobile/README.md) |
| Vendor push adapters (FCM, Mi Push, HMS, OPPO, vivo) | **Placeholders**: each needs the vendor's own credentials | gateway README |
| Console strings in Simplified Chinese | **Partial**: navigation, headings, buttons and status of the three Keep pages, with a language switch. The long explanations and the honesty notes stay in English, on purpose. Not viewed in a browser here | `web/src/i18n/keep.ts` |

## Sizing: measure, do not guess

A cell is a microVM. Its memory is the template's (`node22-agent`: 2 GiB), so the ceiling on **concurrent cells** per
host is roughly `(RAM − what the host itself needs) ÷ what a cell really costs`. The template's memory is the guest's allowance, not the host's real cost (the VMM and page cache add to it, and a guest may not touch all of it), so measure the real cost on your hardware. How many *users* that serves depends on how often
each is active, which only your own traffic can tell you.

`scripts/keep-bench.sh` measures cold cell runs end to end and how they hold up as more run at once. Run it on your
own hardware; the figure below is one lab host and is **not a promise**.

Measured on one lab host (Ubuntu 26.04, 12 vCPU, 31 GiB RAM with about 12.5 GiB already in use by other services),
`node22-agent` template (2 GiB per cell), `csv-clean` on a tiny file, six runs per level, 2026-09-25:

| Concurrent runs | ok | failed | p50 | worst of 6 | runs per minute |
|---|---|---|---|---|---|
| 1 | 6 | 0 | 16.8 s | 28.2 s | 3.2 |
| 2 | 6 | 0 | 18.0 s | 18.6 s | 6.6 |

What that says, and does not say:

- A **cold** run (boot a fresh cell, extract, produce the artifact) took roughly **17 to 18 seconds** here, and two at
  once did not slow each other much (throughput about doubled). It is not an interactive latency; it is fine for jobs,
  not for a chat that must answer at once (that is what a warm pool is for, and it is **not measured**).
- **Memory per cell is not established.** The script also recorded the host's free memory, but those runs were made
  *before* a bug was fixed: a use-case run left its cell alive for the sandbox's 30-minute lifetime, so cells piled up
  during the measurement and the free-memory readings cannot be turned into a per-cell figure. Running about 25 such
  runs in 35 minutes on that host later made it stop answering SSH. The fix (a finished run now ends its session, and the
  cleanup loop deletes the cell at once) is in the runtime; **re-run `keep-bench.sh` on your own hardware to size memory**.
- Concurrency 4 was **skipped** by the script's own safety limit. Six runs per level is a small sample: the "worst of 6"
  is not a real p95.
- One host, one workload, a tiny file. Real documents take longer to extract. Treat this as a method and a first data
  point.

Things that limit density today, none of them hidden:

- A **per-user home disk** (`home_volume.per_user`) cannot be combined with warm pools or hibernate, and needs a QEMU
  template, which cannot be snapshotted. So an "always there" persistent computer per user and a fast warm start do
  not come together yet. Most jobs (documents, scheduled runs) need neither.
- Warm-pool start latency and hibernate/resume are **not measured** here; sessions report `startup_ms` so you can.
- One runtime process per host, its state in local files. There is no shared database, so a shard is the unit of
  failure and of capacity.
- After a host or FluxVM restart, sessions are not restored (see the runtime README).

## Regions and data location

The gateway pins each user to a shard in the region their account names, and never moves them. That keeps a user's
cell, artifacts and audit rows on hardware in that region. What Keep does **not** do: prove where data is, move a user
between regions, or replicate across regions. Data location is a property of where **you** put the shard and which
model endpoint you allow: a prompt sent to an endpoint in another country leaves the region, so allow only endpoints
you have decided about ([MODEL.md](MODEL.md)).

## What you can and cannot claim

Say, because it is true and tested:

- Each user's agent runs in a sealed cell that has no network except what the policy allows, and the cell reports how
  many outbound connections it made.
- The agent never holds an API key. Keys are added on the host, for hosts you list.
- A user's token reaches only that user's data; another user's objects look like they do not exist.
- With signing required, an approval is accepted only if the user's **enrolled phone key** signed that exact decision.
- Every approval, signature check, model call and token event is in a tamper-evident journal.

Do **not** say:

- **"Not even we can read your data."** The evidence class is `software-test`. The vendor's operators can still read a
  cell's memory and the secrets in the host environment. Confidential hardware (AMD SEV-SNP, Intel TDX) with a key only
  the user holds is the goal of Keep 0.2 and is **not** available ([KEEP-0.2.md](KEEP-0.2.md)).
- **"Your phone's secure chip holds your vault."** The phone key signs *approvals*. It does not unlock the vault.
- **"Compliant with"** any national or industry rule. Keep makes no compliance claim.
- **"Your data never leaves the country"** unless the shard, the model endpoint and the push path all stay there.
- Anything about connectors Keep does not have: live mail and calendar, payments.

## Questions to take to your own counsel and security team

Keep does not answer these; a vendor entering a regulated market has to. They are questions, not conclusions:

- Where must user data and prompts stay, and does your model endpoint keep them there? What happens to prompts sent
  to a model service the vendor does not operate?
- Which of the vendor's own obligations apply to a service that generates content for users (record-keeping, content
  moderation, filing or registration of the service), and does adding a third-party model change them?
- What personal information do the audit journal, artifacts and push messages hold, for how long, and how does a user
  delete it? (Keep has no per-user erase; artifacts expire only if you set a TTL.)
- Which model licences allow your use, and who is responsible for the model's output?
- What review does your security team need before a cell runs code or a browser on a user's behalf?

## Compared with Muse

The comparison in [the overview](README.md#keep-vs-meta-muse) rests on press reports, not an audit of Muse. In short:
Muse is Meta's cloud with Meta's model; Keep is software the vendor runs, on its hardware, with its choice of model
and its own account system, and it states its limits up front. Where Muse is a finished consumer product, Keep is
the machinery under one: the vendor still builds the app, the gateway, the operations and the trust programme.

## What is next

An Android reference app (this environment had no Android SDK or JDK, so none was written; the mobile guide has a signing
sketch and test vectors to start from), the rest of the console in Chinese and other languages, vendor push adapters,
warm-start and hibernate numbers, and, hardware-gated, user-held keys on confidential hosts.
