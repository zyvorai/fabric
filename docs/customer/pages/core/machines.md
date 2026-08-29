# Machines

## Purpose

Machines — a lower-level view of the VM driver's running instances and the raw disk images it can boot, with direct shell access into a running instance.

## When to use it

- To inspect a running instance's properties (state, leader, class, service, VSock CID) or grab its ready-made SSH command
- To run a one-off shell command against an instance without opening a full console
- To reboot, power off, or forcibly terminate an instance
- To pull a new raw image from a URL, or remove one you no longer need

## How to get there

- Route / id: `/machines`
- Nav: **Core → Machines** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

The page has two tabs, and refreshes itself every 10 seconds:

**Running Machines**

1. Click a machine in the left list to load its details on the right — properties (State, Leader, Class, Service, VSockCID) and, if available, a ready-to-copy SSH command.
2. Use the header buttons to **Reboot**, **Poweroff**, or **Kill** (force terminate) the selected machine.
3. Use the **Shell** panel to run a single command against the selected machine — type it and hit Enter or **Run**; output shows stdout, stderr, and the exit code.

**Images**

1. **Pull Image** — provide a source URL and a name to pull a new raw disk image.
2. The image table lists name, type, size, and whether it's read-only; remove one with the trash icon.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
