# Zyvor Fabric web UX conventions

Shared patterns for errors, empty lists, and shell chrome in [`web/src/`](../web/src/).

## Themes

Three dark themes cycle from the navbar palette control:

| Theme | Class |
|-------|--------|
| `dark` | default slate shell |
| `steel` | `.steel-theme` industrial accents |
| `aurora` | `.aurora-theme` prismatic accents |

Stored in `localStorage` as `Zyvor Fabric-theme`.

## Primitives

| Component | Use when |
|-----------|----------|
| [`EmptyState`](../web/src/components/ui/EmptyState.tsx) | Zero rows; include primary CTA |
| [`ErrorBanner`](../web/src/components/ErrorBanner.tsx) | Page load or action failure with hints |
| [`PageHeader`](../web/src/components/ui/PageHeader.tsx) | Title, description, refresh, primary action |
| [`WizardStepper`](../web/src/components/WizardStepper.tsx) | Multi-step Create VM / wizard flows |
| [`Breadcrumb`](../web/src/components/Breadcrumb.tsx) | Path trail on detail/settings pages |
| [`CopyButton`](../web/src/components/CopyButton.tsx) | Clipboard copy with toast |
| [`PageSkeleton`](../web/src/components/PageSkeleton.tsx) | Suspense fallback for lazy routes |
| [`HelpDialog`](../web/src/components/HelpDialog.tsx) | Shortcuts and About (Zyvor links) |

## API errors

Daemon returns `{ "error": "…", "error_code": "operation_failed" }` on failure.

| Utility | Use when |
|---------|----------|
| [`formatHttpErrorBody`](../web/src/utils/apiError.ts) | Parsing non-OK `fetch` bodies |
| [`formatUserError`](../web/src/utils/apiError.ts) | Any `catch` shown in toasts or banners |
| [`toastFailure`](../web/src/utils/toastError.ts) | `toastFailure(toast, 'Label', e)` shorthand |

Do not display raw HTML or bare `error_code` strings. [`Toast.tsx`](../web/src/components/Toast.tsx) sanitizes error messages.

Rust mirror: [`api-error`](../backend/crates/api-error/) crate; TUI uses `format_http_error_body` for failed start/stop/snapshot HTTP responses.

### Domain hints

[`daemonHints.ts`](../web/src/utils/daemonHints.ts) exports `hintsForError(err, domain?)` for contextual banner copy (machined, storage, auth). Wire via `ErrorBanner` `hints={hintsForError(loadError, 'vm')}` on Dashboard, VM list/detail, Storage, Network, and tier-2 Operations pages.

### Stable codes

| Code | User label |
|------|------------|
| `operation_failed` | The operation failed on the server |
| `not_found` | The requested resource was not found |
| `machined_connection` | Could not reach the VM driver backend (systemd-machined, or Ephemera if `driver.backend = "ephemera"`) |
| `invalid_request` | The request was invalid |
| `forbidden` | You do not have permission |
| `unauthorized` | Authentication required or session expired |

## Shell

- **Command palette** — `Ctrl/Cmd+K`; fuzzy search VMs and pages; pin/recent pages
- **Sequence shortcuts** — `g` then `d`/`v`/`n`/`s`/`c`/`l`/`b`/`i`/`e`
- **Help** — `?` or navbar Help menu
- **Connection** — [`ConnectionStatus`](../web/src/components/ConnectionStatus.tsx) WebSocket live badge

## Login

[`Login.tsx`](../web/src/pages/Login.tsx) uses [`PremiumLoginShell`](../web/src/components/PremiumLoginShell.tsx) with aurora/particles; disabled when `prefers-reduced-motion` is set.

## TUI (`zyvorctl-tui`)

Machina-aligned **GuestKit** orange theme, inventory sidebar, `:` colon commands (`:vms`, `:dashboard`, `:start`, `:stop`, `:snap`, `:refresh`, `:help`), `/` fuzzy search, styled confirmation overlay (`[y]` red / `[n]` green), recent tasks bar, 3s toasts. Failed VM actions parse API `error_code` via `format_http_error_body`.

## Dashboard health cards

`GET /api/v1/capabilities` returns subsystem phases (`off` | `unreachable` | `live`) for **machined**, **storage**, **network_security**, **auth**, and **events**. The dashboard reads these via [`PlatformInfoContext`](../web/src/contexts/PlatformInfoContext.tsx) and refreshes every 30s.

## Create VM wizard

Canonical route: **`/create`**. `/vm-wizard` redirects to `/create`.

[`CreateVM`](../web/src/pages/CreateVM.tsx) uses [`WizardStepper`](../web/src/components/WizardStepper.tsx) with three gated steps:

1. **Basics** — name, image picker from `GET /api/images` plus manual path override
2. **Resources** — vCPUs, memory presets, disk size (GB), optional advanced panel (boot, display, CPU mode applied after create)
3. **Review** — summary and submit (`name`, `image`, `cpus`, `memory`, `disk`)

Back/Next buttons only show fields for the active step.

## Page errors (tier 2)

Operations and infrastructure pages use `loadError` + [`ErrorBanner`](../web/src/components/ErrorBanner.tsx) + `toastFailure`: Templates, Logs, Machines, Schedules, Storage Pools, Disk Images, Audit Logs, Notifications, Migrations, System Health, Favorite VMs. Use `Promise.allSettled` when loading multiple catalogs.

## Breadcrumbs

[`Breadcrumb`](../web/src/components/Breadcrumb.tsx) on VM detail, Settings, Machines, Storage Pools, Backups, and migration subpages. Labels come from [`routeLabels`](../web/src/utils/routes.tsx).

## Build

```bash
cd web && npm install && npm run build
cd web && npm run typecheck
cd web && npm test
```

Production UI is [`web/`](../web/) (router-based). Legacy state SPA: [`web-legacy/`](../web-legacy/).
