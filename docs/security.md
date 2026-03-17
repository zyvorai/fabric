# Security

vmspawnd provides authentication, authorization, TLS, audit logging, and API keys for securing access to the VM management API.

---

## Authentication

### JWT Tokens

All API endpoints (except `/api/auth/login` and `/health`) require authentication via JWT.

**Login:**

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret"}'
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "admin",
  "role": "admin"
}
```

**Use the token:**

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/vms
```

### API Keys

For service-to-service and CI/CD authentication:

```bash
# Generate an API key (admin only)
curl -X POST http://localhost:8080/api/auth/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "ci-system", "role": "user"}'
```

```json
{
  "api_key": "vmspawnd_xxxxxxxxxxxxx",
  "name": "ci-system",
  "role": "user"
}
```

```bash
# Use the API key
curl -H "X-API-Key: vmspawnd_xxxxxxxxxxxxx" \
  http://localhost:8080/api/vms
```

---

## Authorization (RBAC)

Three built-in roles with progressively restricted permissions:

| Action | Admin | User | Viewer |
|--------|:-----:|:----:|:------:|
| List/view VMs | Yes | Yes | Yes |
| Create VMs | Yes | Yes | -- |
| Start/stop VMs | Yes | Yes | -- |
| Delete VMs | Yes | -- | -- |
| Manage users | Yes | -- | -- |
| View audit logs | Yes | Yes | Yes |
| Manage API keys | Yes | -- | -- |

A default `admin` user is created on first startup when authentication is enabled.

---

## TLS/HTTPS

### Enable TLS

```toml
# /etc/vmspawnd/vmspawnd.toml
[daemon]
listen = "0.0.0.0:8443"
tls_cert = "/etc/vmspawnd/cert.pem"
tls_key = "/etc/vmspawnd/key.pem"
```

### Generate a Self-Signed Certificate

```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout /etc/vmspawnd/key.pem \
  -out /etc/vmspawnd/cert.pem \
  -days 365 -nodes \
  -subj "/CN=vmspawnd"
```

For production, use certificates from a trusted CA or an ACME provider (Let's Encrypt).

---

## Audit Logging

All API actions are logged with user, action, resource, timestamp, and result:

```
AUDIT: admin CREATE vm/test-vm SUCCESS at 2026-02-18T12:00:00Z
AUDIT: user1 START vm/prod-vm SUCCESS at 2026-02-18T12:01:00Z
AUDIT: viewer DELETE vm/test DENIED at 2026-02-18T12:02:00Z
```

**View audit logs:**

```bash
# Via journalctl
sudo journalctl -u vmspawnd | grep AUDIT

# Via API (with filtering)
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/audit/logs
```

Audit logs can be exported as JSON or CSV for compliance and analysis.

---

## Rate Limiting

Protect against abuse with configurable rate limits:

```toml
# /etc/vmspawnd/vmspawnd.toml
[security]
rate_limit_per_minute = 60
max_concurrent_requests = 100
```

---

## Network Security

### Restrict API Access with Firewall Rules

```bash
# Allow only from management network
sudo iptables -A INPUT -p tcp --dport 8080 -s 192.168.1.0/24 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 8080 -j DROP
```

### Access via SSH Tunnel

```bash
# On your workstation
ssh -L 8080:localhost:8080 user@vmspawnd-server

# Then access via localhost
curl http://localhost:8080/api/vms
```

---

## Best Practices

1. **Always enable TLS in production** -- never expose the API over plain HTTP on untrusted networks
2. **Rotate JWT secrets regularly** -- update `jwt_secret` in config and restart
3. **Use strong passwords** -- enforce a minimum of 12 characters
4. **Scope API keys** -- grant minimum required role for each key
5. **Monitor audit logs** -- set up alerts for failed authentication and denied actions
6. **Enable rate limiting** -- prevent brute-force and denial-of-service attacks
7. **Use a firewall** -- restrict API access to management networks
8. **Keep vmspawnd updated** -- apply security patches promptly

---

## Vulnerability Reporting

Report security vulnerabilities to: **security@vmspawnd.io**

Do not disclose publicly until a patch is available.
