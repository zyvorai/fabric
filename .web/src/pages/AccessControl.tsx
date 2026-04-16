import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react'
import { apiFetch } from '../api/client'
import { useToastContext } from '../contexts/ToastContext'

interface UserAccount { id: string; username: string; role: string; enabled: boolean; created_at: string; last_login?: string }

function roleBadge(role: string): string {
  switch (role?.toLowerCase()) {
    case 'admin': return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'operator': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'viewer': return 'bg-green-500/20 text-green-400 border-green-500/30'
    default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/
const MIN_PASSWORD_LENGTH = 8

export default function AccessControl() {
  const toast = useToastContext()
  const [users, setUsers] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch('/api/users')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : data.users || [])
    } catch (err: any) { setError(err.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleAdd = async () => {
    if (!newUsername.trim()) { setAddError('Username is required'); return }
    if (!USERNAME_REGEX.test(newUsername.trim())) { setAddError('Username must be 3-32 characters: letters, numbers, hyphens, underscores'); return }
    if (!newPassword.trim()) { setAddError('Password is required'); return }
    if (newPassword.length < MIN_PASSWORD_LENGTH) { setAddError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`); return }
    setAdding(true); setAddError(''); setAddSuccess('')
    try {
      const res = await apiFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }) })
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || `HTTP ${res.status}`) }
      setAddSuccess(`User "${newUsername}" created`); setNewUsername(''); setNewPassword(''); setShowAdd(false); fetchUsers()
      setTimeout(() => setAddSuccess(''), 3000)
    } catch (err: any) { setAddError(err.message) } finally { setAdding(false) }
  }

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
      setUsers(prev => prev.filter(u => u.id !== id))
      toast.success(`User "${username}" deleted`)
    } catch (err) {
      toast.error(`Failed to delete user: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, enabled: !enabled } : u))
    } catch (err) {
      toast.error(`Failed to update user: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const adminCount = users.filter(u => u.role === 'admin').length
  const operatorCount = users.filter(u => u.role === 'operator').length
  const viewerCount = users.filter(u => u.role === 'viewer').length

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-3" />Loading users...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Users className="w-6 h-6 text-indigo-400" /> Access Control</h1>
          <p className="text-sm text-slate-400 mt-1">User accounts and role management</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {error && <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4 text-sm text-red-400">{error}</div>}
      {addSuccess && <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{addSuccess}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card-blue rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-slate-400 mt-1">Total Users</div>
        </div>
        <div className="stat-card-red rounded-xl border border-slate-700/50 p-5 card-glow transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{adminCount}</div>
          <div className="text-xs text-slate-400 mt-1">Admins</div>
        </div>
        <div className="stat-card-cyan rounded-xl border border-slate-700/50 p-5 card-glow-cyan transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{operatorCount}</div>
          <div className="text-xs text-slate-400 mt-1">Operators</div>
        </div>
        <div className="stat-card-green rounded-xl border border-slate-700/50 p-5 card-glow-green transition-all hover:scale-[1.02]">
          <div className="text-2xl font-bold text-white">{viewerCount}</div>
          <div className="text-xs text-slate-400 mt-1">Viewers</div>
        </div>
      </div>

      {showAdd && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label><input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="password" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" /></div>
            <div><label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
              <div className="flex gap-2">
                {['admin', 'operator', 'viewer'].map(r => (
                  <button key={r} onClick={() => setNewRole(r)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${newRole === r ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30' : 'text-slate-400 bg-slate-800 border-slate-700 hover:border-slate-600'}`}>{r}</button>
                ))}
              </div>
            </div>
          </div>
          {addError && <p className="text-sm text-red-400">{addError}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={adding} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors">{adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{adding ? 'Adding...' : 'Add'}</button>
            <button onClick={() => { setShowAdd(false); setAddError('') }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl p-10 border border-slate-700/50 text-center text-slate-500"><Users className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No users configured</p></div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Created</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Last Login</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/30">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white uppercase">{user.username.charAt(0)}</div><span className="text-white font-medium">{user.username}</span></div></td>
                  <td className="px-5 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${roleBadge(user.role)}`}>{user.role}</span></td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleToggle(user.id, user.enabled)} className="flex items-center gap-1.5" aria-label={`${user.enabled ? 'Disable' : 'Enable'} user ${user.username}`}>
                      <div className={`relative w-8 h-4 rounded-full transition-colors ${user.enabled ? 'bg-green-600' : 'bg-slate-600'}`} role="switch" aria-checked={user.enabled}><div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${user.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} /></div>
                      <span className={`text-xs ${user.enabled ? 'text-green-400' : 'text-slate-500'}`}>{user.enabled ? 'Active' : 'Disabled'}</span>
                    </button>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(user.id, user.username)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete user"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
