import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function Console() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()

  return (
    <div>
      <button
        onClick={() => navigate(`/vms/${name}`)}
        className="flex items-center gap-2 mb-6 text-gray-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to VM Details
      </button>

      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-2xl font-bold mb-4">Console: {name}</h1>
        <div className="bg-black rounded p-4 h-96 flex items-center justify-center">
          <p className="text-gray-500">
            Console integration coming soon. Use `machinectl login {name}` for now.
          </p>
        </div>
      </div>
    </div>
  )
}
