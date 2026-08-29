# Live Metrics

## Purpose

Live Metrics — a real-time view of host performance: CPU, memory, disk I/O, and network throughput, each as a rolling sparkline that updates once per second.

## When to use it

- Watching load in real time while you run a benchmark or try to reproduce a slow VM
- Confirming the host is actually under CPU, memory, disk, or network pressure right now
- Pausing the feed to freeze a spike so you can read the exact numbers or take a screenshot

## How to get there

- Route / id: `/live-metrics`
- Nav: **Monitoring → Live Metrics** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

- Six live cards — CPU Usage, Memory Usage, Disk Read, Disk Write, Network RX, Network TX — each showing the current value and a 60-second sparkline history, polled every second.
- Network RX/TX are computed rates (bytes/sec), derived on the client from the delta between successive cumulative counter samples — not raw totals.
- **Pause / Resume** — freezes or resumes the 1-second polling loop; useful for holding a spike still to inspect it.
- A status dot next to Pause/Resume shows **Streaming** (green, pulsing), **Paused** (amber), or **Error** (red).
- If a background refresh fails after data has already loaded, an amber banner reports it while continuing to show the last known values instead of blanking the page.
- If the first load fails, an error banner replaces the cards with retry hints.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
