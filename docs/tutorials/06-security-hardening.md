# Tutorial 06: Security Hardening

Secure your vmspawn deployment with PAM authentication, role-based access
control, JWT token management, firewall profiles, VM encryption, certificate
management, and audit logging.

**Level:** Advanced
**Time:** 45 minutes
**Prerequisites:** vmspawnd running with PAM configured

---

## What You Will Learn

1. Authenticate users via PAM
2. Understand role-based access control (RBAC)
3. Manage JWT tokens
4. Create and assign firewall profiles
5. Encrypt VM disks
6. Manage TLS certificates and certificate authorities
7. Query and export audit logs

---

## Step 1: Authentication and PAM

vmspawn uses PAM (Pluggable Authentication Modules) for user authentication.
Any user account on the host system can log in to the API.

### Log In

```bash
curl -s -X POST "$VMSPAWN_HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }' | jq .
```

Expected response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "admin",
  "role": "admin",
  "username": "admin"
}
```

Save the token:

```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Check Current User

```bash
curl -s "$VMSPAWN_HOST/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response:

```json
{
  "id": "admin",
  "username": "admin",
  "role": "admin"
}
```

### Username Validation

- Must be 1--64 characters
- Alphanumeric, hyphens, underscores, and dots only
- No spaces or special characters

### Rate Limiting

vmspawn protects against brute-force attacks with two layers of rate limiting:

| Layer      | Limit                         | Window   |
|-----------|-------------------------------|----------|
| Per-user  | 5 failed attempts per user    | 5 minutes |
| Global    | 50 failed attempts total      | 5 minutes |

When rate-limited, the API returns `429 Too Many Requests`:

```json
{
  "error": "Too many login attempts, try again later"
}
```

Rate limits are automatically cleared on successful login.

---

## Step 2: Role-Based Access Control (RBAC)

vmspawn enforces three roles, each with progressively more permissions.

### Role Hierarchy

```
+----------------------------------+
|             Admin                |
|  - Full access to all endpoints  |
|  - Delete VMs, snapshots, backups|
|  - Manage users and clusters     |
|  - View audit logs               |
+----------------------------------+
         |
+----------------------------------+
|             User                 |
|  - Create and start VMs         |
|  - Create snapshots and backups  |
|  - Configure networking          |
|  - Cannot delete VMs             |
+----------------------------------+
         |
+----------------------------------+
|            Viewer                |
|  - Read-only access              |
|  - List and view VMs             |
|  - View metrics and events       |
|  - Cannot modify anything        |
+----------------------------------+
```

### Role Assignment

Roles are determined automatically based on the system user:

| Condition                                        | Role    |
|-------------------------------------------------|---------|
| Username is `root`                              | Admin   |
| User belongs to `wheel`, `sudo`, or `adm` group| Admin   |
| All other authenticated users                   | User    |

### Permission Matrix

| Operation                    | Viewer | User  | Admin |
|-----------------------------|--------|-------|-------|
| List VMs                    | Yes    | Yes   | Yes   |
| View VM details             | Yes    | Yes   | Yes   |
| View metrics                | Yes    | Yes   | Yes   |
| Create VM                   | No     | Yes   | Yes   |
| Start/stop VM               | No     | Yes   | Yes   |
| Create snapshot              | No     | Yes   | Yes   |
| Delete VM                   | No     | No    | Yes   |
| Delete snapshot              | No     | No    | Yes   |
| Delete backup                | No     | No    | Yes   |
| Manage hosts/clusters        | No     | No    | Yes   |
| Start migrations             | No     | No    | Yes   |
| View audit logs              | No     | No    | Yes   |

### Error Sanitization

Non-admin users receive sanitized error messages that do not expose internal
paths or system details. Admin users see full error details for debugging.

---

## Step 3: JWT Token Management

vmspawn issues JSON Web Tokens (JWT) on successful authentication. The token
encodes the user ID, role, and expiration time.

### Token Structure

```
Header:  {"alg": "HS256", "typ": "JWT"}
Payload: {
  "sub": "admin",
  "role": "admin",
  "exp": 1744550400,
  "iat": 1744464000
}
```

### Using Tokens

Include the token in every API request:

```bash
curl -s "$VMSPAWN_HOST/api/vms" \
  -H "Authorization: Bearer $TOKEN"
