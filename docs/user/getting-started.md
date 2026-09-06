# Getting Started with Zyvor Fabric

## What you need

See [Admin basics](admin-basics.md) for ports and auth. Summary: open the Fabric web UI against the daemon API (`:9095`).

## 1. Open the product

Browse to `http://127.0.0.1:9095/` — the marketing home. Product pages: `/product`, `/platform`, `/security`.

## 2. Sign in

Open `/sign-in` (legacy `/login` redirects here). Use `admin` and the generated password (`./zyvor-fabricd-ctl password`).

## 3. Orient yourself

After sign-in you land on the console at `/app`. Use the left nav or `Ctrl/Cmd+K`. See [Using the Dashboard](using-the-dashboard.md) and the [page index](PAGE_INDEX.md).

## 4. First workflows

Follow [Common workflows](workflows.md) for the shortest useful paths (create a VM at `/app/create`, open `/app/vms`).

## Next steps

- [Using the Dashboard](using-the-dashboard.md)
- [Admin basics](admin-basics.md)
- [Page guides](pages/README.md)
- [Web UI guide](../getting-started/04-Web-UI.md)
