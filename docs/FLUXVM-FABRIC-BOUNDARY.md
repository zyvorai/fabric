# FluxVM ↔ Zyvor Fabric ownership contract

<!-- ZYVOR_RUNTIME_BOUNDARY_V1 -->

**GuestKit prepares the disk. FluxVM runs one machine. Fabric runs the cloud.**

## Ownership

| Capability | FluxVM | Fabric |
|---|---|---|
| QEMU / Cloud Hypervisor / Firecracker / in-tree KVM | owns | consumes |
| VMM process lifecycle and device state | owns | orchestrates |
| TAP/netns and VM-edge TC/eBPF | owns | policy + UX |
| Memory/device snapshots | owns mechanism | catalog/retention/DR |
| Live-migration VMM transport | owns mechanism | destination, reservation, audit, rollback |
| VFIO/SR-IOV/mdev attach | owns mechanism | inventory + scheduling |
| Node image cache | owns | populates |
| Global content library | no | owns |
| Host placement / DRS / HA / fencing / evacuation | no | owns |
| Multi-site replication / site recovery | no | owns |
| Tenant/project/RBAC/quotas/billing | minimal node auth only | owns |
| Kubernetes `MicroVM` ephemeral runtime | standalone FluxVM surface | no |
| Kubernetes private-cloud `VirtualMachine` | no | Fabric operator |

## Migration contract v1

Fabric discovers FluxVM with `GET /v1/runtime/capabilities` and drives the
source runtime through typed endpoints. The legacy Fabric migration path that
used iterative `rsync` and finally `machinectl start` is fail-closed for
`live=true`; it must not be used with the FluxVM-only architecture.

The new `migration::RuntimeMigrationManager` is deliberately a
**prepared-target** API. Before calling `start_prepared_target`, Fabric must:

1. select and reserve the target node;
2. validate CPU/device/network compatibility;
3. confirm shared storage or prepare identical target storage;
4. create/arm the target FluxVM incoming receiver;
5. select a protected migration network/URI;
6. call source-side migration and monitor status;
7. atomically update Fabric inventory after completion;
8. roll back/fence on failure according to HA policy.

Step 4 is the next FluxVM runtime contract revision. Until that receiver API
lands and an end-to-end KVM-host test passes, Fabric must not market native
live migration as GA.

Fabric exposes the source-side contract on the control plane:

| Fabric API | Role |
|---|---|
| `GET /api/runtime/capabilities` | Proxy FluxVM runtime contract |
| `POST /api/vms/{name}/migration/native/start` | Start prepared-target transport |
| `GET /api/vms/{name}/migration/native/status` | Poll progress |
| `POST /api/vms/{name}/migration/native/cancel` | Cancel in-flight transport |

CLI: `zyvorctl runtime capabilities` and `zyvorctl runtime migrate …`.

## Service Fabric fan-out

`POST/DELETE /api/dataplane/services` go through the `service-lb` crate. By
default Fabric applies Maglev intent only to `driver.fluxvm_url`. Optional
`driver.fluxvm_nodes` entries (`name`, `url`, `token`) fan the same intent to
additional FluxVM nodes with snapshot/rollback on mid-fanout failure.

## Standalone FluxVM fleet mode

`fluxvm-agent` stays useful as a lightweight standalone multi-host option. It
is not the home for Fabric-class etcd HA, DRS, datacenters, fencing, site
recovery, tenant placement or enterprise content-library semantics.
