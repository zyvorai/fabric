# Profiles

## Purpose

Profiles (shown in the UI as **Instance Types**) — a library of VM sizing presets (vCPUs, memory, disk, and optionally network bandwidth) you can pick instead of hand-tuning resources every time you create a VM.

## When to use it

- To review available instance-type presets and their specs, grouped by category (general, compute, memory, storage, GPU)
- To create a reusable custom profile for a sizing you use often
- To remove a custom profile you no longer need — built-in profiles can't be deleted

## How to get there

- Route / id: `/app/profiles`
- Nav: **Core → Profiles** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. Browse profile cards — each shows its category badge, description, CPUs, memory, disk, and network bandwidth (if set). Built-in profiles are labeled **Built-in** and have no delete button.
2. **Create Profile** opens a form for a name, category, CPU count, memory (MB), and disk (GB); submitting adds it to the grid immediately.
3. Delete a custom profile with the trash icon on its card — built-in profiles can't be removed this way.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
