# Replication

## Purpose

Replication — register remote replication sites, configure per-VM replication to them with a target RPO (recovery point objective), and monitor sync health and RPO compliance across your fleet.

## When to use it

- To register a secondary (or bidirectional) site that VMs can replicate to
- To start replicating a VM to another site with a target RPO in minutes
- To pause or resume replication for a VM without tearing down the configuration
- To check overall replication health, or find which VMs are currently violating their RPO target

## How to get there

- Route / id: `/replication`
- Nav: **Operations → Replication** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Dashboard tab** — summary tiles for active replications, RPO violation count, average RPO across all replications, and paused/error counts, plus a per-site health list (healthy/degraded/unhealthy) with each site's replication count.
2. **Sites tab** — table of registered replication sites (name, type, endpoint, status, replication count, last sync). **Add Site** registers a new site with a name, endpoint URL, and type (Primary, Recovery/secondary, or Bidirectional). Each site can be removed (confirmation dialog).
3. **Replications tab** — table of per-VM replication configs showing target RPO, status, live sync progress bar, last/next sync time. **Configure Replication** sets up a new one: VM ID, source site, target site, and RPO in minutes. Active replications can be **paused**; paused ones can be **resumed**.
4. **RPO Violations tab** — table of replications currently missing their target RPO, showing target vs. current RPO, compliance status, bandwidth usage, sync count, and failure count. Shows "All replications are compliant" when there are none.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
