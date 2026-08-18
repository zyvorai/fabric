# Kernel

## Purpose

Kernel — a snapshot of the host's kernel configuration: version, hostname, architecture, boot command line, loaded kernel modules, and sysctl parameters. This is static configuration, not live activity — for that, see Debug Tools or Event Stream.

## When to use it

- To confirm what kernel version, architecture, or boot parameters the host is running
- To check whether a specific kernel module is loaded and what's using it
- To look up the current value of a sysctl parameter without shelling in

## How to get there

- Route / id: `/kernel`
- Nav: **Monitoring → Kernel** (sidebar, command palette, or desktop nav)

## What you can do

1. **Summary tiles** — Kernel Version, Hostname, Architecture, and Modules Loaded count.
2. **Boot Command Line** — shown verbatim in a code block when the backend reports one.
3. **Kernel Modules table** — name, size, and "used by" (dependent modules) for each loaded module, capped at the first 100 matching rows. A **Filter modules** box narrows the table live by module name.
4. **Sysctl Parameters table** — key/value pairs for the sysctl settings the backend reports, shown in full (no filter).
5. The page refreshes itself every 10 seconds; use the header refresh control to force an immediate reload. This page is read-only — there's no way to load a module or change a sysctl value from here.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
