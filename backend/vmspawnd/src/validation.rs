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

    let first = name.chars().next().unwrap();
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
}
