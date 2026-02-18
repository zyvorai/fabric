import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createVM } from '../api/vm'
import { ArrowLeft } from 'lucide-react'

export default function CreateVM() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [cpus, setCpus] = useState(2)
  const [memory, setMemory] = useState(2048)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await createVM({ name, image, cpus, memory })
      navigate('/vms')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create VM')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/vms')}
        className="flex items-center gap-2 mb-6 text-gray-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VMs
      </button>

      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold mb-8">Create Virtual Machine</h1>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-8 border border-gray-700">
          {error && (
            <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded text-red-200">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Image Path</label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="/path/to/image.qcow2"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">CPUs</label>
              <input
                type="number"
                value={cpus}
                onChange={(e) => setCpus(parseInt(e.target.value))}
                min="1"
                max="32"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Memory (MB)</label>
              <input
                type="number"
                value={memory}
                onChange={(e) => setMemory(parseInt(e.target.value))}
                min="512"
                step="512"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium transition"
          >
            {loading ? 'Creating...' : 'Create VM'}
          </button>
        </form>
      </div>
    </div>
  )
}
