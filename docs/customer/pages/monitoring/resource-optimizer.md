# Optimizer

## Purpose

Optimizer — a right-sizing advisor that analyzes each VM's actual resource usage and recommends CPU/memory/disk adjustments, with a one-click apply per VM.

## When to use it

- Checking whether VMs are over- or under-provisioned before a capacity or cost review
- Applying a recommended resource change without manually editing a VM's spec
- Triaging which VMs have high-impact recommendations first

## How to get there

- Route / id: `/resource-optimizer`
- Nav: **Monitoring → Optimizer** (sidebar, command palette, or desktop nav)

## What you can do

1. Summary cards show **VMs Analyzed**, total **Recommendations**, **High Impact**, and **Medium Impact** counts.
2. If nothing needs changing, the page shows an "All VMs are optimally configured" state instead of a list.
3. Otherwise, one card per VM lists its recommendations: the affected resource, current value → recommended value, the reason, and an impact badge (High / Medium / Low, color- and icon-coded).
4. **Auto-Optimize** per VM applies all of that VM's recommendations via a single call to the VM's optimize endpoint — the button spins while applying, then becomes a disabled "Applied" state and reports how many changes were applied vs. skipped.
5. Manual refresh is available from the page header.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
