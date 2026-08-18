# Login

## Purpose

Login — the sign-in screen for the Zyvor Fabric dashboard. Authenticates against either the local admin account or a Linux (PAM) system account on the host.

## When to use it

- Whenever you're not signed in — it's what loads for any route if your session is missing or has expired
- To sign in as the local admin, or with your own Linux system account instead

## How to get there

- Route / id: `/login`
- Nav: **Auth → Login** (sidebar, command palette, or desktop nav)

## What you can do

1. Enter a username and password and sign in — a failed attempt shows an inline error and clears the password field.
2. Check **Remember me** to save your login in the browser (locally, not on the server) so it's pre-filled next time; unchecking it clears any saved login.
3. Toggle the eye icon to show or hide the password as you type.
4. Switch the dashboard's visual theme (Dark, Steel, Aurora) from the top-right control — cosmetic only, unrelated to signing in.
5. Two ways to sign in, both explained on the page: **local admin** — username `admin`, password from `.admin_password` on the host — or your own **system user** account (same password as SSH; accounts that only use SSH keys need a password set with `passwd` on the server first).

If you can't sign in, confirm the account exists on the host and that the authentication service is reachable.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
