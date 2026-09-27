# Try Keep on your own Gmail and Calendar (a demo on your laptop)

`scripts/keep-demo-google.sh` runs the [Gmail and Calendar agents](README.md) against **your** Google account, on this machine, in a few minutes. It is a demo, not a deployment: the agent's cell is a simulator (no VM, no network policy) and the "phone" is a key file on this machine. What is real is the part that matters for trust: Keep, not the agent, holds your Google token; the host mints short-lived access tokens; and a draft, a send or a new event waits for your decision, with the recipients, subject and text that **the host read out of the request**.

## What you do in Google (about 10 minutes, in your own browser)

I cannot do this part for you, and the client id and secret are for you alone; nobody else needs them.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project (any name, for example "Keep demo").
2. **APIs & Services → Library:** enable the **Gmail API** and the **Google Calendar API**.
3. **OAuth consent screen** (Google Auth Platform → Audience/Branding): user type **External**, publishing status **Testing**, and add **your own Google address as a test user**. Fill the app name and your email where it asks.
4. **Credentials → Create credentials → OAuth client ID:** application type **Desktop app**. Copy the **client ID** and the **client secret**.

Use a personal Gmail address if you can. A Google Workspace account (an address on your own domain) can work, but an administrator may block third-party OAuth apps.

## Run it

```bash
export GOOGLE_CLIENT_ID=...apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=...
./scripts/keep-demo-google.sh
```

- Your browser opens Google's consent page. Because the app is in Testing and unverified, Google shows a warning ("Google hasn't verified this app"): choose your test account, **Advanced → continue**. It asks for read access to mail and calendar, and, for the demo, drafts, sending and creating events. Each of those three stays behind an approval here.
- The script prints three chat addresses (mail reading, composing, calendar) and this terminal becomes the approver.
- **Read your unread mail:** open the first address and say `unread`. That reads your real inbox headers (sender, subject, date), and nothing is gated.
- **Draft a mail:** in the second address say
  ```
  draft
  to: you@example.com
  subject: Hello from Keep

  A test message.
  ```
  The chat shows "Waiting for your phone" with the recipients, subject and text. The terminal shows the same and asks; answer `y`. The draft appears in your Gmail Drafts. Nothing is sent. Use `send` in place of `draft` to send it, and try answering `n` to see that a denied send never reaches Google.
- **Calendar:** in the third address say `agenda`, or add an event (the [agent README](../../../examples/keep-agents/calendar-agent/README.md) has the format). Guests are only emailed if you say `notify: yes`.

Ctrl-C stops everything and deletes the temporary state. **Revoke access** any time at <https://myaccount.google.com/permissions>. The consent step writes `google-refresh-token.env` in the directory you ran it from (mode 0600): delete it when you are done.

## What to expect, honestly

- While the app is in Testing, Google expires the refresh token after **7 days**; run the consent step again then.
- The three agents were only ever run against a fake Google until now ([README](README.md#verified-and-what-is-not)). This demo is the first run against the real thing, so expect to find something: a wrong scope name, a response shape I assumed, a quota. If a step fails, the chat says why (Google's error code, never a token). Send me that message and I will fix it.
- The terminal approver is not a phone: the key file is on this machine, so it shows the flow and the signature, not the protection a phone's Secure Enclave gives. `scripts/keep-approve.py` is the same signing path a phone app uses.
- Sending real mail from a demo is real: use your own address as the recipient.

## What was tested without your account

The script's own plumbing ran end to end with a made-up client id: the runtime started, the agents deployed, the connection was stored, and a chat run reached Google's real token endpoint, which refused the made-up client (`invalid_client`); the chat showed that, and the made-up token appeared nowhere in the output. The approval flow (preview, signature, the terminal approver) ran against the fake Google in `demos-ci.sh`. Nothing in this repository has yet run with a real Google account.
