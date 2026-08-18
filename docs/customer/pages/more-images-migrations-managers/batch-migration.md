# Batch Migration

## Purpose

Batch Migration Builder — a form-based editor for assembling a multi-VM migration job spec (source disk, target format, sizing) and exporting it as JSON. It builds the spec only; it does not run the migration itself.

## When to use it

- To describe several VMs' migrations (source disk path, target format, vCPUs, memory) in one place before handing the job to a migration tool or pipeline
- To generate a JSON migration manifest you can copy into another tool, save as a file, or version-control
- To sketch out a batch of conversions (e.g. from VMDK to QCOW2) without touching a text editor

## How to get there

- Route / id: `/batch-migration`
- Nav: **More — images, migrations & managers → Batch Migration** (sidebar, command palette, or desktop nav)

## What you can do

1. **Add VM** — adds a new, expanded entry card to the list; each is numbered in order.
2. **Fill in each entry** — VM Name, Source Path (e.g. `/path/to/disk.vmdk`), Target Format (QCOW2, RAW, or VMDK), vCPUs, and Memory (MB). Click an entry's header to collapse or expand it; the collapsed view still shows the name and source path for quick scanning.
3. **Remove** — the trash icon on an entry deletes it from the list.
4. **JSON Preview** — as soon as you have at least one entry, a live JSON preview builds the migration spec (`migrations: [...]` with `vm_name`, `source_path`, `target_format`, `cpus`, `memory_mb` per entry).
5. **Copy** or **Download** the generated JSON to use elsewhere — Copy puts it on the clipboard (with a brief confirmation), Download saves it as `batch-migration.json`.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
