# Authentication API Reference

Detailed specification of the vmspawn authentication system, covering the login flow, JWT token structure, token lifecycle, role-based access control, and PAM integration.

## Table of Contents

- [Login Flow](#login-flow)
- [JWT Token Structure](#jwt-token-structure)
- [Token Lifecycle](#token-lifecycle)
- [Token Revocation](#token-revocation)
- [Role-Based Access Control](#role-based-access-control)
- [PAM Integration](#pam-integration)
- [Rate Limiting](#rate-limiting)

---

## Login Flow

Authentication is performed by sending system credentials to the login endpoint. The backend authenticates against PAM (Pluggable Authentication Modules) and issues a signed JWT token.

```
Client                          vmspawnd                         PAM
  |                                |                              |
  |  POST /api/auth/login          |                              |
  |  {"username","password"}       |                              |
  |------------------------------->|                              |
  |                                |  authenticate(user, pass)    |
  |                                |----------------------------->|
  |                                |                              |
  |                                |  result: success/failure     |
  |                                |<-----------------------------|
  |                                |                              |
  |                                |  lookup groups (id -Gn user) |
  |                                |  determine role              |
  |                                |  generate JWT                |
  |                                |                              |
  |  200 {token, user_id, role}    |                              |
  |<-------------------------------|                              |
```

**Request:**

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "secret"
}
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTcxMzAwMDAwMCwianRpIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0.signature",
  "user_id": "admin",
  "role": "admin",
  "username": "admin"
}
```

The login endpoint does **not** require an existing JWT token. It is the only public API endpoint (along with `/health`).

---

## JWT Token Structure

Tokens are signed with HMAC-SHA256 (`HS256`) using a server-configured secret.

### Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Claims (Payload)

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | Subject -- the username (user ID) |
| `role` | string | User role: `admin`, `user`, or `viewer` |
| `exp` | integer | Expiration time (Unix timestamp) |
| `jti` | string | JWT ID -- unique identifier (UUIDv4) for revocation tracking |

**Example decoded payload:**

```json
{
  "sub": "admin",
  "role": "admin",
  "exp": 1713000000,
  "jti": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Using the Token

Include the token in the `Authorization` header of every API request:

```http
GET /api/vms
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```

---

## Token Lifecycle

| Event | Behavior |
|-------|----------|
| **Issued** | On successful `POST /api/auth/login` |
| **Expiration** | Default: 24 hours after issuance (configurable via `expiration_hours`) |
| **Validation** | Every request: signature check, expiration check, revocation check |
| **Minimum TTL** | 1 hour (if configured below 1, the server enforces a 1-hour minimum with a warning) |
| **Revoked** | Token's `jti` is added to the in-memory revocation set |

### Handling Expired Tokens

When a token expires, the API returns:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Authentication required"
}
```

The client should re-authenticate by calling `POST /api/auth/login` to obtain a new token.

---

## Token Revocation

Tokens can be revoked before expiration using the `jti` (JWT ID) claim. Revoked tokens are rejected during validation even if they have not expired.

Revocation is tracked in an in-memory set within the `JwtConfig` instance. This means:

- Revocations are immediate and in-process.
- Revocations are lost on service restart. After a restart, expired tokens are naturally rejected; unexpired tokens remain valid until their `exp` time passes.
- For forced invalidation of all tokens, rotate the JWT secret and restart the service.

---

## Role-Based Access Control

### Roles

| Role | Description | Assigned When |
|------|-------------|---------------|
| **Admin** | Full access to all operations | User is `root`, or is a member of `wheel`, `sudo`, or `adm` groups |
| **User** | Can create and manage VMs, take backups, manage networking | All other authenticated system users |
| **Viewer** | Read-only access to all resources | Manually assigned (not auto-assigned by PAM login) |

### Permission Matrix

API endpoints enforce minimum permission levels using Axum extractors:

| Extractor | Minimum Role | Operations |
|-----------|-------------|------------|
| `RequireRead` | Viewer | List, get, view metrics, browse events |
| `RequireWrite` | User | Create, start, stop, restart, pause, resume, clone, backup, configure |
| `RequireAdmin` | Admin | Delete VMs, delete snapshots/backups, manage storage pools, manage notification channels, shell access, file transfer, terminate machines |

### Permission Hierarchy

```
Admin  >  User  >  Viewer
  |         |        |
  |         |        +-- can_read()   = true
  |         +----------- can_write()  = true, can_read() = true
  +---------------------- can_manage() = true, can_write() = true, can_read() = true
```

Every higher role inherits all permissions of lower roles.

### Error Sanitization

Non-admin users receive sanitized error messages that do not expose internal file paths or system details. Admin users see full error details for debugging.

---

## PAM Integration

vmspawn authenticates against the system's PAM stack. This means:

- **User accounts are system accounts.** There is no separate user database for vmspawn. Users log in with their Linux credentials.
- **Password policies are inherited** from PAM modules (pam_pwquality, pam_faillock, etc.).
- **Account lockouts, password aging, and two-factor authentication** are supported if configured at the PAM level.
- **Group membership determines the role.** After successful authentication, vmspawn checks the user's Unix groups:
  - Members of `wheel`, `sudo`, or `adm` receive the `admin` role.
  - All others receive the `user` role.

### PAM Service Configuration

The PAM authentication call uses the service name configured in the vmspawnd binary (typically `vmspawnd` or `login`). Ensure the PAM service file exists at `/etc/pam.d/vmspawnd` or that the fallback service (`/etc/pam.d/other`) is permissive enough for your use case.

### Security Notes

- PAM authentication is performed on a **blocking thread pool** (`tokio::task::spawn_blocking`) to avoid blocking the async runtime.
- Failed login attempts record the **username** for rate limiting but do not log the password.
- Successful login clears the per-user rate limit counter.

---

## Rate Limiting

Two independent rate limiters protect the login endpoint:

### Per-User Rate Limit

| Parameter | Value |
|-----------|-------|
| Window | 5 minutes (sliding) |
| Max failed attempts | 5 per username |
| Response when limited | `429 Too Many Requests` |

### Global Rate Limit

| Parameter | Value |
|-----------|-------|
| Window | 5 minutes (sliding) |
| Max failed attempts | 50 across all usernames |
| Response when limited | `429 Too Many Requests` |

### Behavior

- Only **failed** login attempts count toward the limit. Successful logins do not increment the counter.
- A **successful login** clears the per-user counter for that username.
- The global limiter prevents distributed brute-force attacks that target many usernames.
- Rate limiter state is stored in memory and is cleared on service restart.
- When the in-memory rate limit map exceeds 1,000 entries, stale entries are automatically evicted.

### Rate Limit Response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "error": "Too many login attempts, try again later"
}
```
