# calendar-agent

`agenda` (the default) lists your next 24 hours (`days` up to 14). `add` creates one event, after a phone-signed approval that shows the title, time, guests and whether the guests are emailed ([what the person sees](../../../docs/keep/connectors/README.md#what-the-person-sees-before-they-approve)).

```
add
title: Dinner
start: 2026-10-01T19:00:00+02:00      <- or a date, 2026-10-01, for an all-day event
end: 2026-10-01T21:00:00+02:00
guests: ana@example.com, ben@example.com
where: Home
notify: yes                            <- only then are the guests emailed
```

No edit or delete: the `calendar-write` credential allows only creating an event. Not run against real Google.
