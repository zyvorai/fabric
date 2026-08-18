# Image Builder

## Purpose

Image Builder — build custom VM disk images from scratch using [mkosi](https://github.com/systemd/mkosi), by picking a Linux distribution and a package list, and track builds from queued through to a finished image.

## When to use it

- To produce a custom VM image (e.g. Fedora with a specific package set) instead of hand-crafting one or downloading a generic base image
- To watch a build's status live as it progresses through pending / building / completed / failed
- To see the images an mkosi build already produced, alongside their format, size, and path

## How to get there

- Route / id: `/image-builder`
- Nav: **More — images, migrations & managers → Image Builder** (sidebar, command palette, or desktop nav)

## What you can do

1. **Build Image** — opens a dialog to configure a new build: an **Image Name**, a **Distribution** (Fedora, Ubuntu, Debian, CentOS, Arch Linux, or openSUSE), and a comma-separated **Packages** list (defaults to `systemd,openssh-server,iproute,vim-minimal`). Click **Build** to queue it; the page polls for updates every 5 seconds while builds are in progress.
2. **Active Builds** — shows any build currently `pending` or `building`, with its name, distribution, and state badge.
3. **Available Images** — lists finished images with name, format badge, size, and path.
4. **Build History** — shows completed and failed builds with name, distribution, status, and start time.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
