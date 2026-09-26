# Personal memory

Short notes a person lets their agent keep between conversations: a preference, a fact, a habit. It is built to be the opposite of a
hidden profile: **off until the user turns it on, edited and deleted by the user, and every entry says where it came from.**

**Status: the store and the HTTP API are built and tested. Nothing in the runtime hands memory to an agent yet, and agents cannot propose
entries yet** (the store can hold proposals, and the user can accept or refuse them, but no agent event creates one). Those two steps are the next change; this one is the part that has to be right first.

| Route | What |
|---|---|
| `GET /v1/memory` | `{enabled, items, proposals}`: active entries, and proposals waiting for the user. |
| `PUT /v1/memory/settings` | `{"enabled": true\|false}`. Turning it off stops use and keeps the entries; nothing can be added while it is off. |
| `POST /v1/memory` | `{"text", "kind"?, "pinned"?, "expires_in_days"?}`; `kind` is `preference`, `fact` or `note`. |
| `PATCH /v1/memory/{id}` | Change `text`, `pinned` or `expires_in_days` (`null` removes the expiry). |
| `DELETE /v1/memory/{id}` | Forget one entry. |
| `DELETE /v1/memory` | Forget everything (the on/off choice stays). Journaled as a count. |
| `POST /v1/memory/{id}/accept`, `/reject` | Decide an agent's proposal. Accepting makes it active; rejecting deletes it. |

**Provenance.** Each entry has an `origin` (`user` or `agent`), a `source` (thread, message, session when known) and `tainted`: set on a proposal
from a session that had read untrusted content, so a poisoned suggestion is visible in the review list and stays flagged after it is accepted.

**Isolation.** A user token reaches only its own memory (`?user_id=` is ignored for it); another user's entry id is a 404. The operator must name
`user_id`, and every operator access is journaled as `keep.memory.operator_access` (the action, never the text). Like the vault, the operator of the
host can read the files under `memory/`: they are **not encrypted to the user**.

**No secrets.** Text that looks like a credential (`l7::scan`: private keys, cloud and GitHub tokens, JWTs and similar) is refused, naming the shape and not the text.

**Limits.** 2000 bytes per entry, 200 active entries and 50 waiting proposals per user, expiry up to 3650 days; expired entries are dropped.

**Tests.** `memory::tests` (7: off by default, restart, validation and credentials, proposals not used until accepted and taint kept, context bounded and off when memory is off, expiry and limits) and
`tenancy_tests::memory_is_private_opt_in_and_decided_by_the_user` (two users and the operator against the real router, including cross-user probes and that memory text never reaches the journal). Mutation check: letting a user token honor `?user_id=` fails that test.

**Not built yet.** Handing entries to an agent as context (`MemoryStore::context_for` is the one way memory leaves the module, and nothing calls it yet), agents proposing entries, a memory view in the chat page and Solvor, retention for memory, and encryption to the user.
