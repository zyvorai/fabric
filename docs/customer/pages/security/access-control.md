# Access Control

## Purpose

Access Control — manage the user accounts that can sign in to Zyvor Fabric: create accounts, assign a role (admin, operator, or viewer), and enable/disable or delete them.

## When to use it

- To create a login for a new team member and decide up front what they're allowed to do
- To temporarily lock a user out without deleting their account
- To see at a glance who has admin access, or when someone last logged in
- To remove an account that's no longer needed

## How to get there

- Route / id: `/access-control`
- Nav: **Security → Access Control** (sidebar, command palette, or desktop nav)

## What you can do

1. Review the four stat tiles — Total Users, Admins, Operators, Viewers — for a quick read on who has access.
2. Click **Add User** to open the inline form: enter a username (3-32 characters — letters, numbers, hyphens, underscores), a password (8+ characters), and pick a role by clicking **Admin**, **Operator**, or **Viewer**. Bad input is caught client-side before it's submitted.
3. Review the user table: avatar/username, role badge, an **Active/Disabled** toggle, created date, and last login (or "Never" if they haven't signed in).
4. Flip a user's **Active/Disabled** toggle directly in the table to lock them out or restore access without deleting the account.
5. Delete a user with the trash icon — a confirmation dialog ("Delete user \"...\"?") must be accepted first.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
