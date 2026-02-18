import { useEffect, useState } from 'react'
import { listVMs, VM } from '../api/vm'
import VMCard from '../components/VMCard'

export default function VMList() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVMs()
  }, [])

  const loadVMs = async () => {
    try {
      const data = await listVMs()
      setVMs(data)
    } catch (error) {
      console.error('Failed to load VMs:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Virtual Machines</h1>

      {vms.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-xl text-gray-400 mb-4">No VMs found</p>
          <p className="text-gray-500">Create your first virtual machine to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vms.map((vm) => (
            <VMCard key={vm.name} vm={vm} onUpdate={loadVMs} />
          ))}
        </div>
      )}
    </div>
  )
}
