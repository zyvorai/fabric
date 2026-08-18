# ISO Images

## Purpose

ISO Images — a read-only inventory of installer and driver ISO files sitting in the host's configured images directory, showing which VMs currently have each one attached.

## When to use it

- Before creating a VM that boots from an OS installer ISO, to confirm the file is present on the host and copy its exact path
- To check whether a VirtIO driver ISO (`virtio-win`) is available for installing or upgrading Windows guest drivers
- To see which VMs have a given ISO attached before deleting or replacing that file on the host
- To search a large images directory by name or path

## How to get there

- Route / id: `/iso-images`
- Nav: **More — images, migrations & managers → ISO Images** (sidebar, command palette, or desktop nav)

## What you can do

- **Search** ISOs by name or path.
- Each row shows the ISO's name, path, size, last-modified time, and the list of VMs that currently have it attached (**Attached VMs**); ISOs named for `virtio-win` get a small **virtio-win** badge next to the name.
- The list auto-refreshes every 30 seconds, and you can trigger an immediate refresh from the page header.
- If no ISOs are found, the empty state reminds you to place ISO files in the configured images directory on the host — this page doesn't upload or manage ISOs itself, only lists them.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
