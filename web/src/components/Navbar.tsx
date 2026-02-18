import { Link } from 'react-router-dom'
import { Server, Plus, Home } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-white">
              <Server className="w-6 h-6" />
              vmspawnd
            </Link>
            <div className="flex gap-4">
              <Link
                to="/"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </Link>
              <Link
                to="/vms"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Server className="w-4 h-4" />
                Virtual Machines
              </Link>
            </div>
          </div>
          <Link
            to="/create"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
          >
            <Plus className="w-4 h-4" />
            Create VM
          </Link>
        </div>
      </div>
    </nav>
  )
}
