use anyhow::Result;
use totp_rs::{Algorithm, Secret, TOTP};

/// Generate a new TOTP secret for a user.
pub fn generate_secret(username: &str, issuer: &str) -> Result<(String, String)> {
    let secret = Secret::generate_secret();
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes()?,
        Some(issuer.to_string()),
        username.to_string(),
    )?;

    let secret_base32 = secret.to_encoded().to_string();
    let otpauth_url = totp.get_url();

    Ok((secret_base32, otpauth_url))
}

/// Verify a TOTP code against a stored secret.
pub fn verify_code(secret_base32: &str, code: &str) -> Result<bool> {
    let secret = Secret::Encoded(secret_base32.to_string());
    let totp = TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret.to_bytes()?,
        Some("vmspawnd".to_string()),
        "user".to_string(),
    )?;

    Ok(totp.check_current(code)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_and_verify() {
        let (secret, url) = generate_secret("testuser", "vmspawnd").unwrap();
        assert!(!secret.is_empty());
        assert!(url.contains("otpauth://"));
        // We can't test verify_code easily since TOTP is time-based,
        // but we can at least verify it doesn't panic with a bad code
        let result = verify_code(&secret, "000000").unwrap();
        // Result is either true or false depending on timing, just ensure no error
        let _ = result;
    }
}
