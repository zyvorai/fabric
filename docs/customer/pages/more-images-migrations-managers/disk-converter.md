# Disk Converter

## Purpose

Disk Format Converter — convert a single disk image between QCOW2, VMDK, VHD, VHDX, and RAW, tracking the conversion job's progress to completion.

## When to use it

- To convert an imported disk (e.g. a VMDK from another hypervisor) into QCOW2 before using it with a VM
- To produce a RAW or VHD/VHDX copy of a disk for a tool or target platform that needs a specific format
- To watch a long-running conversion through to completion without leaving the page

## How to get there

- Route / id: `/disk-converter`
- Nav: **More — images, migrations & managers → Disk Converter** (sidebar, command palette, or desktop nav)

## What you can do

1. **Pick a source disk** — choose from the dropdown of disk images already known to the host, or type a path directly (e.g. `/path/to/disk.vmdk`). If no images are listed, click **Load available disk images** to fetch them.
2. **Choose the target format** — QCOW2, VMDK, VHD, VHDX, or RAW.
3. **Output path** — auto-derived from the source path and target format (e.g. `disk.qcow2`); edit it manually if you want a different destination.
4. **Convert** — submits the job and starts polling its status every 2 seconds. A progress bar and percentage track it live through pending → running → completed/failed.
5. On failure, the error message from the backend is shown inline; on success, the output path is displayed. **Reset** clears the form and job state to start over.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
