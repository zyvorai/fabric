# Zyvor commercial legal framework

**Draft for internal use and customer negotiation.** Have counsel licensed in your target jurisdictions (India, EU, US, etc.) review and finalize before any customer signs.

**Licensor:** ZyvorAI Labs Private Limited · [zyvor.dev](https://zyvor.dev) · info@zyvor.dev · legal@zyvor.dev

---

## Corporate structure (recommended)

```text
ZyvorAI Labs Private Limited
    ├── PacketWolf / NetPredator (network intelligence, eBPF, K8s)
    ├── Ragnarok Enterprise (confidential infrastructure orchestration)
    ├── Aether Enterprise (attestation, trust, workload identity)
    ├── GuestKit Enterprise (guest / VM access, hardening)
    └── HyperSDK Platform (SDKs, tooling, integrations)
```

- **All product code is proprietary** — no Apache, MIT, or other OSS distribution (PacketWolf, Ragnarok, Aether, HyperSDK, netctl, netevd, etc.). **GuestKit** remains **LGPL-3.0-or-later** (open-source guest layer).
- **Hosted SaaS**, AI rules, and sovereign features are **commercial** under MSA/ELA.
- **Trademarks** are **not** granted by the software license—see [TRADEMARK-NOTICE.md](TRADEMARK-NOTICE.md).

See [PROPRIETARY-POLICY.md](PROPRIETARY-POLICY.md) for third-party dependencies in builds.

---

## Customer agreement flow (enterprise)

```text
Customer
   → Master Subscription Agreement (MSA)
   → Order Form (metrics, tier, term)
   → Enterprise License Agreement (ELA) or product EULA
   → Support SLA (if purchased)
   → Data Processing Agreement (DPA) (if personal data processed)
   → Acceptable Use Policy (AUP) + Export Compliance (incorporated by reference)
```

Quick deploy / self-hosted tarball: [LICENSE](../../LICENSE) + install acceptance (`scripts/lib/license-accept.sh`). Enterprise deals should still execute the full stack above.

---

## Document index

| Document | File | Purpose |
|----------|------|---------|
| Corporate facts | [CORPORATE.md](CORPORATE.md) | MCA, directors, filing references |
| Source PDF manifest | [SOURCE-DOCUMENTS.md](SOURCE-DOCUMENTS.md) | Incorporation & board docs on file |
| Licensing model | [LICENSING-MODEL.md](LICENSING-MODEL.md) | Proprietary tiers, metrics |
| Product matrix | [PRODUCT-MATRIX.md](PRODUCT-MATRIX.md) | License per product |
| Trademark | [TRADEMARK-NOTICE.md](TRADEMARK-NOTICE.md) | Brand rights |
| Proprietary policy | [PROPRIETARY-POLICY.md](PROPRIETARY-POLICY.md) | No OSS; third-party NOTICE |
| MSA (template) | [templates/MSA.md](templates/MSA.md) | Master subscription |
| ELA (template) | [templates/ELA.md](templates/ELA.md) | Software grant |
| SLA (template) | [templates/SLA.md](templates/SLA.md) | Support/uptime |
| DPA (template) | [templates/DPA.md](templates/DPA.md) | Privacy / GDPR-style |
| Order Form | [templates/ORDER-FORM.md](templates/ORDER-FORM.md) | Commercial terms |
| AUP | [templates/ACCEPTABLE-USE.md](templates/ACCEPTABLE-USE.md) | Abuse, lawful use |
| Export | [templates/EXPORT-COMPLIANCE.md](templates/EXPORT-COMPLIANCE.md) | Sanctions, export control |
| Deploy EULA | [../../LICENSE](../../LICENSE) | Self-hosted / deploy acceptance |

---

## Positioning (enterprise description)

> ZyvorAI Labs provides sovereign-oriented infrastructure software: **PacketWolf** for kernel-native network intelligence on Kubernetes; **Ragnarok** for confidential infrastructure orchestration; **Aether** for attestation and trust orchestration; **GuestKit** for hardened guest and remote access. Commercial subscriptions include enterprise security, governance, optional AI operational tooling, and support—subject to executed agreements.

---

## Competitive note

Prefer **transparent** pricing and metering over opaque audit traps. Document metrics clearly on the Order Form.

---

## Generate PDF manifest (optional)

```bash
# From repo root (requires pandoc or print from browser)
pandoc docs/legal/SOURCE-DOCUMENTS.md -o docs/legal/SOURCE-DOCUMENTS.pdf
```

Customer bundles include `LEGAL-INDEX.txt` (from this README) and `CORPORATE.md` via `package-binary-remote.sh`.
