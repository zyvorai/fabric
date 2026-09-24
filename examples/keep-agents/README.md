# Keep packaged agents

| Pack | Purpose |
|---|---|
| [`infra-ops`](./infra-ops/) | Alerts, VMs, lifecycle — reboot/remediate behind ask |
| [`migration-op`](./migration-op/) | Fabric migrations + GuestKit inspect/rescue |
| [`deploy-op`](./deploy-op/) | `/readyz` + `/health` readiness artifact |
| [`browser-research`](./browser-research/) | Allowlisted a11y browse → research markdown |
| [`_fabric`](./_fabric/) | Shared client + credential/policy recipes |

```bash
./scripts/keep-pack-demo.sh infra-ops
```

Goals API: [docs/keep/goals/README.md](../../docs/keep/goals/README.md).
