import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Check, Shield } from 'lucide-react'
import {
  listCas,
  createCa,
  listCertificates,
  revokeCertificate,
  listCertRequests,
  approveCertRequest,
  listAttestations,
  listSecurityBaselines,
  createSecurityBaseline,
  getCertHealthDashboard,
  type CertificateAuthority,
  type Certificate,
  type CertificateRequest,
  type TrustAttestation,
  type VmSecurityBaseline,
  type CertHealthDashboard,
} from '../api/certificates'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'

export default function Certificates() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [cas, setCAs] = useState<CertificateAuthority[]>([])
  const [certs, setCerts] = useState<Certificate[]>([])
  const [csrs, setCSRs] = useState<CertificateRequest[]>([])
  const [attestations, setAttestations] = useState<TrustAttestation[]>([])
  const [baselines, setBaselines] = useState<VmSecurityBaseline[]>([])
  const [health, setHealth] = useState<CertHealthDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cas' | 'certs' | 'csrs' | 'attestation' | 'baselines'>('dashboard')
  const [showCreateCA, setShowCreateCA] = useState(false)
  const [showCreateBaseline, setShowCreateBaseline] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ca, ct, cr, at, bl, hl] = await Promise.all([
        listCas(), listCertificates(), listCertRequests(),
        listAttestations(), listSecurityBaselines(), getCertHealthDashboard().catch(() => null),
      ])
      setCAs(ca); setCerts(ct); setCSRs(cr)
      setAttestations(at); setBaselines(bl); setHealth(hl)
    } catch (error) {
      console.error('Failed to load certificates data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (id: string) => {
    const ok = await confirm('Revoke Certificate', 'Revoke this certificate?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try { await revokeCertificate(id); toast.success('Certificate revoked'); loadData() }
    catch { toast.error('Failed to revoke certificate') }
  }

  const handleApproveCSR = async (id: string) => {
    try { await approveCertRequest(id); toast.success('Request approved'); loadData() }
    catch { toast.error('Failed to approve request') }
  }

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      active: 'bg-green-100 text-green-800', expired: 'bg-red-100 text-red-800',
      revoked: 'bg-slate-500/20 text-slate-400', expiring_soon: 'bg-yellow-100 text-yellow-800',
      pending: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800', trusted: 'bg-green-100 text-green-800',
      untrusted: 'bg-red-100 text-red-800', unknown: 'bg-slate-500/20 text-slate-400',
    }
    return m[status] || 'bg-slate-500/20 text-slate-400'
  }

  const daysUntil = (date: string) => {
    const diff = new Date(date).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="p-6">
      <PageHeader
        title="Certificates & Security"
        actions={
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-800/50 rounded-lg p-1 overflow-x-auto">
        {(['dashboard', 'cas', 'certs', 'csrs', 'attestation', 'baselines'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded text-sm font-medium whitespace-nowrap ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-white/[0.03]'}`}>
            {tab === 'cas' ? 'CAs' : tab === 'certs' ? 'Certificates' : tab === 'csrs' ? 'Requests' :
             tab === 'attestation' ? 'Attestation' : tab === 'baselines' ? 'Security Baselines' : 'Dashboard'}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {activeTab === 'dashboard' && health && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Total Certificates</div>
              <div className="text-2xl font-bold">{health.total_certificates}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Active</div>
              <div className="text-2xl font-bold text-green-400">{health.active}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Expiring Soon</div>
              <div className="text-2xl font-bold text-yellow-400">{health.expiring_soon}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-slate-400 text-sm mb-1">Expired</div>
              <div className="text-2xl font-bold text-red-400">{health.expired}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Certificate Authorities</div>
              <div className="text-2xl font-bold">{health.ca_count}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Pending Requests</div>
              <div className="text-2xl font-bold text-blue-400">{health.pending_requests}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="text-slate-400 text-sm mb-1">Overall Compliance</div>
              <div className="text-2xl font-bold">{health.overall_compliance_pct.toFixed(0)}%</div>
            </div>
          </div>
          {health.expiring_within_30_days.length > 0 && (
            <div className="bg-slate-800/50 border border-yellow-600 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-yellow-400">Expiring Within 30 Days</h3>
              <div className="space-y-2">
                {health.expiring_within_30_days.map(c => (
                  <div key={c.cert_id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                    <span className="font-mono text-sm">{c.subject}</span>
                    <span className="text-sm text-yellow-400">{c.days_remaining} days left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CAs Tab */}
      {activeTab === 'cas' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateCA(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create CA
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Valid Until</th>
                  <th className="p-4">Issued</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {cas.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No Certificate Authorities.</td></tr>
                ) : cas.map(ca => {
                  const days = daysUntil(ca.valid_to)
                  return (
                    <tr key={ca.id} className="hover:bg-slate-900">
                      <td className="p-4 font-medium">{ca.name}</td>
                      <td className="p-4 text-sm">{ca.ca_type}</td>
                      <td className="p-4 text-sm font-mono text-slate-400">{ca.subject}</td>
                      <td className="p-4 text-sm">
                        <span className={days < 30 ? 'text-red-400' : days < 90 ? 'text-yellow-400' : 'text-slate-400'}>
                          {new Date(ca.valid_to).toLocaleDateString()} ({days}d)
                        </span>
                      </td>
                      <td className="p-4 text-sm">{ca.issued_count}</td>
                      <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(ca.status)}`}>{ca.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Certificates Tab */}
      {activeTab === 'certs' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Subject</th>
                <th className="p-4">Type</th>
                <th className="p-4">Serial</th>
                <th className="p-4">Expires</th>
                <th className="p-4">Host/Service</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {certs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No certificates.</td></tr>
              ) : certs.map(cert => {
                const days = daysUntil(cert.valid_to)
                return (
                  <tr key={cert.id} className="hover:bg-slate-900">
                    <td className="p-4 font-mono text-sm">{cert.subject}</td>
                    <td className="p-4 text-sm">{cert.cert_type}</td>
                    <td className="p-4 text-xs font-mono text-slate-400">{cert.serial_number}</td>
                    <td className="p-4 text-sm">
                      <span className={days < 0 ? 'text-red-400' : days < 30 ? 'text-yellow-400' : 'text-slate-400'}>
                        {new Date(cert.valid_to).toLocaleDateString()} ({days}d)
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{cert.host_name || cert.service_name || '-'}</td>
                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(cert.status)}`}>{cert.status.replace(/_/g, ' ')}</span></td>
                    <td className="p-4">
                      {cert.status === 'active' && (
                        <button onClick={() => handleRevoke(cert.id)} className="text-red-600 hover:text-red-800 text-sm">Revoke</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CSR Queue Tab */}
      {activeTab === 'csrs' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Subject</th>
                <th className="p-4">Requestor</th>
                <th className="p-4">Type</th>
                <th className="p-4">Key Size</th>
                <th className="p-4">Submitted</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {csrs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No certificate requests in queue.</td></tr>
              ) : csrs.map(csr => (
                <tr key={csr.id} className="hover:bg-slate-900">
                  <td className="p-4 font-mono text-sm">{csr.subject}</td>
                  <td className="p-4 text-sm">{csr.requestor}</td>
                  <td className="p-4 text-sm">{csr.cert_type}</td>
                  <td className="p-4 text-sm">{csr.key_size} bits</td>
                  <td className="p-4 text-sm text-slate-400">{new Date(csr.submitted_at).toLocaleString()}</td>
                  <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(csr.status)}`}>{csr.status}</span></td>
                  <td className="p-4">
                    {csr.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleApproveCSR(csr.id)} className="text-green-500 hover:text-green-400 p-1">
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Host Attestation Tab */}
      {activeTab === 'attestation' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <table className="min-w-full divide-y divide-slate-700/50">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase">
                <th className="p-4">Host</th>
                <th className="p-4">TPM</th>
                <th className="p-4">TPM Version</th>
                <th className="p-4">Attestation</th>
                <th className="p-4">Boot Integrity</th>
                <th className="p-4">Secure Boot</th>
                <th className="p-4">Last Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {attestations.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">No host attestation data.</td></tr>
              ) : attestations.map(att => (
                <tr key={att.id} className="hover:bg-slate-900">
                  <td className="p-4 font-medium">{att.hostname}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${att.tpm_present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {att.tpm_present ? 'Present' : 'Absent'}
                    </span>
                  </td>
                  <td className="p-4 text-sm">{att.tpm_version || '-'}</td>
                  <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(att.attestation_status)}`}>{att.attestation_status}</span></td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${att.boot_integrity ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {att.boot_integrity ? 'Verified' : 'Failed'}
                    </span>
                  </td>
                  <td className="p-4 text-sm">{att.secure_boot_enabled ? 'Enabled' : 'Disabled'}</td>
                  <td className="p-4 text-sm text-slate-400">{att.last_attestation ? new Date(att.last_attestation).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Security Baselines Tab */}
      {activeTab === 'baselines' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateBaseline(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Baseline
            </button>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <table className="min-w-full divide-y divide-slate-700/50">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">VMs</th>
                  <th className="p-4">Compliant</th>
                  <th className="p-4">Checks</th>
                  <th className="p-4">Compliance</th>
                  <th className="p-4">Last Scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {baselines.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">No security baselines.</td></tr>
                ) : baselines.map(bl => {
                  const checkPct = bl.vm_count > 0 ? (bl.compliant_count / bl.vm_count * 100) : 0
                  return (
                    <tr key={bl.id} className="hover:bg-slate-900">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-400" />
                          <div>
                            <div className="font-medium">{bl.name}</div>
                            {bl.description && <div className="text-xs text-slate-400">{bl.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">{bl.vm_count}</td>
                      <td className="p-4 text-sm text-green-400">{bl.compliant_count}</td>
                      <td className="p-4 text-sm">{bl.checks.length}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-800 rounded-full h-2">
                            <div className={`h-2 rounded-full ${checkPct === 100 ? 'bg-green-500' : checkPct > 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${checkPct}%` }} />
                          </div>
                          <span className="text-xs text-slate-400">{checkPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-400">{bl.last_scan ? new Date(bl.last_scan).toLocaleDateString() : 'Never'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateCA && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Certificate Authority</h2>
            <CreateCAForm onClose={() => setShowCreateCA(false)} onCreated={() => { setShowCreateCA(false); loadData() }} />
          </div>
        </div>
      )}
      {showCreateBaseline && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Security Baseline</h2>
            <CreateBaselineForm onClose={() => setShowCreateBaseline(false)} onCreated={() => { setShowCreateBaseline(false); loadData() }} />
          </div>
        </div>
      )}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

function CreateCAForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [caType, setCaType] = useState<'root' | 'intermediate' | 'external'>('root')
  const [subject, setSubject] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await createCa({ name, ca_type: caType, subject }); onCreated() }
    catch { alert('Failed to create CA') }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="block text-sm font-medium mb-1">Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
      <div><label className="block text-sm font-medium mb-1">Type</label>
        <select value={caType} onChange={e => setCaType(e.target.value as 'root' | 'intermediate' | 'external')} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
          <option value="root">Root</option><option value="intermediate">Intermediate</option><option value="external">External</option>
        </select></div>
      <div><label className="block text-sm font-medium mb-1">Subject</label>
        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" placeholder="CN=My CA, O=My Org" required /></div>
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
        <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
      </div>
    </form>
  )
}

function CreateBaselineForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createSecurityBaseline({
        name,
        description: description || undefined,
        checks: [{ check_id: 'default', name: 'Default Check', category: 'general', severity: 'medium' }],
      })
      onCreated()
    } catch { alert('Failed to create baseline') }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div><label className="block text-sm font-medium mb-1">Name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required /></div>
      <div><label className="block text-sm font-medium mb-1">Description</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" /></div>
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
        <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
      </div>
    </form>
  )
}
