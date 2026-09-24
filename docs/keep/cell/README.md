# Agent cell

Untrusted agent runtime runs in a **Firecracker / FluxVM microVM**, not only
nspawn/bubblewrap on the host kernel.

- No raw secrets, no `CAP_NET_ADMIN`, no host filesystem.
- Admin plane is **vsock only** — no SSH to the agent.
- Optional `ttl_seconds` for throwaway research cells.
- Interim (fabric today): FluxVM sandbox + bubblewrap `InnerContainer::Strict`.
  Keep 0.1 target: Firecracker as the cell so escape still hits a hypervisor
  before the vault.
