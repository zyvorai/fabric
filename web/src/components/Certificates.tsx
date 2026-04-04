import { useState, useCallback } from 'react';
import { certificateApi } from '../utils/api';
import { formatDateTime } from '../utils/format';
import { usePolling } from '../hooks/usePolling';
import type { Certificate, CertificateAuthority } from '../types';

export default function Certificates() {
  const [caName, setCaName] = useState('');
  const [caType, setCaType] = useState('root');
  const [certSubject, setCertSubject] = useState('');
  const [certType, setCertType] = useState('server');

  const fetchCAs = useCallback(() => certificateApi.listCAs() as Promise<CertificateAuthority[]>, []);
  const fetchCerts = useCallback(() => certificateApi.listCertificates() as Promise<Certificate[]>, []);
  const fetchExpiring = useCallback(() => certificateApi.checkExpiring(), []);
  const fetchRequests = useCallback(() => certificateApi.listRequests(), []);

  const { data: casData, refresh: refreshCAs } = usePolling<CertificateAuthority[]>(fetchCAs, 30000);
  const { data: certsData, refresh: refreshCerts } = usePolling<Certificate[]>(fetchCerts, 15000);
  const { data: expiringData } = usePolling<unknown[]>(fetchExpiring, 60000);
  const { data: requestsData, refresh: refreshRequests } = usePolling<unknown[]>(fetchRequests, 15000);

  const cas = (casData || []) as CertificateAuthority[];
  const certs = (certsData || []) as Certificate[];
  const expiring = (expiringData || []) as Certificate[];
  const requests = (requestsData || []) as { id: string; subject: string; status: string; created_at: string }[];

  const handleCreateCA = async () => {
    if (!caName.trim()) return;
    try { await certificateApi.createCA({ name: caName, type: caType }); setCaName(''); refreshCAs(); }
    catch (err) { console.error('Failed to create CA:', err); }
  };

  const handleDeleteCA = async (id: string) => {
    if (!confirm('Delete this CA?')) return;
    try { await certificateApi.deleteCA(id); refreshCAs(); }
    catch (err) { console.error('Failed to delete CA:', err); }
  };

  const handleIssueCert = async () => {
    if (!certSubject.trim()) return;
    try { await certificateApi.issueCertificate({ subject: certSubject, type: certType }); setCertSubject(''); refreshCerts(); }
    catch (err) { console.error('Failed to issue certificate:', err); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this certificate?')) return;
    try { await certificateApi.revokeCertificate(id); refreshCerts(); }
    catch (err) { console.error('Failed to revoke:', err); }
  };

  const handleRenew = async (id: string) => {
    try { await certificateApi.renewCertificate(id); refreshCerts(); }
    catch (err) { console.error('Failed to renew:', err); }
  };

  const handleApproveRequest = async (id: string) => {
    try { await certificateApi.approveRequest(id); refreshRequests(); refreshCerts(); }
    catch (err) { console.error('Failed to approve request:', err); }
  };

  const handleRejectRequest = async (id: string) => {
    try { await certificateApi.rejectRequest(id); refreshRequests(); }
    catch (err) { console.error('Failed to reject request:', err); }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      valid: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400',
      revoked: 'bg-red-500/20 text-red-400', expired: 'bg-red-500/20 text-red-400',
      pending: 'bg-yellow-500/20 text-yellow-400',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Certificates</h2>
        <p className="text-sm text-slate-400 mt-1">Manage certificate authorities, certificates, and requests</p>
      </div>

      {expiring.length > 0 && (
        <div className="p-4 rounded-xl bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-sm">
          <strong>{expiring.length}</strong> certificate(s) expiring soon
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Create CA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={caName} onChange={e => setCaName(e.target.value)} placeholder="CA name" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={caType} onChange={e => setCaType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="root">Root</option><option value="intermediate">Intermediate</option>
          </select>
        </div>
        <button onClick={handleCreateCA} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Create CA</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Certificate Authorities</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Issued</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {cas.map(ca => (
              <tr key={ca.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{ca.name}</td>
                <td className="px-5 py-3">{ca.type}</td>
                <td className="px-5 py-3">{ca.certificates_issued}</td>
                <td className="px-5 py-3"><button onClick={() => handleDeleteCA(ca.id)} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Delete</button></td>
              </tr>
            ))}
            {cas.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-500">No CAs</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Issue Certificate</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input value={certSubject} onChange={e => setCertSubject(e.target.value)} placeholder="Subject (e.g., *.example.com)" className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500" />
          <select value={certType} onChange={e => setCertType(e.target.value)} className="bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500">
            <option value="server">Server</option><option value="client">Client</option><option value="ca">CA</option>
          </select>
        </div>
        <button onClick={handleIssueCert} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">Issue</button>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Certificates</h3></div>
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Issuer</th><th className="px-5 py-3">Valid To</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-700/50">
            {certs.map(c => (
              <tr key={c.id} className="text-slate-300 hover:bg-slate-700/30">
                <td className="px-5 py-3 text-white font-medium">{c.subject}</td>
                <td className="px-5 py-3">{c.issuer}</td>
                <td className="px-5 py-3 text-xs">{formatDateTime(c.valid_to)}</td>
                <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(c.status)}`}>{c.status}</span></td>
                <td className="px-5 py-3 space-x-1">
                  <button onClick={() => handleRenew(c.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Renew</button>
                  <button onClick={() => handleRevoke(c.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Revoke</button>
                </td>
              </tr>
            ))}
            {certs.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No certificates</td></tr>}
          </tbody>
        </table>
      </div>

      {requests.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50"><h3 className="text-lg font-semibold text-white">Pending Requests</h3></div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/50 text-slate-400"><tr><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {requests.map(r => (
                <tr key={r.id} className="text-slate-300 hover:bg-slate-700/30">
                  <td className="px-5 py-3 text-white">{r.subject}</td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(r.status)}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-xs">{formatDateTime(r.created_at)}</td>
                  <td className="px-5 py-3 space-x-1">
                    <button onClick={() => handleApproveRequest(r.id)} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg">Approve</button>
                    <button onClick={() => handleRejectRequest(r.id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg">Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
