# Migration Templates

## Purpose

Migration Templates — reusable migration configuration presets (disk format, vCPUs, memory, network, compression) that you can copy as JSON instead of re-entering the same settings for every migration.

## When to use it

- To reuse a standard configuration — e.g. Production Linux, Dev/Test Linux, Windows Server — instead of retyping settings each time
- To define your own template for a migration shape you repeat often
- To grab a ready-made JSON config snippet to paste into a migration elsewhere

## How to get there

- Route / id: `/migration-templates`
- Nav: **More — images, migrations & managers → Migration Templates** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Three **built-in** templates are always available — Production Linux (4 vCPU / 8 GB, bridged, qcow2, compressed), Dev/Test Linux (2 vCPU / 2 GB, user networking, uncompressed), and Windows Server (4 vCPU / 16 GB, bridged, qcow2, compressed, virtio). They're tagged **Built-in** and can't be deleted.
2. **New Template** opens a form — Name, Description, Format (QCOW2 / RAW / VMDK), vCPUs, Memory (MB) — **Add** saves it as a custom template.
3. Each template card shows its format, vCPU, memory, and network at a glance. The **Copy** icon copies the config as JSON to your clipboard (confirmed with a checkmark).
4. Custom templates get a **Delete** (trash) icon; built-ins don't.
5. Custom templates are saved to your browser's local storage only — they aren't a server-side resource, so they won't follow you to another browser or survive clearing site data.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
