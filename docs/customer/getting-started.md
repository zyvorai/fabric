# Getting Started with Zyvor Fabric

## What you need

See [Admin basics](admin-basics.md) for ports and auth. Summary:

Open the Fabric web UI against the daemon API (`:9095`).

## 1. Open the product

Open the Fabric web UI against the daemon API (`:9095`).

## 2. Sign in / authenticate

External OIDC + JWT bearer.

## 3. Orient yourself

Use the quick map on the [customer docs home](README.md), then open the home surface (`/`).

## 4. First workflows

Follow [Common workflows](workflows.md) for the shortest useful paths.

## Next steps

- [Using the Dashboard](using-the-dashboard.md)
- [Admin basics](admin-basics.md)
- [Page guides](pages/README.md)

## Operate from the console (UX)

1. Open this route from the nav or command palette and wait for live API data.
2. Use filters/search when present; drill into a row for detail.
3. For mutating actions: confirm role gates and impact before applying.
4. **Empty / fail:** Check service health, auth, and that required CRDs/backends for this domain are installed.
5. **Success:** Live data loads; created/updated objects appear without error toasts.

