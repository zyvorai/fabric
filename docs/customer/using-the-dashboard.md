# Using the Dashboard

Zyvor Fabric is organized by navigation groups (sidebar, desktop nav, or CLI command groups). Use search / command palette when available.

## Surfaces

| Need | Path |
|------|------|
| Dashboard | `/` |
| VMs | `/vms` |
| DRS / FT | `/drs`, `/fault-tolerance` |
| Site Recovery | `/site-recovery` |
| Settings | `/settings` |

## Browse vs act

Inventory and status views are safe to explore. Mutating actions (deploy, migrate, sign, remediate) follow role gates and confirmation dialogs — review impact first.

## Related

- [Getting Started](getting-started.md)
- [Page-by-page guides](pages/README.md)

## Operate from the console (UX)

1. Open this route from the nav or command palette and wait for live API data.
2. Use filters/search when present; drill into a row for detail.
3. For mutating actions: confirm role gates and impact before applying.
4. **Empty / fail:** Check service health, auth, and that required CRDs/backends for this domain are installed.
5. **Success:** Live data loads; created/updated objects appear without error toasts.

