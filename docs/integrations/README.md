# Zyvor Fabric Integrations

Third-party and companion products that connect to the Zyvor Fabric control plane (`vmspawnd`).

| Integration | Status | Document |
|-------------|--------|----------|
| **Machina** (macOS AI infrastructure workbench) | Planned v0.1 | [machina.md](machina.md) |
| Kubernetes operator | Shipped | [../operator/README.md](../../operator/README.md) |
| Terraform | Shipped | [../terraform-provider/README.md](../../terraform-provider/README.md) |
| Ansible | Shipped | [../ansible/README.md](../../ansible/README.md) |
| Prometheus | Shipped | [../guides/operations/monitoring.md](../guides/operations/monitoring.md) |

All integrations use the same REST + WebSocket API surface documented in [api.md](../api.md) and [backend/api-docs/openapi.yaml](../../backend/api-docs/openapi.yaml).
