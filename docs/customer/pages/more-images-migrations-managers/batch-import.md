# Batch Import

## Purpose

Batch Import — bulk-create VMs from a YAML or JSON list, with a preview step and a per-VM status readout as each one is submitted.

## When to use it

- To stand up several VMs at once (e.g. `web-01`, `db-01`, `app-01`) from a single definition file instead of using the Create VM wizard repeatedly
- To reprovision from a saved YAML/JSON inventory of VMs — one you maintain outside the product (a script, a checked-in file) — starting from the downloadable template as a model
- To spot bad entries (missing name or image) before anything is created, and see exactly which VMs succeeded or failed if some fail

## How to get there

- Route / id: `/batch-import`
- Nav: **More — images, migrations & managers → Batch Import** (sidebar, command palette, or desktop nav)

## What you can do

1. **Provide the input** — drag and drop a `.yaml`/`.yml`/`.json` file onto the drop zone (or click to browse), or paste YAML/JSON directly into the text box. Each entry needs a `name` and `image`; `cpus` and `memory` are optional and default to `2` and `2G`. Click **Download Template** for an example file with three sample VMs.
2. **Preview** — click **Preview** to parse the input into a table of VMs. If entries are missing a name or image, or nothing parses, you get an inline error instead of moving on.
3. **Review the table** — each row shows the VM's name, vCPUs, memory, and image path, plus a status icon (pending, submitting, submitted, or failed).
4. **Submit All** — creates the VMs one at a time via the VM creation API. Each row's status updates live as it's submitted; failed rows show the specific error message under the image path. A summary line at the top tracks total, submitted, and failed counts.
5. **Back to Editor** — return to the input step to fix and re-preview without losing your place.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
