# Autoscale

## Purpose

Autoscale — define per-VM policies that automatically grow or shrink a VM's vCPUs and memory within set bounds based on load, and review the history of scaling actions that were triggered.

## When to use it

- To let a VM's resources flex automatically instead of manually resizing it under load
- To cap how far a VM is allowed to scale (min/max vCPUs, min/max memory) so autoscaling can't run away
- To check what scaling actions actually fired and when, via the recent scale events log

## How to get there

- Route / id: `/autoscale`
- Nav: **Operations → Autoscale** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Review the policy table — one row per VM, showing its vCPU range, memory range, CPU scale-up/scale-down thresholds, and cooldown period (seconds between scaling actions).
2. **Create Policy** opens a form to pick a VM (only VMs without an existing policy are offered) and set min/max vCPUs, min/max memory (MB), CPU scale-up and scale-down thresholds (%), and the cooldown in seconds.
3. **Delete** a policy from its row (confirmation required) to stop autoscaling that VM.
4. Check **Recent scale events** — a scrolling log of the last 20 scaling actions (VM, action, resource, timestamp) so you can see what autoscale actually did.
5. On a read-only account, the create/delete controls are hidden and a read-only notice is shown instead.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
