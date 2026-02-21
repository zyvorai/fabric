import { apiFetch } from "./client"
export interface CertificateAuthority {
  id: string
  name: string
  ca_type: 'root' | 'intermediate' | 'external'
  subject: string
  issuer: string
  serial_number: string
  valid_from: string
  valid_to: string
  key_algorithm: string
  key_size: number
  status: 'active' | 'expired' | 'revoked'
  issued_count: number
  crl_url?: string
  ocsp_url?: string
  created: string
  updated?: string
}

export interface Certificate {
  id: string
  subject: string
  issuer: string
  serial_number: string
  ca_id: string
  cert_type: 'server' | 'client' | 'host' | 'service'
  valid_from: string
  valid_to: string
  key_algorithm: string
  key_size: number
  san?: string[]
  status: 'active' | 'expiring_soon' | 'expired' | 'revoked'
  host_name?: string
  service_name?: string
  fingerprint: string
  created: string
  updated?: string
}

export interface CertificateRequest {
  id: string
  subject: string
  requestor: string
  ca_id: string
  cert_type: 'server' | 'client' | 'host' | 'service'
  key_size: number
  san?: string[]
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string
  reviewed_at?: string
  reviewed_by?: string
  rejection_reason?: string
}

export interface TrustAttestation {
  id: string
  host_id: string
  hostname: string
  tpm_present: boolean
  tpm_version?: string
  attestation_status: 'trusted' | 'untrusted' | 'unknown'
  last_attestation?: string
  boot_integrity: boolean
  secure_boot_enabled: boolean
  measured_boot_log?: string
  created: string
  updated?: string
}

export interface VmSecurityBaseline {
  id: string
  name: string
  description?: string
  checks: Array<{
    check_id: string
    name: string
    category: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    enabled: boolean
  }>
  vm_count: number
  compliant_count: number
  non_compliant_count: number
  last_scan?: string
  created: string
  updated?: string
}

export interface CertHealthDashboard {
  total_certificates: number
  active: number
  expiring_soon: number
  expired: number
  revoked: number
  pending_requests: number
  ca_count: number
  trusted_hosts: number
  untrusted_hosts: number
  security_baselines: number
  overall_compliance_pct: number
  expiring_within_30_days: Array<{
    cert_id: string
    subject: string
    valid_to: string
    days_remaining: number
  }>
}

const API_BASE = '/api'

// Certificate authorities

export async function listCas(): Promise<CertificateAuthority[]> {
  const res = await apiFetch(`${API_BASE}/certificates/cas`)
  if (!res.ok) throw new Error('Failed to fetch certificate authorities')
  return res.json()
}

export async function createCa(req: {
  name: string
  ca_type: 'root' | 'intermediate' | 'external'
  subject: string
  key_algorithm?: string
  key_size?: number
}): Promise<CertificateAuthority> {
  const res = await apiFetch(`${API_BASE}/certificates/cas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create certificate authority')
  return res.json()
}

// Certificates

export async function listCertificates(caId?: string): Promise<Certificate[]> {
  const url = caId
    ? `${API_BASE}/certificates/certs?ca_id=${caId}`
    : `${API_BASE}/certificates/certs`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch certificates')
  return res.json()
}

export async function issueCertificate(req: {
  ca_id: string
  subject: string
  cert_type: 'server' | 'client' | 'host' | 'service'
  key_size?: number
  san?: string[]
  validity_days?: number
}): Promise<Certificate> {
  const res = await apiFetch(`${API_BASE}/certificates/certs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to issue certificate')
  return res.json()
}

export async function revokeCertificate(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/certificates/certs/${id}/revoke`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to revoke certificate')
}

export async function renewCertificate(id: string): Promise<Certificate> {
  const res = await apiFetch(`${API_BASE}/certificates/certs/${id}/renew`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to renew certificate')
  return res.json()
}

export async function checkExpiring(days?: number): Promise<Certificate[]> {
  const url = days
    ? `${API_BASE}/certificates/certs/expiring?days=${days}`
    : `${API_BASE}/certificates/certs/expiring`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to check expiring certificates')
  return res.json()
}

// Certificate requests

export async function listCertRequests(status?: string): Promise<CertificateRequest[]> {
  const url = status
    ? `${API_BASE}/certificates/requests?status=${status}`
    : `${API_BASE}/certificates/requests`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error('Failed to fetch certificate requests')
  return res.json()
}

export async function submitCertRequest(req: {
  subject: string
  ca_id: string
  cert_type: 'server' | 'client' | 'host' | 'service'
  key_size?: number
  san?: string[]
}): Promise<CertificateRequest> {
  const res = await apiFetch(`${API_BASE}/certificates/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to submit certificate request')
  return res.json()
}

export async function approveCertRequest(id: string): Promise<Certificate> {
  const res = await apiFetch(`${API_BASE}/certificates/requests/${id}/approve`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to approve certificate request')
  return res.json()
}

// Trust attestations

export async function listAttestations(): Promise<TrustAttestation[]> {
  const res = await apiFetch(`${API_BASE}/certificates/attestations`)
  if (!res.ok) throw new Error('Failed to fetch trust attestations')
  return res.json()
}

export async function submitAttestation(req: {
  host_id: string
  tpm_present: boolean
  tpm_version?: string
  secure_boot_enabled?: boolean
  measured_boot_log?: string
}): Promise<TrustAttestation> {
  const res = await apiFetch(`${API_BASE}/certificates/attestations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to submit trust attestation')
  return res.json()
}

// Security baselines

export async function listSecurityBaselines(): Promise<VmSecurityBaseline[]> {
  const res = await apiFetch(`${API_BASE}/certificates/security-baselines`)
  if (!res.ok) throw new Error('Failed to fetch security baselines')
  return res.json()
}

export async function createSecurityBaseline(req: {
  name: string
  description?: string
  checks: Array<{
    check_id: string
    name: string
    category: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    enabled?: boolean
  }>
}): Promise<VmSecurityBaseline> {
  const res = await apiFetch(`${API_BASE}/certificates/security-baselines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error('Failed to create security baseline')
  return res.json()
}

export async function checkVmSecurityCompliance(baselineId: string, vmId: string): Promise<{
  compliant: boolean
  checks: Array<{
    check_id: string
    name: string
    status: 'pass' | 'fail' | 'not_applicable'
    details?: string
  }>
  checked_at: string
}> {
  const res = await apiFetch(`${API_BASE}/certificates/security-baselines/${baselineId}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vm_id: vmId }),
  })
  if (!res.ok) throw new Error('Failed to check VM security compliance')
  return res.json()
}

// Dashboard

export async function getCertHealthDashboard(): Promise<CertHealthDashboard> {
  const res = await apiFetch(`${API_BASE}/certificates/dashboard`)
  if (!res.ok) throw new Error('Failed to fetch certificate health dashboard')
  return res.json()
}
