# Service Map

## Purpose

Service Map — shows the services discovered across your VMs, which ones depend on each other (protocol and port), and each service's current health.

## When to use it

- Understanding what a VM's service depends on, or what depends on it, before restarting or changing it
- Spotting degraded or down services at a glance
- Tracing a specific inbound or outbound connection between two services

## How to get there

- Route / id: `/service-map`
- Nav: **Monitoring → Service Map** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Summary cards show **Services**, **Healthy**, **Degraded**, and **Down** counts.
2. Service cards in a grid show name, a health dot (green/amber/red/gray), a type badge (web, database, cache, queue, api, proxy, …), the host VM, port, and inbound/outbound link counts.
3. Click a service card to filter the **Dependencies** list down to just that service's links (both directions); unrelated cards dim while one is selected. **Show all** clears the selection.
4. The Dependencies panel lists each link as `From → To` with its protocol and port.
5. The map refreshes automatically every 15 seconds; a manual refresh button is also in the page header.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
