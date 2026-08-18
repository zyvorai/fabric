# Templates

## Purpose

VM Templates — reusable VM configurations (CPU/memory/disk, tags) that you save from an existing VM and use to stamp out new VMs quickly, instead of configuring resources from scratch each time.

## When to use it

- To create a new VM with the same resource configuration as one you've already tuned
- To standardize resource sizing across a team (e.g. a "small-dev" or "large-prod" template)
- To browse the templates already saved and their specs before deciding which to use

## How to get there

- Route / id: `/templates`
- Nav: **Operations → Templates** (sidebar, command palette, or desktop nav)

## What you can do

1. Templates aren't created directly on this page — click **Create from VM** to jump to the [Virtual Machines](../core/vms.md) page, where a template is saved from an existing VM's configuration.
2. Each saved template shows as a card with its name, description, CPUs, memory (MB), disk size (GB), tags, and creation date.
3. **Create VM** on a template card opens a dialog asking only for a new VM name, then deploys a new VM using that template's saved resource configuration.
4. **Delete** removes a template (confirmation dialog, cannot be undone) — this does not affect VMs already created from it.
5. If no templates exist yet, the page shows an empty state pointing you to the VMs page to create one.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
