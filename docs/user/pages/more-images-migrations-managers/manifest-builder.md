# Manifest Builder

## Purpose

Manifest Builder — a client-side form for assembling a VM configuration manifest and exporting it as YAML, with a live preview as you type. It doesn't create a VM or call the API; it's a scratchpad for drafting config to copy elsewhere.

## When to use it

- To hand-draft a VM manifest for a provisioning script, IaC pipeline, or ticket without going through the Create VM wizard
- To sketch settings the Create VM wizard doesn't expose — TPM, Secure Boot, CPU mode, console type, or `user`/`bridge`/`tap` networking — and get syntactically valid YAML for them
- To generate a quick YAML snippet to share with a teammate or paste into documentation

## How to get there

- Route / id: `/manifest-builder`
- Nav: **More — images, migrations & managers → Manifest Builder** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Fill in fields under four collapsible sections — **VM Configuration** (expanded by default), **Network**, **Storage**, and **Advanced** — clicking a section header expands or collapses it.
2. Set VM name, vCPUs, memory, disk image path, and firmware (`uefi`/`bios`) under VM Configuration; network type (`user`/`bridge`/`tap`), bridge name, and MAC address under Network; disk format (`qcow2`/`raw`/`vmdk`), disk size, and a read-only-root checkbox under Storage; and TPM, Secure Boot, console type (`serial`/`virtio`/`none`), and CPU mode (`host`/`max`/`qemu64`) under Advanced.
3. Leave any field blank or unchecked — it's simply omitted from the generated YAML, so you only need to fill in what matters for your use case.
4. Watch the **YAML Preview** pane update live as you type, grouped by section with a generated timestamp comment at the top.
5. **Copy** the YAML to your clipboard, or **Download** it as a `.yaml` file named after the VM (falls back to `vm-manifest.yaml` if no name is set).


5. **Empty / fail:** Check health, auth, and domain dependencies.
6. **Success:** Live data loads; mutations complete without error toasts.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
