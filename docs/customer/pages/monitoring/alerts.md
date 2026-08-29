# Alerts

## Purpose

Alerts — a live view of currently firing system alerts and the notification rules that generate them, polling for updates automatically.

## When to use it

- To see at a glance whether anything is critical or warning-level right now
- To check what an active alert actually means before deciding whether to act
- To review which alert rules are configured and enabled, and at what threshold they fire

## How to get there

- Route / id: `/alerts`
- Nav: **Monitoring → Alerts** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Active Alerts summary** — three stat tiles at the top show the total number of active alerts, how many are critical, and how many are warning-level.
2. **Active Alerts list** — each alert is a card showing its severity badge (critical/warning/info), timestamp, title, message, and the triggering value when one is available. Cards are left-bordered in red, amber, or blue to match severity. If nothing is currently firing, the list shows "No active alerts".
3. **Alert Rules table** — when rules exist, a table lists each rule's name, condition, threshold, severity, and whether it's enabled (Yes/No). This is a read-only view of what's configured, not an editor.
4. The page refreshes itself every 5 seconds in the background; if a background refresh fails, a small amber banner notes it and continues showing the last known data rather than clearing the screen. Use the header's refresh control to force an immediate reload.

This page is read-only — there's no way to acknowledge, mute, or create alerts/rules from here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
