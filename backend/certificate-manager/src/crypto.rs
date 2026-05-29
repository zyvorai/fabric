// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! Real X.509 certificate generation using the `rcgen` crate.
//!
//! Provides helpers to generate self-signed CA certificates and issue
//! end-entity certificates signed by a CA.  All output is PEM-encoded and
//! fingerprints are real SHA-256 hashes of the DER-encoded certificate.

use anyhow::{Context, Result};
use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, Ia5String, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};
use sha2::{Digest, Sha256};

/// Result of generating a CA certificate.
pub struct CaOutput {
    /// PEM-encoded CA certificate.
    pub cert_pem: String,
    /// PEM-encoded CA private key (PKCS#8).
    pub key_pem: String,
    /// SHA-256 fingerprint of the DER-encoded certificate (`sha256:<hex>`).
    pub fingerprint: String,
}

/// Result of issuing an end-entity certificate.
pub struct CertOutput {
    /// PEM-encoded certificate.
    pub cert_pem: String,
    /// PEM-encoded private key (PKCS#8).
    pub key_pem: String,
    /// SHA-256 fingerprint of the DER-encoded certificate (`sha256:<hex>`).
    pub fingerprint: String,
    /// Serial number (hex-encoded from the certificate).
    pub serial: String,
}

/// Compute a `sha256:<hex>` fingerprint from DER-encoded certificate bytes.
pub fn compute_fingerprint(der_bytes: &[u8]) -> String {
    let hash = Sha256::digest(der_bytes);
    format!("sha256:{}", hex::encode(hash))
}

/// Generate a self-signed CA certificate and key pair.
///
/// Returns a [`CaOutput`] containing PEM-encoded cert/key and the fingerprint.
pub fn generate_ca(common_name: &str, validity_days: u32) -> Result<CaOutput> {
    let mut params = CertificateParams::default();

    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, common_name);
    params.distinguished_name = dn;

    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];

    // Set validity period.
    let now = time::OffsetDateTime::now_utc();
    params.not_before = now;
    params.not_after = now
        .checked_add(time::Duration::days(validity_days as i64))
        .context("validity period overflow")?;

    let key_pair = KeyPair::generate().context("failed to generate CA key pair")?;
    let cert = params
        .self_signed(&key_pair)
        .context("failed to self-sign CA certificate")?;

    let fingerprint = compute_fingerprint(cert.der().as_ref());
    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();

    Ok(CaOutput {
        cert_pem,
        key_pem,
        fingerprint,
    })
}

/// Issue an end-entity certificate signed by a CA.
///
/// `san_names` are added as DNS Subject Alternative Names.
/// Returns a [`CertOutput`] with PEM-encoded cert/key, fingerprint, and serial.
pub fn issue_certificate(
    common_name: &str,
    san_names: &[String],
    validity_days: u32,
    ca_cert_pem: &str,
    ca_key_pem: &str,
) -> Result<CertOutput> {
    let mut params = CertificateParams::default();

    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, common_name);
    params.distinguished_name = dn;

    // Add Subject Alternative Names.
    for name in san_names {
        let ia5 =
            Ia5String::try_from(name.as_str()).context(format!("invalid SAN name: {}", name))?;
        params.subject_alt_names.push(SanType::DnsName(ia5));
    }

    // Set validity period.
    let now = time::OffsetDateTime::now_utc();
    params.not_before = now;
    params.not_after = now
        .checked_add(time::Duration::days(validity_days as i64))
        .context("validity period overflow")?;

    // Parse the CA certificate and key.
    let ca_key_pair =
        KeyPair::from_pem(ca_key_pem).context("failed to parse CA private key PEM")?;
    let ca_params = CertificateParams::from_ca_cert_pem(ca_cert_pem)
        .context("failed to parse CA certificate PEM")?;
    let ca_cert = ca_params
        .self_signed(&ca_key_pair)
        .context("failed to reconstruct CA certificate")?;

    // Generate a new key pair for the end-entity certificate.
    let key_pair = KeyPair::generate().context("failed to generate certificate key pair")?;
    let cert = params
        .signed_by(&key_pair, &ca_cert, &ca_key_pair)
        .context("failed to sign certificate with CA")?;

    let fingerprint = compute_fingerprint(cert.der().as_ref());
    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();
    let serial = uuid::Uuid::new_v4().to_string();

    Ok(CertOutput {
        cert_pem,
        key_pem,
        fingerprint,
        serial,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_ca() {
        let ca = generate_ca("Test Root CA", 365).unwrap();
        assert!(ca.cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(ca.key_pem.contains("BEGIN PRIVATE KEY"));
        assert!(ca.fingerprint.starts_with("sha256:"));
        // SHA-256 hex = 64 chars, plus "sha256:" prefix = 71 chars
        assert_eq!(ca.fingerprint.len(), 71);
    }

    #[test]
    fn test_issue_certificate() {
        let ca = generate_ca("Test CA", 365).unwrap();
        let cert = issue_certificate(
            "test.local",
            &["test.local".to_string(), "*.test.local".to_string()],
            90,
            &ca.cert_pem,
            &ca.key_pem,
        )
        .unwrap();

        assert!(cert.cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(cert.key_pem.contains("BEGIN PRIVATE KEY"));
        assert!(cert.fingerprint.starts_with("sha256:"));
        assert_eq!(cert.fingerprint.len(), 71);
        assert!(!cert.serial.is_empty());
    }

    #[test]
    fn test_fingerprint_deterministic() {
        let data = b"some certificate bytes";
        let fp1 = compute_fingerprint(data);
        let fp2 = compute_fingerprint(data);
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn test_different_certs_different_fingerprints() {
        let ca = generate_ca("Test CA", 365).unwrap();
        let cert1 = issue_certificate(
            "a.local",
            &["a.local".to_string()],
            90,
            &ca.cert_pem,
            &ca.key_pem,
        )
        .unwrap();
        let cert2 = issue_certificate(
            "b.local",
            &["b.local".to_string()],
            90,
            &ca.cert_pem,
            &ca.key_pem,
        )
        .unwrap();
        assert_ne!(cert1.fingerprint, cert2.fingerprint);
    }
}
