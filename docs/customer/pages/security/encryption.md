# Encryption

## Purpose

Encryption — manage VM disk and vMotion encryption: register key management providers (KMIP, HashiCorp Vault Transit, or local software keys), define reusable encryption policies, and see which VMs are encrypted under which policy.

## When to use it

- To connect an external KMS so Zyvor Fabric manages encryption keys outside the host
- To define a policy (algorithm, whether vMotion traffic is encrypted, key rotation schedule) and see who's using it
- To check which VMs are currently encrypted and under which policy
- To rotate a VM's encryption key on demand, e.g. after a suspected key compromise

## How to get there

- Route / id: `/encryption`
- Nav: **Security → Encryption** (sidebar, command palette, or desktop nav)

## What you can do

Summary tiles up top (Key Providers, Policies, Encrypted VMs, Connected Providers), then three tabs:

1. **Key Providers** — table of registered providers (name, type, endpoint, status). **Add Provider** opens a form: name, type (**KMIP**, **Local** software-based, or **HashiCorp Vault Transit**), and endpoint URL. Remove a provider with the trash icon, gated by a confirmation dialog.
2. **Policies** — table of encryption policies (name/description, key provider, algorithm, whether vMotion traffic is encrypted, auto-rotate interval). **Create Policy** opens a form: name, description, key provider (dropdown of registered providers), algorithm (**AES-256-XTS**, **AES-256-CBC**, or **ChaCha20-Poly1305**), an "Encrypt vMotion traffic" toggle, and an "Auto-rotate keys" toggle that reveals a rotation-interval-in-days field when enabled.
3. **Encrypted VMs** — table of VMs (name, encrypted yes/no, policy applied, algorithm, last key rotation date). Encrypted VMs get a **Rotate Key** action, gated by a confirmation dialog, to force an immediate key rotation.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
