import { useState, useEffect } from 'react'
import { Plus, ChevronRight, ChevronDown, Trash2 } from 'lucide-react'
import {
  listPools,
  createPool,
  deletePool,
  getPoolSummary,
  checkAdmission,
  type ResourcePool,
  type ResourcePoolSummary,
  type AdmissionControlResult,
} from '../api/resourcePools'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'

export default function ResourcePools() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [pools, setPools] = useState<ResourcePool[]>([])
  const [summaries, setSummaries] = useState<Map<string, ResourcePoolSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set())
  const [showCreatePool, setShowCreatePool] = useState(false)
  const [showAdmissionTest, setShowAdmissionTest] = useState<string | null>(null)
  const [admissionResult, setAdmissionResult] = useState<AdmissionControlResult | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const data = await listPools()
      setPools(data)
      const sums = new Map<string, ResourcePoolSummary>()
      for (const pool of data) {
        try {
          const s = await getPoolSummary(pool.id)
          sums.set(pool.id, s)
        } catch { /* skip */ }
      }
      setSummaries(sums)
    } catch (error) {
      console.error('Failed to load resource pools:', error)
    } finally {
      setLoading(false)
    }
  }

  const togglePool = (id: string) => {
    setExpandedPools(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm('Delete Resource Pool', 'Delete this resource pool?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return
    try {
      await deletePool(id)
      toast.success('Resource pool deleted')
      loadData()
    } catch { toast.error('Failed to delete resource pool') }
  }

  const handleAdmissionTest = async (poolId: string, cpu: number, memoryMb: number) => {
    try {
      const result = await checkAdmission(poolId, { cpu, memory_mb: memoryMb })
      setAdmissionResult(result)
    } catch { toast.error('Admission test failed') }
  }

  const rootPools = pools.filter(p => !p.parent_id)
  const getChildren = (parentId: string) => pools.filter(p => p.parent_id === parentId)

  const renderPool = (pool: ResourcePool, depth: number) => {
    const children = getChildren(pool.id)
    const isExpanded = expandedPools.has(pool.id)
    const summary = summaries.get(pool.id)
    const cpuPct = pool.cpu_limit > 0 ? (pool.cpu_used / pool.cpu_limit * 100) : 0
    const memPct = pool.memory_limit_mb > 0 ? (pool.memory_used_mb / pool.memory_limit_mb * 100) : 0

    return (
      <div key={pool.id}>
        <div
          className="flex items-center justify-between p-3 hover:bg-slate-900 cursor-pointer border-b border-slate-700/50"
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
          onClick={() => togglePool(pool.id)}
        >
          <div className="flex items-center gap-3">
            {children.length > 0 ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : <div className="w-4" />}
            <span className="font-medium">{pool.name}</span>
            <span className="text-xs text-slate-400">
              {pool.vm_count} VMs | CPU: {pool.cpu_shares} shares | Mem: {pool.memory_shares} shares
            </span>
          </div>
          <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">CPU</span>
              <div className="w-20 bg-slate-800 rounded-full h-2">
                <div className={`h-2 rounded-full ${cpuPct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(cpuPct, 100)}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Mem</span>
              <div className="w-20 bg-slate-800 rounded-full h-2">
                <div className={`h-2 rounded-full ${memPct > 80 ? 'bg-red-500' : 'bg-purple-500'}`}
                  style={{ width: `${Math.min(memPct, 100)}%` }} />
              </div>
            </div>
            <button onClick={() => setShowAdmissionTest(pool.id)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1">
              Test Admission
            </button>
            <button onClick={() => handleDelete(pool.id)} className="text-red-600 hover:text-red-800 p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <>
            {summary && (
              <div className="grid grid-cols-4 gap-3 p-3 bg-slate-900" style={{ paddingLeft: `${depth * 24 + 40}px` }}>
                <div className="text-xs"><span className="text-slate-400">Reservation:</span> {pool.cpu_reservation} MHz / {pool.memory_reservation_mb} MB</div>
                <div className="text-xs"><span className="text-slate-400">Limit:</span> {pool.cpu_limit} MHz / {pool.memory_limit_mb} MB</div>
                <div className="text-xs"><span className="text-slate-400">Available:</span> {summary.cpu_available} MHz / {summary.memory_available_mb} MB</div>
                <div className="text-xs"><span className="text-slate-400">Children:</span> {summary.child_pool_count} pools</div>
              </div>
            )}
            {children.map(child => renderPool(child, depth + 1))}
          </>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Resource Pools"
        actions={
          <button onClick={() => setShowCreatePool(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Pool
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Total Pools</div>
          <div className="text-2xl font-bold">{pools.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Total CPU Shares</div>
          <div className="text-2xl font-bold">{pools.reduce((s, p) => s + p.cpu_shares, 0)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-slate-400 text-sm mb-1">Total VMs</div>
          <div className="text-2xl font-bold">{pools.reduce((s, p) => s + p.vm_count, 0)}</div>
        </div>
      </div>

      {/* Tree */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg">
        {rootPools.length === 0 ? (
          <div className="text-center py-12 text-slate-400">No resource pools configured.</div>
        ) : (
          rootPools.map(pool => renderPool(pool, 0))
        )}
      </div>

      {/* Create Pool Modal */}
      {showCreatePool && (
        <CreatePoolModal
          pools={pools}
          onClose={() => setShowCreatePool(false)}
          onCreated={() => { setShowCreatePool(false); loadData() }}
        />
      )}

      {/* Admission Test Modal */}
      {showAdmissionTest && (
        <AdmissionTestModal
          poolId={showAdmissionTest}
          result={admissionResult}
          onTest={handleAdmissionTest}
          onClose={() => { setShowAdmissionTest(null); setAdmissionResult(null) }}
        />
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

function CreatePoolModal({ pools, onClose, onCreated }: { pools: ResourcePool[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [clusterId, setClusterId] = useState('')
  const [parentId, setParentId] = useState('')
  const [cpuShares, setCpuShares] = useState(1000)
  const [cpuReservation, setCpuReservation] = useState(0)
  const [cpuLimit, setCpuLimit] = useState(-1)
  const [memoryShares, setMemoryShares] = useState(1000)
  const [memoryReservation, setMemoryReservation] = useState(0)
  const [memoryLimit, setMemoryLimit] = useState(-1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createPool({
        name,
        cluster_id: clusterId,
        parent_id: parentId || undefined,
        cpu_shares: cpuShares,
        cpu_reservation: cpuReservation,
        cpu_limit: cpuLimit,
        memory_shares: memoryShares,
        memory_reservation_mb: memoryReservation,
        memory_limit_mb: memoryLimit,
      })
      onCreated()
    } catch { alert('Failed to create pool') }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4">Create Resource Pool</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cluster ID</label>
            <input type="text" value={clusterId} onChange={e => setClusterId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Parent Pool (optional)</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2">
              <option value="">None (root pool)</option>
              {pools.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">CPU Shares</label>
              <input type="number" value={cpuShares} onChange={e => setCpuShares(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory Shares</label>
              <input type="number" value={memoryShares} onChange={e => setMemoryShares(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CPU Reservation (MHz)</label>
              <input type="number" value={cpuReservation} onChange={e => setCpuReservation(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory Reservation (MB)</label>
              <input type="number" value={memoryReservation} onChange={e => setMemoryReservation(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CPU Limit (MHz, -1=unlimited)</label>
              <input type="number" value={cpuLimit} onChange={e => setCpuLimit(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory Limit (MB, -1=unlimited)</label>
              <input type="number" value={memoryLimit} onChange={e => setMemoryLimit(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdmissionTestModal({ poolId, result, onTest, onClose }: {
  poolId: string
  result: AdmissionControlResult | null
  onTest: (poolId: string, cpu: number, mem: number) => void
  onClose: () => void
}) {
  const [cpu, setCpu] = useState(1000)
  const [memory, setMemory] = useState(2048)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800/50 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Admission Control Test</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Required CPU (MHz)</label>
            <input type="number" value={cpu} onChange={e => setCpu(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Required Memory (MB)</label>
            <input type="number" value={memory} onChange={e => setMemory(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700/50 rounded px-3 py-2" />
          </div>
          <button onClick={() => onTest(poolId, cpu, memory)}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Run Test</button>
          {result && (
            <div className={`p-4 rounded border ${result.admitted ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
              <div className="font-medium mb-2">{result.admitted ? 'Admitted' : 'Denied'}</div>
              {result.reason && <div className="text-sm text-slate-300">{result.reason}</div>}
              <div className="text-xs text-slate-400 mt-2">
                Available: {result.available_cpu} MHz CPU, {result.available_memory_mb} MB Memory
              </div>
            </div>
          )}
          <button onClick={onClose} className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded">Close</button>
        </div>
      </div>
    </div>
  )
}
