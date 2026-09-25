# Keep packaged agents

| Pack | Purpose |
|---|---|
| [`infra-ops`](./infra-ops/) | Alerts, VMs, lifecycle — reboot/remediate behind ask |
| [`migration-op`](./migration-op/) | Fabric migrations + GuestKit inspect/rescue |
| [`deploy-op`](./deploy-op/) | `/readyz` + `/health` readiness artifact |
| [`browser-research`](./browser-research/) | Allowlisted a11y browse → research markdown |
| [`pdf-brief`](./pdf-brief/) | One-click PDF → `brief.md` (no browser, 0 CONNECT) |
| [`invoice-check`](./invoice-check/) | A use case **you** define: `kind: usecase`, no code |
| [`_fabric`](./_fabric/) | Shared client + credential/policy recipes |

```bash
./scripts/keep-pack-demo.sh infra-ops
./scripts/keep-demo.sh list                     # one-click use cases; keep-demo.sh <id>
./scripts/keepctl deploy examples/keep-agents/invoice-check --test   # deploy your own
```

Every pack has a `pack.json` (kind `usecase`, `agent` or `builtin`): see [docs/keep/PACKS.md](../../docs/keep/PACKS.md).

Goals API: [docs/keep/goals/README.md](../../docs/keep/goals/README.md).
