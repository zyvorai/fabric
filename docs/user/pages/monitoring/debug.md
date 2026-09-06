# Debug Tools

## Purpose

Debug Tools — raw, terminal-style output from four classic Linux diagnostic commands (top, iostat, vmstat, netstat) against the host, rendered as monospace panels. This is the closest the dashboard gets to SSHing in and running commands yourself.

## When to use it

- To check live process/CPU activity, disk I/O, virtual memory stats, or network connections on the host without opening a shell
- To troubleshoot a performance problem in real time, side by side across all four views
- When Kernel or Analytics show something is wrong and you need the raw command output to confirm it

## How to get there

- Route / id: `/debug`
- Nav: **Monitoring → Debug Tools** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Four independent panels** — Top, IOStat, VMStat, and NetStat, each backed by its own endpoint and showing raw output lines in a scrollable monospace box.
2. Panels don't load automatically — each starts with "Click Refresh to load data" until you refresh it (individually, via the **Refresh** button in that panel's header) or use **Refresh All** in the page header to load all four at once.
3. **Auto-refresh** — toggle the switch in the header to re-pull all four panels every 3 seconds; useful for watching a metric change live. Turn it off when you're done to stop the polling.
4. If a panel's fetch fails, that panel shows its own error message rather than blocking the others.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
