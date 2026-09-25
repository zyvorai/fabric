# chat-export-digest

An exported chat in, a one-page digest out: who talks most, the plans and times people agreed, open questions, money
mentioned and links. Written for the `.txt` export that WhatsApp and similar apps produce
(`12/03/2025, 09:14 - Ana: text`); other layouts still get the plans, questions, money and links, but the speaker
count needs that line shape, so adjust the first pattern for your app.

```bash
./scripts/keepctl deploy examples/keep-agents/chat-export-digest --test
```

**Scenario.** A user exports a group chat from their phone and shares it to the vendor app; the app posts it to
`POST /v1/demos/chat-export-digest` with the user's token.

No model reads the chat. It does not read images, voice notes or attachments: the export is text.

These are personal files. The cell has no network (the run reports `0` outbound connections) and no model reads the file, but the evidence class is `software-test`: whoever operates the host could still read a cell's memory. Do not promise more than that ([VENDORS.md](../../../docs/keep/VENDORS.md)).
