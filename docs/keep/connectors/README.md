# Google connectors (Gmail, Calendar)

**Status: the credential mechanism is built and tested against a fake token endpoint. It has never talked to real Google.** A live check needs a Google OAuth client and a test account, which only the owner can create ([TODO.md](../TODO.md)).

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
   ```

   It opens your browser for consent (authorization code with PKCE on a loopback port) and writes `GOOGLE_REFRESH_TOKEN=...` to `google-refresh-token.env` with mode 0600. The token is not printed.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` in the Keep host's environment and merge [google.credentials.json](google.credentials.json) into the credentials file.
4. In an agent's manifest, list the credentials it may use, for example `"credentials": ["gmail-read", "calendar-read"]`, and call `https://gmail.googleapis.com/gmail/v1/users/me/messages` or `https://www.googleapis.com/calendar/v3/calendars/primary/events` through the egress broker.

## The three example credentials

| Name | Allows | Approval |
|---|---|---|
| `gmail-read` | `GET` under `/gmail/v1/users/me/` | none |
| `gmail-draft` | `POST` under `/gmail/v1/users/me/drafts` (creates a draft; sending is not allowed by this credential) | every use needs a decision, signed by the user's phone key |
| `calendar-read` | `GET` under `/calendar/v3/` | none |

Sending mail and creating or editing events are **not** enabled by these examples. Add them the same way only with `requires_approval` and `require_device_signature`, so the action is decided on the user's device and bound to its content.

The scopes match: the auth script asks for `gmail.readonly` and `calendar.readonly` by default and adds `gmail.compose` only with `--with-drafts`. Scopes are Google's limit; the descriptor's method and path lists are Keep's, and both apply.

## Verified, and what is not

- Unit tests (`cargo test --lib credentials`): the refresh grant is sent with the client id, secret and refresh token; the token is cached and injected as `Bearer`; a refusal (`invalid_grant`) keeps the credential closed and leaks no secret into the error; an expired token is no longer used; the startup refresh; descriptor validation (https only, required fields); the method and path policy still applies.
- `agent-runtime/tests/keep-google-auth-test.py`: the consent script against a fake Google: PKCE and offline-access parameters, read-only scopes by default, drafts only with the flag, the code exchange, a wrong `state` or a refusal aborts, the file is mode 0600, and the refresh token is never printed.
- **Not tested:** anything against real Google (consent screen behavior, Google's actual token response, scope names on your project, quota, an unverified-app warning). The example descriptors are a starting point until a live run on a test account.
