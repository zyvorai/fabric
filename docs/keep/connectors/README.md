# Google connectors (Gmail, Calendar)

**Status: the credential mechanism, the per-person connections, the approval previews and three example agents are built and tested against a fake Google (a fake token endpoint and a fake TLS API). None of it has talked to real Google.** A live check needs a Google OAuth client and a test account, which only the owner can create ([TODO.md](../TODO.md)).

## How it works

A Keep agent never holds a Google token. The host holds the OAuth client id and secret and a long-lived **refresh token** in its own environment, mints short-lived **access tokens** from them, and adds `Authorization: Bearer ...` to the agent's request at the egress broker, after the usual checks (host, method, path, port, user, approval). The cell sees only a surrogate at most.

- Descriptor kind `oauth-refresh` in the credentials file (`ZYVOR_AGENT_CREDENTIALS_FILE`), with an `oauth` block: `token_url` (https; plain http only for loopback), `client_id_env`, `client_secret_env`, `refresh_token_env`, optional `refresh_margin_secs` (default 300).
- At start the runtime gets a first token for each such credential and then refreshes it in the background a few minutes before it expires (retrying with backoff, 15 s up to 5 min). If a refresh fails, the credential **fails closed** (requests using it are refused) until one works; the log names the credential and Google's error code (for example `invalid_grant`), never a secret.
- The token cache lives in memory only. The refresh token and client secret stay in the host environment, the same trust level as every other vault secret ([vault](../vault/README.md)): the operator of the host can read them.
- Google does not rotate refresh tokens in this flow. If you revoke the app in your Google account, the next refresh fails and the credential stays closed.

## Set it up

1. In the Google Cloud console, enable the Gmail API and Google Calendar API, configure the consent screen (add yourself as a test user), and create an OAuth client of type **Desktop app**.
2. Get a refresh token once, on your own machine:

   ```bash
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... scripts/keep-google-auth.py            # read-only mail and calendar
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... scripts/keep-google-auth.py --with-drafts   # also Gmail drafts
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... scripts/keep-google-auth.py --with-send --with-events   # also send mail and create events
   ```

   It opens your browser for consent (authorization code with PKCE on a loopback port) and writes `GOOGLE_REFRESH_TOKEN=...` to `google-refresh-token.env` with mode 0600. The token is not printed.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` in the Keep host's environment and merge [google.credentials.json](google.credentials.json) into the credentials file.
4. In an agent's manifest, list the credentials it may use, for example `"credentials": ["gmail-read", "calendar-read"]`, and call `https://gmail.googleapis.com/gmail/v1/users/me/messages` or `https://www.googleapis.com/calendar/v3/calendars/primary/events` through the egress broker.

## Per-person connections (one Google account for each person on the host)

The setup above gives the whole host one Google identity. On a host with several people ([TENANCY](../TENANCY.md)) each person connects their **own** account instead:

