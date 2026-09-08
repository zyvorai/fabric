# Sign in

## Purpose

Sign-in screen for Zyvor Fabric. Authenticates against the local admin account or a configured identity provider / PAM user on the host.

## When to use it

- Whenever you're not signed in — protected `/app` routes redirect here if the session is missing or expired
- To sign in as the local admin, or with your own system account

## How to get there

- Route: `/sign-in` (legacy `/login` redirects here)
- From marketing pages: **Sign in** in the top nav
- After signing in you land on the console at `/app`

## Operate from the console (UX)

1. Enter a **username** and click **Continue**.
2. Enter your **password** and sign in — a failed attempt shows an inline error.
3. On success you are taken to `/app` (dashboard).
4. Two common ways to sign in: **local admin** — username `admin`, password from `.admin_password` on the host — or your own **system user** account when PAM/OIDC is configured.

If you can't sign in, confirm the account exists and that `zyvor-fabricd` is reachable.

## Related pages

- Marketing home: `/`
- Console dashboard: `/app`
- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
