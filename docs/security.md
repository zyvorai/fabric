# Security Features

## Authentication

### JWT-based Authentication

vmspawnd supports JWT (JSON Web Token) authentication for API access.

#### Generate Token

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "secret"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "admin",
  "role": "admin"
}
```

#### Use Token

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/vms
```

## Authorization (RBAC)

### Roles

- **Admin**: Full access (create, read, update, delete)
- **User**: Read and write access (create, read, update)
- **Viewer**: Read-only access

### Role Permissions

| Action | Admin | User | Viewer |
|--------|-------|------|--------|
| List VMs | ✓ | ✓ | ✓ |
| View VM details | ✓ | ✓ | ✓ |
| Create VM | ✓ | ✓ | ✗ |
| Start/Stop VM | ✓ | ✓ | ✗ |
| Delete VM | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |

## TLS/HTTPS

### Enable TLS

Configuration in `/etc/vmspawnd/vmspawnd.toml`:

```toml
[daemon]
listen = "0.0.0.0:8443"
tls_cert = "/etc/vmspawnd/cert.pem"
tls_key = "/etc/vmspawnd/key.pem"
```

### Generate Self-Signed Certificate

```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=vmspawnd"
```

## Audit Logging

All API actions are logged with:
- User ID
- Action performed
- Resource affected
- Timestamp
- Result (success/failure)

View audit logs:

```bash
sudo journalctl -u vmspawnd | grep AUDIT
```

Example:
```
AUDIT: admin CREATE vm/test-vm SUCCESS at 2026-02-18T12:00:00Z
AUDIT: user1 START vm/prod-vm SUCCESS at 2026-02-18T12:01:00Z
AUDIT: viewer DELETE vm/test DENIED at 2026-02-18T12:02:00Z
```

## API Keys

For service-to-service authentication:

```bash
# Generate API key
curl -X POST http://localhost:8080/api/auth/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"name": "ci-system", "role": "user"}'
```

Response:
```json
{
  "api_key": "vmspawnd_xxxxxxxxxxxxx",
  "name": "ci-system",
  "role": "user"
}
```

Use API key:

```bash
curl -H "X-API-Key: vmspawnd_xxxxxxxxxxxxx" \
  http://localhost:8080/api/vms
```

## Security Best Practices

1. **Always use TLS in production**
2. **Rotate JWT secrets regularly**
3. **Use strong passwords** (minimum 12 characters)
4. **Limit API key scope** to minimum required permissions
5. **Monitor audit logs** for suspicious activity
6. **Keep vmspawnd updated** to latest version
7. **Use firewall** to restrict API access
8. **Enable rate limiting** to prevent abuse

## Rate Limiting

Configure in `/etc/vmspawnd/vmspawnd.toml`:

```toml
[security]
rate_limit_per_minute = 60
max_concurrent_requests = 100
```

## Network Security

### Firewall Rules

```bash
# Allow only from specific network
sudo iptables -A INPUT -p tcp --dport 8080 \
  -s 192.168.1.0/24 -j ACCEPT

sudo iptables -A INPUT -p tcp --dport 8080 -j DROP
```

### VPN Access

Recommend accessing vmspawnd through VPN or SSH tunnel:

```bash
# SSH tunnel
ssh -L 8080:localhost:8080 user@vmspawnd-server

# Access via localhost
curl http://localhost:8080/api/vms
```

## Vulnerability Reporting

Report security vulnerabilities to: security@vmspawnd.io

Do not disclose publicly until patch is available.
