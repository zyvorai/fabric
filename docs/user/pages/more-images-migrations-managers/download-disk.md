# Download Disk

## Purpose

Download Disk — browse the disk images available on the Fabric host and download any of them straight to your machine.

## When to use it

- To pull a copy of a VM disk image off the host — for backup, for inspection, or to move it to another environment
- To check how much disk-image storage a host is using and how many distinct formats are present
- To locate an image that lives outside the default images directory by browsing a custom path

## How to get there

- Route / id: `/download-disk`
- Nav: **More — images, migrations & managers → Download Disk** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

- Review summary tiles for **Total Images**, **Total Size**, and how many distinct **Formats** are present (qcow2, vmdk, vhd/vhdx, raw, img — each gets its own color badge in the table).
- **Filter** the list by name, format, or path, and **sort** by Name, Size, or Modified (click a column header to sort, click again to reverse direction).
- Each row shows the image's name, format badge, size, last-modified time, and full path, with a **Download** button that streams the file to your browser.
- Use the **Custom Path** field to look at images outside the default directory: enter a file or directory path and click **Browse** to list what's there, or **Download** to fetch a specific file path directly (pressing Enter in the field also triggers a download).
- **Refresh** reloads the image list from the host.


5. **Empty / fail:** Check health, auth, and domain dependencies.
6. **Success:** Live data loads; mutations complete without error toasts.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