```

### Token Expiration

Tokens expire after a configurable duration (default: 24 hours). When a token
expires, the API returns `401 Unauthorized`:

```json
{
  "error": "Token expired"
}
```

Re-authenticate to obtain a new token:

```bash
TOKEN=$(curl -s "$VMSPAWN_HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}' | jq -r '.token')
```

### Best Practices for Token Security

1. **Never log tokens** -- treat them like passwords
2. **Use HTTPS** -- tokens are sent in cleartext HTTP headers
3. **Short expiration** -- reduce risk if a token is compromised
4. **Rotate regularly** -- re-authenticate periodically
5. **Revoke on logout** -- invalidate tokens when sessions end

---

## Step 4: Firewall Profiles

Firewall profiles define nftables rules that are applied to VM network
interfaces. They provide per-VM network security.

### Create a Firewall Profile

Create a "web-server" profile that allows HTTP/HTTPS and SSH:

```bash
curl -s -X POST "$VMSPAWN_HOST/api/firewall/profiles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-server",
    "description": "Allow HTTP, HTTPS, and SSH",
    "default_action": "drop",
    "rules": [
      {
        "direction": "inbound",
        "action": "accept",
        "protocol": "tcp",
        "port": 80,
        "description": "HTTP"
      },
      {
        "direction": "inbound",
        "action": "accept",
        "protocol": "tcp",
        "port": 443,
        "description": "HTTPS"
      },
      {
        "direction": "inbound",
        "action": "accept",
        "protocol": "tcp",
        "port": 22,
        "source_cidr": "10.0.0.0/8",
        "description": "SSH from internal only"
      },
      {
        "direction": "outbound",
        "action": "accept",
        "protocol": "tcp",
        "description": "Allow all outbound TCP"
      },
      {
        "direction": "outbound",
        "action": "accept",
        "protocol": "udp",
        "port": 53,
        "description": "DNS resolution"
      }
    ]
  }' | jq .
```

Expected response:

```json
{
  "id": "fp-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "web-server",
  "description": "Allow HTTP, HTTPS, and SSH",
  "default_action": "drop",
  "rules": [...],
  "created": "2026-04-12T15:00:00Z",
  "updated": "2026-04-12T15:00:00Z"
}
```

### Create a Database Profile

```bash
curl -s -X POST "$VMSPAWN_HOST/api/firewall/profiles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "database",
    "description": "PostgreSQL from app tier only",
    "default_action": "drop",
    "rules": [
      {
        "direction": "inbound",
        "action": "accept",
        "protocol": "tcp",
        "port": 5432,
        "source_cidr": "172.16.10.0/24",
        "description": "PostgreSQL from app VLAN"
      },
      {
        "direction": "inbound",
        "action": "accept",
        "protocol": "tcp",
        "port": 22,
        "source_cidr": "10.0.0.0/8",
        "description": "SSH from management"
      },
      {
        "direction": "inbound",
        "action": "drop",
        "log_prefix": "DB-DENIED: ",
        "description": "Log and drop everything else"
      }
    ]
  }' | jq .
```

### List Profiles

```bash
curl -s "$VMSPAWN_HOST/api/firewall/profiles" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Assign a Profile to a VM

```bash
curl -s -X POST "$VMSPAWN_HOST/api/firewall/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vm_name": "web-server-01",
    "profile_id": "fp-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }' | jq .
```

### Firewall Zones

Group VMs into security zones for broader policies:

```bash
curl -s -X POST "$VMSPAWN_HOST/api/firewall/zones" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dmz",
    "description": "Demilitarized zone for public-facing services",
    "default_action": "drop"
  }' | jq .
```

