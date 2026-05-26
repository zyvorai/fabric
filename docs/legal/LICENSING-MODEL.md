# Licensing model (draft)

**All Zyvor product code is proprietary.** There is no open-source (Apache, MIT, LGPL, or similar) distribution of PacketWolf, Ragnarok, Aether, HyperSDK, or GuestKit. Access is by written agreement or the deploy EULA in [LICENSE](../../LICENSE).

## License types

| Layer | License | Products |
|-------|---------|----------|
| Self-hosted / binaries | Proprietary EULA | PacketWolf, Ragnarok, Aether, GuestKit, HyperSDK tooling |
| Enterprise subscription | MSA + ELA + Order Form | Full feature set per tier |
| Hosted SaaS (if offered) | Proprietary + MSA | zyvor.dev cloud |
| Branding | Trademark policy | All product names |
| AI models / rules / automation packs | Commercial | NetPredator intelligence, remediation |

Third-party libraries used in builds (e.g., Rust crates) remain subject to **their** licenses; that does not make Zyvor’s product source or binaries open source.

## Tiers (suggested)

| Tier | Audience | Rights |
|------|----------|--------|
| Evaluation | Qualified prospects | Time-limited proprietary license, no production |
| Professional | SMB | Production use, standard support |
| Enterprise | Regulated / large IT | Full features, SLA option |
| Sovereign | Government / critical infra | Sovereign features + compliance addenda |
| Hyperscale | Cloud / MSP | Volume Order Form, custom DPA |

## Commercial metrics (Order Form)

License by transparent metrics—avoid surprise audits:

| Metric | Notes |
|--------|--------|
| Production clusters | Per K8s cluster or control plane |
| CPU sockets / cores | Optional cap |
| Confidential / TEE nodes | Premium |
| Tenant trust domains | Premium |
| GPU confidential pools | Premium |
| Managed workloads / nodes observed | PacketWolf-style metering |
| Named support contacts | SLA tiering |
| Term | Annual default |

## Feature gates (examples)

| Capability | Standard | Enterprise |
|------------|----------|------------|
| Basic orchestration / dashboards | Yes | Yes |
| Multi-tenant trust domains | No | Yes |
| Sovereign / air-gap deployment packs | No | Yes |
| Attestation management UI | No | Yes |
| Runtime policy enforcement (eBPF/TC) | Per Order Form | Yes |
| Fleet / multi-cluster sync | No | Yes |
| AI remediation / auto-policy apply | No | Yes |
| Enterprise audit export / SIEM bundle | No | Yes |
| Cross-region trust federation | No | Yes |

Adjust per product—see [PRODUCT-MATRIX.md](PRODUCT-MATRIX.md).
