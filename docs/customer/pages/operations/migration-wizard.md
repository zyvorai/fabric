# Migration Wizard

## Purpose

Migration Wizard — a three-step wizard (Source → Configure → Review) for converting an existing disk image (local file or remote host) into a new Zyvor Fabric VM.

## When to use it

- To bring in a VM from elsewhere — a disk image sitting on the local filesystem, or one reachable over SSH on a remote host
- To convert a disk image to a different format (QCOW2, RAW, or VMDK) as part of importing it
- To size the resulting VM's vCPUs and memory and decide whether it should auto-start once migration finishes

## How to get there

- Route / id: `/migration-wizard`
- Nav: **Operations → Migration Wizard** (sidebar, command palette, or desktop nav)

## What you can do

**1. Source** — choose **Local File** (a disk image path, e.g. `/path/to/disk.vmdk`) or **Remote Host** (an `user@hostname:/path` target reachable over SSH).

**2. Configure** — set the new VM's name, target disk format (QCOW2, RAW, or VMDK), vCPUs (1–64), memory (MB, in 256 MB steps), the output directory for the converted image (defaults to `/var/lib/zyvor-fabricd/images`), and whether to auto-start the VM once migration completes.

**3. Review & Submit** — shows a summary of everything chosen, then **Submit Migration** posts the job. Success or failure is shown inline on this step (with hints on failure); you can't resubmit once it succeeds. Use **Back** at any point to revisit an earlier step before submitting.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
