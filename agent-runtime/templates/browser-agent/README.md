# browser-agent template

A FluxVM sandbox template with Node.js and Chromium, sized like a per-user
desktop-style agent VM (2 vCPU, ~7.7 GB). Use it with a per-user home volume:

```json
{
  "template": "browser-agent",
  "resources": {"vcpus": 2, "memory_mib": 7900},
  "home_volume": {"name": "browser-home", "guest_path": "/home/agent", "per_user": true},
  "egress_mode": "sentinel",
  "egress_allow_hosts": ["example.com"]
}
```

## Build

Same flow as Tutorial 11, on the FluxVM host. Download Node.js first (the image
build has no network for `commands`); Chromium comes from the Debian package
list, which does have DNS.

```bash
curl -fsSL -o /tmp/node20.tar.xz \
  https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz
# edit the /path/to/fluxvm entries in build.json, then:
sudo fluxvm --config /etc/fluxvm.toml build-image --spec build.json
sudo mkdir -p /var/lib/fluxvm/templates/browser-agent
sudo cp spec.json /var/lib/fluxvm/templates/browser-agent/spec.json
```

The base is Debian 12 because Ubuntu's `chromium-browser` is a snap stub that
does not run in a chroot. `spec.json` uses the QEMU backend (needed for home
volumes) and pins `max_vcpus`/`max_memory_mib`, which FluxVM treats as the
ceiling for a manifest's `resources`.

## Keeping browser traffic on the broker

The guest starts with `ZYVOR_EGRESS_PROXY` set to the runtime's HTTPS CONNECT
proxy (`ZYVOR_AGENT_PROXY_LISTEN`, default `0.0.0.0:18083`). Tunnels go through
the agent's allowlist, `ask`/`sentinel` review, DNS pinning, the private-network
gate, and are journaled as `egress.connect`. See `browser-example.mjs`.

Two limits to know about:

- The proxy sees only `host:port` of a TLS connection. It cannot inject
  credentials, and it cannot review URL paths. Only `CONNECT` to the ports in
  `ZYVOR_AGENT_PROXY_CONNECT_PORTS` (default `443`) is served; plain `http://` is refused.
- **It only constrains a guest that has no other route out.** The template's
  network must reach only the host gateway; if FluxVM gives the guest direct
  internet access, a browser (or any program) can ignore the proxy. Verify with
  `curl --noproxy '*' https://example.com` from inside a session: it must fail.