### Check Firewall Status

```bash
curl -s "$VMSPAWN_HOST/api/firewall/vms/web-server-01/status" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Step 5: VM Encryption

Encrypt VM disk images to protect data at rest. vmspawn supports key providers
for managing encryption keys.

### Register a Key Provider

```bash
curl -s -X POST "$VMSPAWN_HOST/api/encryption/providers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "local-kms",
    "provider_type": "local",
    "description": "Local key management for development",
    "config": {
      "key_store_path": "/var/lib/vmspawnd/keys"
    }
  }' | jq .
```

Expected response:

```json
{
  "id": "kp-b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "name": "local-kms",
  "provider_type": "local",
  "description": "Local key management for development",
  "config": {
    "key_store_path": "/var/lib/vmspawnd/keys"
  },
  "created": "2026-04-12T15:10:00Z",
  "updated": "2026-04-12T15:10:00Z"
}
```

### Test a Key Provider

Verify connectivity and functionality:

```bash
curl -s -X POST "$VMSPAWN_HOST/api/encryption/providers/kp-b2c3d4e5-f6a7-8901-bcde-f23456789012/test" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Set Encryption Policy

Define encryption requirements for VMs:

```bash
curl -s -X POST "$VMSPAWN_HOST/api/encryption/policies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-encryption",
    "provider_id": "kp-b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "algorithm": "aes-256-xts",
    "key_rotation_days": 90,
    "mandatory": true,
    "scope": {
      "match_labels": {"env": "production"}
    }
  }' | jq .
```

### Check VM Encryption Status

```bash
curl -s "$VMSPAWN_HOST/api/encryption/vms/web-server-01/status" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### List Key Providers

```bash
curl -s "$VMSPAWN_HOST/api/encryption/providers" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## Step 6: Certificate Management

Manage TLS certificates for secure VM communication, API endpoints, and
inter-host encryption.

### Create a Certificate Authority

```bash
curl -s -X POST "$VMSPAWN_HOST/api/certificates/cas" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vmspawn-internal-ca",
    "description": "Internal CA for VM-to-VM TLS",
    "key_type": "ec",
    "key_size": 256,
    "validity_days": 3650,
    "subject": {
      "common_name": "vmspawn Internal CA",
      "organization": "Example Corp"
    }
  }' | jq .
```

Expected response:

```json
{
  "id": "ca-c3d4e5f6-a7b8-9012-cdef-345678901234",
  "name": "vmspawn-internal-ca",
  "description": "Internal CA for VM-to-VM TLS",
  "key_type": "ec",
  "created": "2026-04-12T15:20:00Z",
  "updated": "2026-04-12T15:20:00Z"
}
```

### Issue a Certificate

```bash
curl -s -X POST "$VMSPAWN_HOST/api/certificates/requests" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ca_id": "ca-c3d4e5f6-a7b8-9012-cdef-345678901234",
    "common_name": "web-server-01.vm.internal",
    "san_dns": ["web-server-01", "web-server-01.vm.internal"],
    "san_ips": ["192.168.100.10"],
    "validity_days": 365,
    "key_type": "ec",
    "key_size": 256
  }' | jq .
```

### List Certificates

```bash
curl -s "$VMSPAWN_HOST/api/certificates" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Certificate Rotation

Set up automatic certificate renewal:

```bash
curl -s -X POST "$VMSPAWN_HOST/api/certificates/rotations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "certificate_id": "cert-...",
    "renew_before_days": 30,
    "auto_rotate": true
  }' | jq .
```

### Certificate Health Dashboard

```bash
curl -s "$VMSPAWN_HOST/api/certificates/health" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response:

```json
{
  "total_certificates": 15,
  "valid": 12,
  "expiring_soon": 2,
  "expired": 1,
  "certificates_by_status": {
    "valid": 12,
    "expiring_30d": 2,
    "expired": 1
  }
}
```

