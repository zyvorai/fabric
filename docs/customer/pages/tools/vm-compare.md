# VM Compare

## Purpose

VM Comparison — a side-by-side diff of two VMs' configurations, run on demand against the live VM list.

## When to use it

- To see what differs between two VMs before assuming they're equivalent (useful when troubleshooting "why does this one behave differently")
- To confirm a newly cloned or templated VM actually matches its source
- To audit configuration drift between two VMs that are supposed to be identical

## How to get there

- Route / id: `/vm-compare`
- Nav: **Tools → VM Compare** (sidebar, command palette, or desktop nav)

## What you can do

1. Pick a **Source VM** and **Target VM** from two dropdowns populated from your VM list (the target list excludes whichever VM is already chosen as source).
2. Click **Compare** (disabled until both are selected) — calls `GET /api/vms/compare?source=…&target=…`.
3. Results appear as a table: one row per compared field, with Source value, Target value, and a Match column (Yes in green, No in amber) so mismatches jump out.
4. Use the refresh control in the header to re-fetch the VM list if it's out of date.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
