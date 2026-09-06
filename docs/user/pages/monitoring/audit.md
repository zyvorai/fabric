# Audit

## Purpose

Audit Logs — the security and compliance trail of who did what: every tracked action, which user performed it, on which resource, whether it succeeded, and from what IP address.

## When to use it

- To investigate who created, deleted, started, or stopped a specific VM (or other resource) and when
- To check recent failures for signs of misconfiguration or unauthorized attempts
- To pull an export of the audit trail for a compliance review or incident report

## How to get there

- Route / id: `/app/audit`
- Nav: **Monitoring → Audit** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Stats row** — total logs, success rate, recent failures, and the top 3 most common actions.
2. **Search** — free-text search box matches against action, user, resource name, and resource type; press Enter or the results filter live as you type.
3. **Filters** — toggle the Filters panel to narrow by Status (success/failed) and Resource Type (VM, network, storage, template, quota, schedule); **Clear Filters** resets both the filters and the search box.
4. **Export** — the Export button downloads the currently filtered log set as JSON or CSV.
5. **Logs table** — each row shows a relative timestamp, the acting user, the action (color-coded: green for create/start, red for delete/stop, amber for update/edit), the resource type and name, a success/failed status badge (with the error message inline if it failed), and the source IP address. The footer shows how many of the total logs match the current filters.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
