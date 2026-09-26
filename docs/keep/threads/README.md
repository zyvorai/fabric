# Conversation threads

A thread is a person's conversation with one agent. It outlives any single session: the chat client keeps one thread while
the agent's sessions start and end. Threads live on the **host**, under `threads/<id>/` in the runtime's state directory
(`thread.json` plus an append-only `messages.jsonl`), never inside a cell.

**Status: the store and the HTTP API are built and tested. The AG-UI endpoint and the chat page do not use them yet**, so a
chat still starts from nothing after a reload (see [AGUI.md](../AGUI.md)). That wiring is the next change.

| Route | Who | What |
|---|---|---|
| `GET /v1/threads` | user (own) or operator (all) | Newest first. |
| `POST /v1/threads` | user or operator | `{"agent", "title"?, "client_thread_id"?}`. A user token is always its own owner; the operator names `user_id`. The same `client_thread_id` returns the same thread for the same user. |
| `GET /v1/threads/{id}` | owner or operator | The thread. |
| `GET /v1/threads/{id}/messages?after=<seq>&limit=<n>` | owner or operator | Messages with `seq > after`, oldest first, at most 500. |
| `DELETE /v1/threads/{id}` | owner or operator | Forgets the thread and every message on disk. |

**Isolation.** Another user's thread looks like one that does not exist (404). The journal records that a thread was deleted
(thread id, user, message count), never what was said. Tests: `threads::tests` and `tenancy_tests::threads_are_private_to_their_owner`.

**Limits.** 500 threads per user, 32 KiB per message (refused, not cut), 120-character titles, 500 messages per page.

**Not built yet.** Retention (threads are kept until forgotten), writing messages from a chat run, resuming a conversation
after the agent's session ended, and memory. Like the vault, the operator of the host can read this data; it is not
encrypted to the user.
