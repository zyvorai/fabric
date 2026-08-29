# Certificates

## Purpose

Certificates & Security — a PKI console for Zyvor Fabric: certificate authorities, issued certificates, the CSR approval queue, host TPM/boot attestation, and VM security baselines, rolled up into one health dashboard.

## When to use it

- To see which certificates are expiring soon and renew them before they lapse
- To stand up a new certificate authority (root, intermediate, or external) for issuing certs
- To approve certificate signing requests waiting in the queue
- To check whether hosts have a TPM present and are passing boot/secure-boot attestation
- To track fleet compliance against a VM security baseline

## How to get there

- Route / id: `/certificates`
- Nav: **Security → Certificates** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

Six tabs: **Dashboard**, **CAs**, **Certificates**, **Requests**, **Attestation**, **Security Baselines**.

1. **Dashboard** — total certificates, active/expiring-soon/expired counts, CA count, pending requests, and overall compliance %, plus a list of certificates expiring within 30 days with days remaining.
2. **CAs** — table of certificate authorities (name, type, subject, valid-until date colored by days remaining, certs issued, status). **Create CA** opens a form: name, type (Root / Intermediate / External), and subject (e.g. `CN=My CA, O=My Org`).
3. **Certificates** — table of issued certs (subject, type, serial, expiry colored by days remaining, host/service, status). Active certificates have a **Revoke** action, gated by a confirmation dialog.
4. **Requests** — the CSR queue (subject, requestor, type, key size, submitted time, status). Pending requests can be approved with a single click; there's no reject action in this view.
5. **Attestation** — per-host TPM status: TPM present/absent, TPM version, attestation status, boot integrity verified/failed, secure boot enabled/disabled, and last check time.
6. **Security Baselines** — table of baselines (name/description, VM count, compliant count, number of checks, compliance % bar, last scan). **Create Baseline** opens a form for name and description; a default check is attached automatically.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
