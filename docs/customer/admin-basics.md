# Admin Basics (Zyvor Fabric)

## Ports / access

| Port | Service |
|------|--------|
| **9095** | Daemon / API / production web UI |
| **5173** | Vite UI (dev) |

Web routes: marketing `/`, `/product`, `/platform`, `/security`; sign-in `/sign-in`; console `/app/*`.

## Auth

JWT bearer (local admin by default). Optional LDAP/OIDC.

Sign in at `http://127.0.0.1:9095/sign-in`, then open `/app`.

### JWT secret and admin password

Both are auto-generated (cryptographically random, 64 chars) on first start if unset, and
persisted to disk so they survive restarts — never a hardcoded or predictable default:

| Env var | Default when unset | Persisted at |
|---------|---------------------|--------------|
| `ZYVOR_FABRICD_JWT_SECRET` | Random, generated once | `/var/lib/zyvor-fabricd/.jwt_secret` (mode 0600) |
| `ZYVOR_FABRICD_ADMIN_PASSWORD` | Random, generated once — never defaults to `admin` | `/var/lib/zyvor-fabricd/.admin_password` |

Retrieve the generated admin password:

```bash
cat /var/lib/zyvor-fabricd/.admin_password
```

Set your own at deploy time instead by exporting the env var before first start — once a
value is persisted to disk, it's reused across restarts even if the env var is later
unset, so set it before the very first run if you want a specific value from day one.

## Install sketch

Follow the product README and deploy/Helm docs in the repository. Verify health endpoints or CLI status before opening the UI.

## Related

- [Getting Started](getting-started.md)

## Operate from the console (UX)

1. Open this route from the nav or command palette and wait for live API data.
2. Use filters/search when present; drill into a row for detail.
3. For mutating actions: confirm role gates and impact before applying.
4. **Empty / fail:** Check service health, auth, and that required CRDs/backends for this domain are installed.
5. **Success:** Live data loads; created/updated objects appear without error toasts.

