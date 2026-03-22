use axum::http::StatusCode;

/// Validate a VM name to prevent command injection.
/// Allows alphanumeric characters, dots, hyphens, and underscores.
/// Must start with an alphanumeric character and be 1-64 characters long.
pub fn validate_vm_name(name: &str) -> Result<(), (StatusCode, String)> {
    if name.is_empty() || name.len() > 64 {
        return Err((
            StatusCode::BAD_REQUEST,
            "VM name must be between 1 and 64 characters".to_string(),
        ));
    }

    // Safety: name is non-empty (checked above), so .next() always returns Some
    let first = match name.chars().next() {
        Some(c) => c,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                "VM name must not be empty".to_string(),
            ));
        }
    };
    if !first.is_ascii_alphanumeric() {
        return Err((
            StatusCode::BAD_REQUEST,
            "VM name must start with an alphanumeric character".to_string(),
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "VM name may only contain alphanumeric characters, dots, hyphens, and underscores"
                .to_string(),
        ));
    }

    Ok(())
}

// === Serde default helpers ===

/// Serde default for boolean true. Used across multiple API modules.
pub fn default_true() -> bool {
    true
}

/// Serde default for retention period (30 days).
pub fn default_retention() -> u32 {
    30
}

// === VM image path helpers ===

/// Find the disk image path for a VM by checking common locations.
/// Returns the path if found, or None if not.
pub fn find_vm_image(name: &str) -> Option<String> {
    let candidates = [
        format!("/var/lib/machines/{}.qcow2", name),
        format!("/var/lib/machines/{}.raw", name),
        format!("/var/lib/machines/{}/{}.qcow2", name, name),
        format!("/var/lib/vmspawnd/images/{}.qcow2", name),
        format!("/var/lib/vmspawnd/images/{}.raw", name),
    ];

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    None
}

/// Find the disk image path for a VM, returning a default path if not found.
pub fn find_vm_image_or_default(name: &str) -> String {
    find_vm_image(name)
        .unwrap_or_else(|| format!("/var/lib/vmspawnd/images/{}.qcow2", name))
}

// === Input validation helpers ===

/// Validate that a string is a valid hostname or IP address.
/// Rejects shell metacharacters and other injection vectors.
pub fn validate_hostname(host: &str) -> Result<(), String> {
    if host.is_empty() || host.len() > 253 {
        return Err("Hostname must be between 1 and 253 characters".to_string());
    }

    let valid = host.chars().all(|c| {
        c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':' || c == '_'
    });

    if !valid {
        return Err(format!(
            "Hostname '{}' contains invalid characters. Only alphanumeric, dots, hyphens, underscores, and colons are allowed.",
            host
        ));
    }

    if host.starts_with('-') {
        return Err("Hostname must not start with a hyphen".to_string());
    }

    Ok(())
}

/// Validate that a string is a valid IPv4 or IPv6 address.
pub fn validate_ip_address(addr: &str) -> Result<(), String> {
    addr.parse::<std::net::IpAddr>()
        .map(|_| ())
        .map_err(|_| format!("Invalid IP address: '{}'", addr))
}

/// Validate that a host path is within allowed directories.
/// Prevents arbitrary file access by restricting to safe prefixes.
/// Canonicalizes the path to resolve symlinks and prevent traversal.
pub fn validate_host_path(path: &str) -> Result<(), (StatusCode, String)> {
    let raw = std::path::Path::new(path);

    // Reject .. components before canonicalization
    for component in raw.components() {
        if let std::path::Component::ParentDir = component {
            return Err((
                StatusCode::BAD_REQUEST,
                "Path must not contain '..' components".to_string(),
            ));
        }
    }

    let allowed_prefixes = [
        "/var/lib/machines",
        "/var/lib/vmspawnd",
        "/tmp",
    ];

    // Try to canonicalize to resolve symlinks; fall back to the raw path
    // if the target doesn't exist yet (e.g. creating a new file).
    let resolved = std::fs::canonicalize(raw)
        .unwrap_or_else(|_| raw.to_path_buf());
    let resolved_str = resolved.to_string_lossy();

    if !allowed_prefixes.iter().any(|prefix| resolved_str.starts_with(prefix)) {
        return Err((
            StatusCode::FORBIDDEN,
            format!(
                "Host path must be under one of: {}",
                allowed_prefixes.join(", ")
            ),
        ));
    }

    Ok(())
}