1. The operator keeps only the OAuth **client** in the host environment (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and merges [google.per-person.credentials.json](google.per-person.credentials.json) into the credentials file. Those descriptors set `"connection": "google"` in place of `refresh_token_env`; a descriptor sets one or the other.
2. Each person runs `scripts/keep-google-auth.py` on their own machine, then stores the token with their own user token:

   ```bash
   curl -X PUT "$KEEP/v1/connections/google" -H "Authorization: Bearer $USER_TOKEN" \
        -H 'content-type: application/json' \
        -d "{\"refresh_token\": \"$(sed 's/^GOOGLE_REFRESH_TOKEN=//' google-refresh-token.env)\"}"
   ```

   `GET /v1/connections` lists the connections this host offers and whether *you* have set each (never the token). `DELETE /v1/connections/google` disconnects: the stored token and every cached access token of that person are dropped at once.
3. When an agent of that person's session calls Gmail, Keep mints an access token from **that person's** refresh token and injects it. Another person's session never gets it, a session with no user cannot use a per-person credential at all, and a person who has not connected gets a refusal that says to connect first.

What this does and does not do: the refresh token is write-only over the API (never returned, listed, logged or journaled; the journal records only that a connection was set, removed or accessed by the operator) and is held in a host file (mode 0600), one per person. As with the vault, **the operator of the host can read those files**; per-person connections separate people from each other, not from the operator. A name can be set only if some credential on the host asks for it.

## The example credentials

| Name | Allows | Approval |
|---|---|---|
| `gmail-read` | `GET` under `/gmail/v1/users/me/` | none |
| `gmail-draft` | `POST` to exactly `/gmail/v1/users/me/drafts` (creates a draft; not `/drafts/send`, so it cannot send one) | every use needs a decision signed by the person's phone key; the host shows the message first |
| `gmail-send` | `POST` to exactly `/gmail/v1/users/me/messages/send` | the same |
| `calendar-read` | `GET` under `/calendar/v3/` | none |
| `calendar-write` | `POST` to exactly `/calendar/v3/calendars/primary/events` (creates an event; no edit or delete) | the same, and the host shows whether the guests are emailed |

An entry in `path_prefixes` that ends in `$` matches that exact path only. (An earlier version of `gmail-draft` listed the plain prefix `/gmail/v1/users/me/drafts`, which also matched `/drafts/send`, contrary to what this page said; it is now exact, and a request that is not a renderable message is refused anyway, see the next section.)

The scopes match: the auth script asks for `gmail.readonly` and `calendar.readonly` by default and adds `gmail.compose` with `--with-drafts`, `gmail.send` with `--with-send` and `calendar.events` with `--with-events`. Scopes are Google's limit; the descriptor's method and path lists are Keep's, and both apply. Ask only for what you use: `gmail.compose` also lets Google send mail, so with it the only thing between an agent and a send is Keep's path list and the approval.

## What the person sees before they approve

An approval that says only "POST to gmail.googleapis.com, 812 bytes" asks the person to sign something they cannot read. A descriptor can set `"preview": "gmail-message"` or `"calendar-event"` (only with `requires_approval`). The host then reads the **actual request body** and renders it into the approval, so an agent cannot describe one thing and send another:

- Mail: every `To`, `Cc`, `Bcc` (labelled hidden), `Reply-To` and `From` header, each repeat of one, the subject with encoded words decoded, the names of any other header, and the first 1500 characters of the text.
- Event: title, start and end (with zone, or all-day), guests, place, repeat rule, the notes, any other field it sets, and whether the guests are emailed (that depends on `sendUpdates` in the URL, which the approval's own URL leaves out).

The rendering is on the approval (`preview`, in `GET /v1/inbox` and `GET /v1/approvals` for its owner) so the phone can show it, and `planned_action.preview_sha256` is a digest of it, which the phone's signature therefore covers. Three rules keep it honest:

- **Fail closed.** A body the host cannot render faithfully is refused with 422 before anything is sent: HTML or multipart mail, attachments, another character set or transfer encoding, JSON that is not what the API takes, a `drafts/send` body with no message in it. Only plain-text (7bit or 8bit, UTF-8 or ASCII) mail can be approved for now.
- **Plain text.** Values are length-limited and stripped of control, zero-width and direction-changing characters, so a subject cannot display differently from what it is.
- **Not on the permanent record.** The rendering is dropped when the approval is decided or expires. It is never written to the audit journal, an operator webhook or a push relay; those carry the generic prompt and the digest only. Hence a relay or the journal learns that *something* was sent, not to whom.

## The example agents

`examples/keep-agents/`: no model, no network beyond Google, each granted only the credentials it needs.

| Agent | Does | Credentials |
|---|---|---|
| [`gmail-triage`](../../../examples/keep-agents/gmail-triage/) | lists unread inbox mail (sender, subject, date) | `gmail-read` |
| [`mail-compose`](../../../examples/keep-agents/mail-compose/) | saves a plain-text mail as a draft (the default), or sends it; refuses anything that could add a header or hide a recipient | `gmail-draft`, `gmail-send` |
| [`calendar-agent`](../../../examples/keep-agents/calendar-agent/) | lists your next 24 hours (up to 14 days), or adds one event; guests are emailed only when asked and only if there are any | `calendar-read`, `calendar-write` |

Talk to them from the chat page (`scripts/keep-chat.py --agent mail-compose`) or set structured input (`action`, `to`, `subject`, `body`; see each `agent.ts`). A refusal from the host (no Google account connected yet, denied on the phone, no answer within `egress_approval_timeout_seconds`, at most 240) is said in the reply instead of failing the run. The inputs `gmailBase` and `calendarBase` exist so tests can point an agent at a fake Google; the credential's host binding means a real credential still goes only to Google.

## Verified, and what is not

- Unit tests (`cargo test --lib credentials`): the refresh grant is sent with the client id, secret and refresh token; the token is cached and injected as `Bearer`; a refusal (`invalid_grant`) keeps the credential closed and leaks no secret into the error; an expired token is no longer used; the startup refresh; descriptor validation (https only, required fields); the method and path policy still applies.
- `agent-runtime/tests/keep-google-auth-test.py`: the consent script against a fake Google: PKCE and offline-access parameters, read-only scopes by default, drafts only with the flag, the code exchange, a wrong `state` or a refusal aborts, the file is mode 0600, and the refresh token is never printed.
- `cargo test --lib preview`, `egress`, `credentials`, `notify`: the renderer (recipients incl. Bcc and repeats, encoded words, control and direction characters, refusal of HTML, multipart, other encodings, oversize; events, guests, `sendUpdates`, malformed events); through the real egress path, the approval carries the rendering of the real body and a digest of it, the text is absent from the prompt, the planned action, the audit journal and the approvals file once decided, and an unrenderable body is refused (422) with no approval opened and nothing sent; a webhook and a relay payload never carry it; exact-path (`$`) matching; descriptor validation. The shipped example descriptor files are loaded and validated by a test.
- `sdk/agent-runtime/test/google-agents.test.js`: each agent against a fake `ctx.fetch`: which URL and credential it uses, that mail defaults to a draft, that anything that could add a header or hide a recipient is refused before any request, that guests are emailed only when asked, and how it reports a refusal from the host.
- `agent-runtime/tests/demos-ci.sh` (real runtime, real per-person credentials, real TLS to a fake Google over a throwaway CA, the deployed agents, a real phone key): before connecting the agent is told to connect and nothing reaches Google; gina's calls carry her token and hal is refused; a draft opens an approval showing the real recipients, subject and text; an unsigned decision is refused; the signed one lets exactly that draft through; the decided approval keeps no copy and the journal never held one; a denied send never reaches Google and an approved one does, once; an event shows its guests and that they are emailed; disconnecting closes her at once.
- **Not tested:** anything against real Google (consent screen behavior, Google's actual token response, scope names on your project, quota, an unverified-app warning). The example descriptors are a starting point until a live run on a test account.
- **Also not tested:** a real phone app rendering the preview (the fields are there in the API; no client shows them yet), and HTML or multipart mail, which are refused rather than shown.