---

## Step 7: Audit Logging

Every authenticated API action is logged with the user, action, resource,
and status. Audit logs are essential for compliance and incident investigation.

### Query Audit Logs

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?limit=20" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected response:

```json
[
  {
    "id": "al-d4e5f6a7-...",
    "timestamp": "2026-04-12T15:25:00Z",
    "user": "admin",
    "action": "CREATE",
    "resource_type": "vm",
    "resource_name": "web-server-01",
    "status": "success",
    "ip_address": "10.0.0.5",
    "details": null,
    "error": null
  },
  {
    "id": "al-e5f6a7b8-...",
    "timestamp": "2026-04-12T15:24:00Z",
    "user": "admin",
    "action": "START",
    "resource_type": "vm",
    "resource_name": "web-server-01",
    "status": "success",
    "ip_address": "10.0.0.5",
    "details": null,
    "error": null
  }
]
```

### Filter Audit Logs

Filter by user:

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?user=admin&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Filter by action:

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?action=DELETE&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Filter by resource:

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?resource_type=vm&resource_name=web-server-01" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Filter by time range:

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?start_time=2026-04-12T00:00:00Z&end_time=2026-04-12T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Filter by status:

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?status=failed&limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Full-Text Search

```bash
curl -s "$VMSPAWN_HOST/api/audit/logs?search=web-server&limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Export Audit Logs

Export logs for compliance or external analysis:

```bash
curl -s "$VMSPAWN_HOST/api/audit/export?start_time=2026-04-01T00:00:00Z&end_time=2026-04-12T23:59:59Z" \
  -H "Authorization: Bearer $TOKEN" > audit-export.json
```

### Audit Log Fields

| Field           | Description                                  |
|----------------|----------------------------------------------|
| `id`           | Unique log entry ID                          |
| `timestamp`    | When the action occurred (UTC)               |
| `user`         | Username that performed the action           |
| `action`       | Action type (CREATE, DELETE, START, STOP, etc.) |
| `resource_type`| Type of resource (vm, snapshot, backup, etc.)|
| `resource_name`| Name or identifier of the resource           |
| `status`       | `success` or `failed`                        |
| `ip_address`   | Client IP address (if available)             |
| `details`      | Additional context (optional)                |
| `error`        | Error message if the action failed           |

---

## Security Checklist

Use this checklist to verify your vmspawn deployment is properly hardened:

- [ ] **HTTPS enabled** -- API served over TLS, not plain HTTP
- [ ] **Strong passwords** -- All PAM users have strong passwords
- [ ] **Admin group restricted** -- Only necessary users in `wheel`/`sudo`
- [ ] **JWT expiration set** -- Tokens expire in 24 hours or less
- [ ] **Firewall profiles assigned** -- All production VMs have a firewall profile
- [ ] **Default deny** -- Firewall profiles use `drop` as the default action
- [ ] **Encryption enabled** -- Production VM disks are encrypted
- [ ] **Key rotation** -- Encryption keys rotated every 90 days
- [ ] **Certificates managed** -- TLS certs tracked with auto-renewal
- [ ] **Audit logs reviewed** -- Regular review of failed actions
- [ ] **Audit logs exported** -- Logs shipped to external SIEM
- [ ] **Rate limiting active** -- Login rate limits are in effect
- [ ] **Error sanitization** -- Non-admin users do not see internal paths
- [ ] **Network policies** -- Inter-VM traffic restricted by policy
- [ ] **Backup encryption** -- Backup files are encrypted at rest
- [ ] **Host access restricted** -- SSH access limited to authorized operators

---

## Next Steps

- [Tutorial 01: Your First VM](01-first-vm.md) -- Start from the beginning
- [Tutorial 02: VM Networking](02-networking.md) -- Network policies and firewall zones
- [Tutorial 05: Multi-Node Clustering](05-clustering.md) -- Secure multi-host deployments
