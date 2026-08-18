# Content Library

## Purpose

Content Library — a catalog of reusable provisioning building blocks: libraries of templates/ISOs/OVFs/scripts, guest customization specs (per-OS hostname/domain/DNS settings), and host compliance profiles.

## When to use it

- To organize VM templates, ISOs, OVF packages, and scripts into named libraries instead of scattering them across storage paths
- To define a reusable guest customization spec (hostname prefix, domain, DNS servers) for Linux or Windows guests
- To check host compliance profile status — how many hosts are compliant vs. non-compliant against a profile

## How to get there

- Route / id: `/content-library`
- Nav: **Operations → Content Library** (sidebar, command palette, or desktop nav)

## What you can do

Summary tiles at the top show total libraries, items, guest customization specs, and host profiles. Four tabs underneath:

1. **Libraries** — cards showing each library's status, item count, and total size. **Create Library** names it, sets an optional description, chooses **Local** or **Subscribed** type, and requires a storage path. **Browse** jumps to the Item Browser tab filtered to that library; the trash icon deletes a library and all its items (confirmation required).
2. **Item Browser** — a table of every item across libraries (template, ISO, OVF, script, or file), with type, version, size, and last-updated date. Filter to one library via the dropdown, or view all. Delete an item from its row (confirmation required).
3. **Guest Customization** — a table of customization specs (OS type, hostname prefix, domain, DNS servers). **Create Spec** sets the name, Linux/Windows OS type, hostname prefix, domain, and a comma-separated DNS server list. Delete a spec from its row (confirmation required).
4. **Host Profiles** — a table of profiles with compliant/non-compliant host counts and status. **Create Profile** sets a name and optional description. Delete a profile from its row (confirmation required).

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
