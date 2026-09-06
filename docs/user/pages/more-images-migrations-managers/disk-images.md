# Disk Images

## Purpose

Disk Images — a read-only inventory of the VM disk images present on the host: name, format, size, and path for each one.

## When to use it

- To see at a glance how many disk images exist on the host, their total footprint, and which formats are in use
- To find a specific image by name, format, or path before referencing it elsewhere (e.g. when creating a VM from a custom disk path)
- To select one or more images as a quick visual tally before acting on them from another page

## How to get there

- Route / id: `/disk-images`
- Nav: **More — images, migrations & managers → Disk Images** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

- Review summary tiles for **Total Images**, **Total Size**, distinct **Formats**, and how many rows you currently have **Selected**.
- **Search** by name, format, or path to narrow the table.
- Click a row (or its checkbox) to select/deselect it — selection is local to the page and just feeds the Selected counter; there's no bulk action attached to it here.
- Each row shows the image's name, a color-coded format badge (qcow2, vmdk, vhd/vhdx, raw, img), size, and full path.
- **Refresh** reloads the list from the host.


5. **Empty / fail:** Check health, auth, and domain dependencies.
6. **Success:** Live data loads; mutations complete without error toasts.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