/// Escape a string for safe CSV output. Prevents CSV injection.
pub fn escape_csv_field(field: &str) -> String {
    let needs_quoting = field.contains(',') || field.contains('\n') || field.contains('"');
    let is_formula = field.starts_with('=') || field.starts_with('+') || field.starts_with('-') || field.starts_with('@');

    let mut escaped = if is_formula {
        format!("'{}", field)
    } else {
        field.to_string()
    };

    if needs_quoting || is_formula {
        escaped = format!("\"{}\"", escaped.replace('"', "\"\""));
    }

    escaped
}

/// Validate a snapshot or checkpoint name.
/// Allows alphanumeric characters, hyphens, underscores, and dots.
/// Must not start with a hyphen (prevents argument injection).
pub fn validate_snapshot_name(name: &str) -> Result<(), (StatusCode, String)> {
    if name.is_empty() || name.len() > 64 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Snapshot name must be between 1 and 64 characters".to_string(),
        ));
    }
    if name.starts_with('-') {
        return Err((
            StatusCode::BAD_REQUEST,
            "Snapshot name must not start with a hyphen".to_string(),
        ));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Snapshot name may only contain alphanumeric characters, hyphens, underscores, and dots".to_string(),
        ));
    }
    Ok(())
}

/// Sanitize an error message by redacting filesystem paths.
/// Replaces absolute paths like /var/lib/vmspawnd/images/foo.qcow2 with <path>.
/// Use for error messages returned to non-admin users.
pub fn sanitize_error(msg: &str) -> String {
    let mut result = String::with_capacity(msg.len());
    let mut chars = msg.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '/' && result.is_empty() || (c == '/' && result.ends_with(|ch: char| ch.is_whitespace() || ch == '\'' || ch == '"' || ch == ':')) {
            // Start of a path — consume path characters
            let mut path_len = 1;
            while let Some(&next) = chars.peek() {
                if next.is_ascii_alphanumeric() || matches!(next, '/' | '.' | '-' | '_') {
                    chars.next();
                    path_len += 1;
                } else {
                    break;
                }
            }
            if path_len > 1 {
                result.push_str("<path>");
            } else {
                result.push(c);
            }
        } else {
            result.push(c);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_vm_names() {
        assert!(validate_vm_name("web-server-01").is_ok());
        assert!(validate_vm_name("db.prod.01").is_ok());
        assert!(validate_vm_name("test_vm").is_ok());
        assert!(validate_vm_name("a").is_ok());
        assert!(validate_vm_name("A123").is_ok());
    }

    #[test]
    fn test_invalid_vm_names() {
        assert!(validate_vm_name("").is_err());
        assert!(validate_vm_name("-starts-with-dash").is_err());
        assert!(validate_vm_name(".starts-with-dot").is_err());
        assert!(validate_vm_name("_starts-with-underscore").is_err());
        assert!(validate_vm_name("has spaces").is_err());
        assert!(validate_vm_name("test;echo pwned").is_err());
        assert!(validate_vm_name("$(whoami)").is_err());
        assert!(validate_vm_name("vm`id`").is_err());
        assert!(validate_vm_name("vm|cat /etc/passwd").is_err());
        assert!(validate_vm_name(&"a".repeat(65)).is_err());
    }

    #[test]
    fn test_default_true() {
        assert!(default_true());
    }

    #[test]
    fn test_validate_hostname() {
        assert!(validate_hostname("example.com").is_ok());
        assert!(validate_hostname("192.168.1.1").is_ok());
        assert!(validate_hostname("::1").is_ok());
        assert!(validate_hostname("-bad").is_err());
        assert!(validate_hostname("").is_err());
        assert!(validate_hostname("bad;host").is_err());
    }

    #[test]
    fn test_validate_ip_address() {
        assert!(validate_ip_address("192.168.1.1").is_ok());
        assert!(validate_ip_address("::1").is_ok());
        assert!(validate_ip_address("not-an-ip").is_err());
    }

    #[test]
    fn test_escape_csv_field() {
        assert_eq!(escape_csv_field("hello"), "hello");
        assert_eq!(escape_csv_field("hello,world"), "\"hello,world\"");
        assert_eq!(escape_csv_field("=SUM(A1)"), "\"'=SUM(A1)\"");
    }
}
