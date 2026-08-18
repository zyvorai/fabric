# Plugins

## Purpose

Plugin Manager — enable, disable, and review the server extensions installed on Zyvor Fabric (storage, network, security, monitoring, and backup plugin types).

## When to use it

- To see which plugins are installed and whether each is running, stopped, or erroring
- To turn a plugin on or off without restarting the whole service
- To check a plugin's version and author before relying on it

## How to get there

- Route / id: `/plugins`
- Nav: **Security → Plugins** (sidebar, command palette, or desktop nav)

## What you can do

1. Review the four stat tiles: Total Plugins, Running, Errors, and Types (distinct plugin categories installed).
2. Browse the plugin cards — each shows name, version, a type badge (storage/network/security/monitoring/backup), status (running/stopped/error), description, and author when provided.
3. Click **Enable**/**Disable** on a card to toggle it; the button shows a spinner while the request is in flight and the card's status updates immediately after.

This page is enable/disable only — there's no install or configure-plugin flow here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
