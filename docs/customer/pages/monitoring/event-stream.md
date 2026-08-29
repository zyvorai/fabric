# Event Stream

## Purpose

Event Stream — a live, scrolling log of VM lifecycle events (create, start, stop, delete, and similar) pushed over an authenticated SSE connection as they happen. There's no history — you only see events that occur while the page is open.

## When to use it

- To watch VM lifecycle activity happen in real time, e.g. while running a script that creates or tears down several VMs
- To confirm an action you just took (start, stop, delete) actually registered
- To catch error/warning-level events as they occur without polling a log page

## How to get there

- Route / id: `/event-stream`
- Nav: **Monitoring → Event Stream** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Connection indicator** — shows Connected (green) or Reconnecting… (amber, pulsing) for the underlying SSE connection.
2. **Pause / Resume** — pause freezes the view and drops incoming events instead of queuing them; resume starts appending new events again from that point on.
3. **Clear** — empties the current list of events shown (does not affect the connection).
4. **Level filter** — narrow the view to All, Info, Warning, Error, or Debug; level is inferred from the event type (e.g. an event type containing "fail" or "error" shows as Error).
5. Each line shows the time, level, source VM name, and message. The stream keeps the most recent 500 events and auto-scrolls to the newest as they arrive (unless paused). If nothing is happening on the fleet, it simply reads "Waiting for events…" — that's expected, not a failure.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
