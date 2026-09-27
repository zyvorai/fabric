---
sidebar_position: 3
---

# What is left: everything, in one place

Last reviewed 2026-09-27, after the personal-agent work (threads, memory, goals, plans, suggestions, receipts, Google and Microsoft connectors, the
chat page, the iPhone app). Other pages say what *is* built ([STATUS.md](STATUS.md), [VERIFICATION.md](VERIFICATION.md), [ROADMAP.md](ROADMAP.md));
[TODO.md](TODO.md) lists what is blocked on a resource only the owner has. This page is the whole list, so nothing lives only in a chat or a PR.

Three words are used strictly:

- **Verified on real infrastructure**: it ran against the real thing (a real Google account, a real cell, a real Mac) and the result is recorded.
- **Tested against fakes**: unit tests and end-to-end runs (`demos-ci.sh`) against a real runtime with stand-ins for the outside world (a fake Google or
  Graph over TLS, a stub cell that runs the agent as a local process, a software phone key). This proves the logic and the wiring, not the outside world.
- **Not built**: nothing exists yet.

## 1. Where each area stands

| Area | Verified on real infrastructure | Tested against fakes only | Not built |
|---|---|---|---|
| Sealed cells, signed policy, vault, egress control, audit, phone-signed approvals | The live scenario suite on a real host; `keep-up.sh` on a clean VM, but **run in stages, fixing gaps as they appeared** (one uninterrupted pass from nothing is still owed: [TODO.md](TODO.md)); one AG-UI run of `echo-agent` on a real cell by hand ([VERIFICATION.md](VERIFICATION.md)) | | Hardware-attested runs (needs SEV-SNP/TDX time) |
| Threads, opt-in memory, goals and the goal worker, action receipts (at-most-once), retention, push events, suggestions, plans an agent proposes | | Unit tests, tenancy tests on the real router, `demos-ci.sh` (stub cell). The retention sweep and the goal worker were never watched running for days | Memory for model-backed and CLI agents; a *finder* of good suggestions |
| Gmail and Calendar (per-person Google, host-rendered previews, three agents) | **Consent, real unread headers, a draft behind an approval that landed in Drafts, a denied send that never reached Google, the agenda** (2026-09-27, personal Gmail, Testing mode; [connectors](connectors/README.md#verified-against-real-google)) | An **approved send**, **creating an event**, a second person's connection, token renewal after 7 days, a Workspace account, an app past Google's verification | HTML or multipart mail and attachments (refused, not shown); editing or deleting events; Drive |
| Microsoft 365 / Outlook (public client, narrow scopes, rotating refresh tokens, Graph previews, three agents) | | Everything, including the rotation, against a fake Graph over TLS | The live run: parked, it needs an Entra directory ([TODO.md](TODO.md)) |
| Chat page (threads, goals, plans, suggestions, memory, approval cards) | Goals and memory against a real local runtime and the simulator; the approval, plan and suggestion cards in a real browser against a fake host | The proxy (28 tests) | Search and attachments; a phone-width check (a read-only **Done** tab of receipts is done, #269) |
| iPhone app (`integrations/ios-keep`) | | `KeepKit` (68 tests) and a simulator build | **It has never been run**: no simulator here, no device, no Apple team. Easier enrolment, push (needs an APNs key). (Memory and Done screens are written, #270, but unexercised) |
| Solvor (Mac app) | Builds, unit tests, a real host, watched folders, the email pipeline ([VERIFICATION.md](VERIFICATION.md)) | | Browser email on real webmail, Siri/Shortcuts, Touch ID approvals, Services and `keep://` (each built, none verified: [Solvor's VERIFY.md](https://github.com/zyvorai/solvor/blob/main/docs/VERIFY.md)); a signed and notarized release. (Goals, Memory and Done panes are written, #271, and build, but were never opened) |
| Android app | | | **Not built** (a signing sketch is in [mobile/README.md](mobile/README.md)) |
| Windows companion, Windows or Linux client | | | Not built |
| Consoles (Fabric `web/`, Zorvia) | Typography change checked on a Zorvia build only | | |

## 2. Blocked on you (an account, a key, a machine)

Only the owner can do these; none is a secret I should hold. The full table with "done when" is in [TODO.md](TODO.md); in short:

- **Google, the rest of the live check:** an approved send, creating an event, a second person, token renewal over 7 days, and a real phone in place of the laptop key. The demo is [GOOGLE_DEMO.md](connectors/GOOGLE_DEMO.md).
- **Microsoft live check:** an Entra directory (a work or school tenant, a Microsoft 365 developer tenant, or a free Azure account, which you chose not to use), an app registration (public client, redirect `http://localhost`) and a test mailbox.
- **Apple:** a Developer ID certificate and notarization credentials (a signed Solvor), an APNs key (push for approvals, goals and suggestions), a team to sign and run the iPhone app on a device or TestFlight.
- **A phone:** running the iPhone app and a real phone key against a real host.
- **Hardware:** SEV-SNP or TDX time; an Apple Silicon Mac for the Lima path.
- **The lab host:** an SSH secret for the `Lab deploy` job.
- **People:** a design partner (phone vendor, bank operations) and real anonymised bank exports.

## 3. Buildable now (engineering backlog)

Roughly in the order I would do them. "Can't run here" means the code can be written and unit-tested, but not exercised on a device.

| Item | What | Depends on |
|---|---|---|
| Run the two gaps of the Google check | An approved send and an event creation, once each, recorded | You, with the demo |
| Mail approvals for real-world mail | Show HTML and multipart mail faithfully (a safe renderer) instead of refusing it; attachments listed by name and type | Design of what "faithful" means |
| iPhone app: QR or link enrolment; push; actually running it | (Memory and receipts screens are done, #270) | Push needs your APNs key; the rest needs a simulator or a device |
| Android app | Kotlin, StrongBox P-256 signing, the same API as the iPhone app | Can't run here (no emulator set up) |
| Chat page | Search, attachments, a phone-width pass (the receipts view is done, #269) | |
| Solvor | Open and click the new Goals, Memory and Done panes (#271); the panes need a user token | A Mac and a person to drive the UI |
| Suggestions | A real finder that proposes something rarer than every run (a heuristic one, `calendar-suggestions`, ships now; a model-backed one still wants your model endpoint) | |
| Goal planning quality | Try a real model for `goal-planner`, tune the prompt, add step-level `requires_approval` from the model with the person's confirmation | A model endpoint and key from you |
| Memory in more agents | Put accepted memory into the context of model-backed and CLI-harness agents, under the same rules (data, never instructions) | |
| AG-UI | Tool-call events, `STATE_SNAPSHOT`/`STATE_DELTA`, token streaming; try a real CopilotKit or other AG-UI client ([TODO.md](TODO.md)) | |
| Encryption to the user | Memory and threads readable only with a key the user holds (today the host operator can read them, like the vault) | The Confidential-VM work |
| Connectors | Drive and OneDrive; editing or deleting events; per-provider rate limits and backoff | |
| Per-agent budgets | A model-call and run budget per goal, not only per person per day | |

## 4. Needs a design decision first

Each of these needs a decision, and often a partner, before it is code. **Design notes with a recommendation and the decisions to make are in [design/](design/README.md)** for browser workflows, payments, mail approvals, agent-proposed tools and a Windows companion. None is started.

- **Browser workflows** with takeover and confirm-before-submit: today only a heuristic witness exists ([browser/README.md](browser/README.md)); input takeover is not implemented.
- **Payments:** through a provider's tokenised, limited-use credentials only; an agent must never see a card number. Needs a provider, and a threat model for spend limits.
- **Agent-proposed tools:** schema-validated, run in a cell, capabilities reviewed, signed before reuse.
- **A Windows companion** (and what it may read or do), plus **verticals** (bank aggregation, health).
- **WhatsApp:** only through Meta's supported Business API, and not before the clients above are stable.
- **A hosted trial or appliance**, and a real clean-host install story for people without a KVM box.
- **Posting publicly:** launch drafts exist in [`launch/`](launch/); nothing is posted by tooling.

## 5. Limits you should know about (built that way, or found the hard way)

- Only **plain-text mail** can be approved (7bit/8bit, UTF-8 or ASCII). HTML, multipart, other encodings and attachments are refused before anything is sent.
- **Microsoft emails every guest** when an event is created; there is no switch, so the agent only adds guests with `notify: yes`, and the preview says so.
- An **approval** waits at most 240 seconds (the runtime's cap). After that the agent is told it was not sent.
- A **Google app in Testing mode** expires refresh tokens after 7 days, and only listed test users can sign in (an unlisted one gets a 403 `access_denied`).
- The **demo** uses a simulated cell (no VM, no network policy) and a software phone key on the laptop; it shows the flow and the signature, not the protection of a Secure Enclave.
- A **host-wide OAuth refresh token** cannot be replaced by the runtime, so providers that rotate tokens (Microsoft) are per-person only.
- **Retention** deletes from the host's files; it is not secure erasure. A forgotten receipt no longer answers a repeat of its idempotency key.
- Like the vault, the **host operator can read** threads, memory, suggestions and per-person connection files.
- `POST` routes that take options treat an **empty body** as "no options"; a client should not rely on a 400 for that.
- A **file named `google-refresh-token.env`** is written where the consent script runs; it is git-ignored now, after a near miss (below).

## 6. Deliberately not doing

Approvals inside the agent chat; memory inside a cell; autonomous planning without the person accepting the plan; a suggestion that runs anything by itself;
copying another product's claims into our docs unsourced; claiming a Mac or Windows client for someone else's product; a Mac or Windows desktop as the cell;
silent training on trajectories. (See also [ROADMAP.md](ROADMAP.md#what-we-will-not-add).)

## 7. Housekeeping

- **The test VM** `~/keepvm` on the lab host (nested KVM, built by `keep-up.sh`) stays until you say to delete it.
- **Dependabot:** two open bumps in `zyvorai/fabric` (`rand` in `backend`, `thiserror` in `operator`), major-version bumps in other repos, and `zorvia#28` (needs a required review). See [TODO.md](TODO.md).
- **Old branches:** about 60 on the personal mirror `ssahani/zyvor-fabric` (mostly Dependabot) and the local `fix-pr-*`, `review/agent-runtime-v3`, `try-devops`.
- **A near miss to close:** a real Google refresh token was once staged by `git add -A` in a local checkout and blocked by GitHub push protection; it was never pushed and the commit was rewritten. An unreferenced local object still holds it until git cleans up. Revoke the access at <https://myaccount.google.com/permissions> and delete the token file and the downloaded client JSON when the demo is finished.
- **Disk:** Rust `target` directories are several GB each on the Mac and are safe to delete; a full disk stopped work once.
- **Known and unresolved:** the intermittent FluxVM eBPF refusal and the stale `qemu-nbd` on the lab host ([TODO.md](TODO.md)).

## 8. Documentation that was out of date and is fixed

Statements corrected in this change: the goals page said there was no planner; the memory page listed retention as not built; the agent-apps page said no agent-UI protocol existed. Each now says what is true. (The vendors table's line that phone-signed approvals were "not yet run with a waiting agent on a real cell" was left as it is: I could not confirm it either way.) This page's own suggestions row said a per-user retention setting and push notifications for a new suggestion were both unbuilt: the retention setting was real (a per-user `retention_days` now exists, `PUT /v1/suggestions/settings`); the notification was already fully built and tested (`notify::Notice`, `suggestions.rs`) — the row was simply wrong, corrected here rather than left to keep looking like open work.
