# Running Zyvor Fabric in Docker or Podman

Two containers: `zyvor-fabricd` (the daemon + web console) and `ephemera` (the VM engine Fabric
drives over REST at `127.0.0.1:7788`). Fabric alone can serve the API and console, but can't
create/start/stop a real VM without Ephemera reachable.

## Host prerequisites

These are genuine host-level requirements, not something either container's tooling papers over:

- **`nbd` kernel module, loaded before you start the stack**: `sudo modprobe nbd max_part=16`.
  Ephemera's NBD-backed storage and GuestKit's image-customization step both need this, and it
  cannot be reliably loaded from inside a container (Ephemera's own Kubernetes docs already state
  this as a host prerequisite there too).
- **`/dev/kvm` present and accessible** (`ls -l /dev/kvm`) -- Ephemera's QEMU backend needs it
  directly.
- **A rootful container engine.** Both containers run with `network_mode: host`, `/dev/kvm` access,
  and capabilities like `CAP_SYS_CHROOT`/`CAP_SETUID`/`CAP_SETGID` that fight rootless Podman's user
  namespace model. Use `sudo podman ...` (or a rootful Podman machine), not rootless. Docker's
  default install is already rootful.
- **cgroup v2** -- Ephemera's cgroup crate writes directly to `/sys/fs/cgroup`; the `ephemera`
  service's `cgroup: host` setting depends on this.

## Build

Fabric's own image is a plain single-context build; Ephemera's needs the sibling `guestkit` repo
supplied as a second BuildKit build context, which a compose `build:` block can't express portably
across Docker Compose and Podman Compose versions -- so it's built with a small script instead:

```bash
# Ephemera and guestkit checked out as siblings of this repo (../Ephemera, ../guestkit)
./scripts/build-container-images.sh                 # defaults to podman
BUILDER=docker ./scripts/build-container-images.sh  # or explicitly docker
```

## Run (eval profile)

```bash
docker compose up -d      # or: podman compose up -d
curl http://localhost:9095/health
```

Auth stays **on** even in this profile -- unauthenticated requests are read-only by design, so
disabling auth wouldn't let you create/start/stop a VM anyway, just browse. Log in at
`http://localhost:9095/app` (or `POST /api/auth/login`) with username `admin`, password
`eval-admin-only` (fixed and documented, overridable via `ZYVOR_FABRICD_ADMIN_PASSWORD` -- this is
not a real secret, don't reuse it anywhere else). TLS is off, so it's plain HTTP.

### Port

Both compose files listen on `9095` by default, overridable with `ZYVOR_FABRICD_PORT` -- useful for
running alongside a bare-metal `zyvor-fabricd` on the same host, or just to avoid a clash:

```bash
ZYVOR_FABRICD_PORT=19095 docker compose up -d
curl http://localhost:19095/health
```

This is backed by a real env var the daemon itself reads, `ZYVOR_FABRICD_LISTEN`
(`backend/zyvor-fabricd/src/config.rs`), which overrides whatever `daemon.listen` the loaded TOML
config sets. The same variable works for a bare-metal install too -- set it in
`/etc/zyvor-fabricd/zyvor-fabricd.env`, which `systemd/zyvor-fabricd.service`'s `EnvironmentFile=`
already loads, no unit file change needed.

Auth and TLS are both off in this profile (`configs/zyvor-fabricd-docker.toml`) -- it's for local
dev only, don't expose it beyond localhost. Open `http://localhost:9095/app` for the console.

## Run (production)

```bash
cp docker-compose.prod.example.yml docker-compose.prod.yml
cp configs/zyvor-fabricd-prod.toml.example configs/zyvor-fabricd-prod.toml
# edit secrets, then:
REGISTRY=... TAG=v1.0.0 docker compose -f docker-compose.prod.yml up -d
```

This profile requires `ZYVOR_FABRICD_ADMIN_PASSWORD` and `ZYVOR_FABRICD_JWT_SECRET`, enables auth and
TLS (self-signed by default -- replace `/etc/zyvor-fabricd/tls/{server.crt,server.key}` with a real
cert for anything beyond an internal network), and expects pre-built, pinned images rather than
building locally.

## Why `network_mode: host`

`zyvor-fabricd`'s nftables/rtnetlink calls need to act on the *host's* real network namespace to
manage actual VM traffic -- `CAP_NET_ADMIN` etc. only grant control over whatever netns the process
is actually in. Running both containers on the host network is also what lets Fabric reach Ephemera
at its default `127.0.0.1:7788` with zero config changes, the same reason Ephemera's own Kubernetes
DaemonSet sets `hostNetwork: true`. This is intentional, not a hardening gap to close later -- it
mirrors the capability grants the bare-metal systemd deployment already has.

## Known gaps in this container profile

- **Guest-agent injection into VM images doesn't work yet.** `/vendor/zyvor-guest-agent`
  (served by the daemon for a VM's cloud-init to fetch) is a vendor binary this repo's own build
  doesn't produce -- run `scripts/build-vendor-binaries.sh` separately and mount the result into
  `/var/lib/zyvor-fabricd/vendor/` if you need this.
