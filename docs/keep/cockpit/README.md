# Live cockpit

Operator surfaces shipped in Keep 0.1:

| Surface | What you get |
|---|---|
| `GET /v1/sessions/{id}/cockpit` | Taint paint, pending approvals, last decisions, `evidence_class`, browser links |
| `GET /keep/cockpit?session=` | Minimal HTML for phone/laptop (token in query or form) |
| `GET /v1/sessions/{id}/browser/view` | Sanitized open-tab titles/URLs |
| `GET /keep/browser?session=` | HTML that polls the live tab listing |

**Visible taint:** untrusted brokered reads paint `tainted_by`; list which egress
rules just went to `ask`. Hidden eBPF alone is not the product.

**Not yet a full Muse-style split desktop:** terminal pane, file browser, and
input takeover are still product goals — see [browser/README.md](../browser/README.md).

**Attestation receipt (0.1 honest / 0.2 full):** cockpit returns an `attestation`
object (`security_profile`, soft `image_hash`, `evidence_class`,
`snp_launch_verified`, `tdx_launch_verified`, `host_recover_allowed`,
`operator_can_read`, honesty). If class is `software-test`, UI must not claim
the operator cannot read the VM. Dual-key host recover:
`POST /v1/sessions/{id}/host-recover` — forbidden on confidential; measured
needs `ZYVOR_AGENT_RECOVER_KEY_A` + `_B`.
