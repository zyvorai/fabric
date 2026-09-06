# Upload Disk

## Purpose

Upload Disk Image — drag-and-drop (or browse) upload of a VM disk image file to the server, with live progress and an in-session upload history.

## When to use it

- To get a disk image onto the host so it can be used to create a VM
- To upload a disk exported or converted elsewhere for import
- To check what you've uploaded recently in this session

## How to get there

- Route / id: `/upload-disk`
- Nav: **More — images, migrations & managers → Upload Disk** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. The drop zone accepts drag-and-drop or click-to-browse. Only `.qcow2`, `.vmdk`, `.vhd`, `.vhdx`, `.raw`, `.img`, and `.ova` are accepted — anything else is rejected with an inline error.
2. Once a file is chosen, set the **Destination Directory** (defaults to `/var/lib/libvirt/images`) and click **Upload**.
3. The upload runs with a live progress bar — percent complete, bytes transferred/total, and transfer speed — and a **Cancel** button to abort mid-upload.
4. On success, a confirmation banner shows the saved path, format, and size, and the file is added to the **Upload History** list below (name, format, size, time) — this list only lasts for the current session and resets on page reload.
5. On failure — rejected format, network error, or cancellation — an error banner explains what happened.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
