# VM Console

## Purpose

VM Console — a real, live console into a running VM, from the browser, without SSH or any other client installed.

## When to use it

- To reach a VM that isn't network-reachable yet (no IP assigned, no SSH configured)
- To watch or interact with boot output, a serial console, or a full graphical desktop
- To debug a VM that's otherwise unresponsive over the network

## How to get there

- Route / id: `/vms/:name/console`
- From a VM's detail page, click **Console** in the header
- Nav: reached via **Core → Virtual Machines**, not linked directly from the top nav

## Operate from the console (UX)

The page has two tabs:

1. **Terminal** — a real interactive shell (xterm.js) streamed over the VM's PTY. Type as you would in any terminal; output renders live.
2. **VNC** — a real graphical framebuffer session (noVNC), for VMs where a text console isn't enough — installers, desktop environments, or anything that draws to the screen. Shows actual rendered pixels, not just a placeholder.

Both are authenticated with your existing session — no separate console password or exposed port.

If the console tab stays black or disconnected, confirm the VM is running and that the host's console/VNC services are reachable — check service health if it persists.


5. **Empty / fail:** Check health, auth, and domain dependencies.
6. **Success:** Live data loads; mutations complete without error toasts.

## Related pages

- [Virtual Machines](vms.md)
- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
