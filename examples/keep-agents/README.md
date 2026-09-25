# Keep packaged agents

| Pack | Purpose |
|---|---|
| [`infra-ops`](./infra-ops/) | Alerts, VMs, lifecycle — reboot/remediate behind ask |
| [`migration-op`](./migration-op/) | Fabric migrations + GuestKit inspect/rescue |
| [`deploy-op`](./deploy-op/) | `/readyz` + `/health` readiness artifact |
| [`browser-research`](./browser-research/) | Allowlisted a11y browse → research markdown |
| [`pdf-brief`](./pdf-brief/) | One-click PDF → `brief.md` (no browser, 0 CONNECT) |
| [`_fabric`](./_fabric/) | Shared client + credential/policy recipes |

```bash
./scripts/keep-pack-demo.sh infra-ops
./scripts/keep-demo-pdf.sh   # or console /app/keep → Brief this PDF
```

Goals API: [docs/keep/goals/README.md](../../docs/keep/goals/README.md).
