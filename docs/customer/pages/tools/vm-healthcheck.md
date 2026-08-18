# VM Health Check

## Purpose

VM Health Check — runs a set of health verification checks against a single VM, on demand, and reports pass/warning/fail per check plus an overall status.

## When to use it

- Before or after a change, to confirm a VM is still in good health
- To triage a VM you suspect is unhealthy, with a per-check breakdown instead of just up/down
- Before promoting a VM to production or handing it off

## How to get there

- Route / id: `/vm-healthcheck`
- Nav: **Tools → VM Health Check** (sidebar, command palette, or desktop nav)

## What you can do

1. Select a VM from the dropdown, populated from your VM list.
2. Click **Run Health Check** — calls `GET /api/vms/{name}/healthcheck`.
3. An overall status banner reports **Healthy** or **Issues Found**, with a "X of Y checks passed" summary.
4. Each individual check is listed with a status icon (pass / warning / fail), a message, and an optional detail line (e.g. the specific value or error behind the check).
5. If the check run itself fails (not the same as a failing check — this is a request error), an error banner appears with a retry button.
6. Use the refresh control in the header to re-fetch the VM list if it's out of date.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
