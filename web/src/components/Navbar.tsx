import { Link } from 'react-router-dom'
import { Server, Plus, Home, Terminal, Network, HardDrive, Settings, Layers, Shield, Calendar, FileText, BarChart3, Save, Bell, Database, Cpu } from 'lucide-react'
import ConnectionStatus from './ConnectionStatus'

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
                VMs
              </Link>
              <Link
                to="/logs"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Terminal className="w-4 h-4" />
                Logs
              </Link>
              <Link
                to="/network"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Network className="w-4 h-4" />
                Network
              </Link>
              <Link
                to="/storage"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <HardDrive className="w-4 h-4" />
                Storage
              </Link>
              <Link
                to="/storage-pools"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Database className="w-4 h-4" />
                Pools
              </Link>
              <Link
                to="/system"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Cpu className="w-4 h-4" />
                System
              </Link>
              <Link
                to="/templates"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Layers className="w-4 h-4" />
                Templates
              </Link>
              <Link
                to="/quotas"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Shield className="w-4 h-4" />
                Quotas
              </Link>
              <Link
                to="/schedules"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Calendar className="w-4 h-4" />
                Schedules
              </Link>
              <Link
                to="/audit"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <FileText className="w-4 h-4" />
                Audit
              </Link>
              <Link
                to="/analytics"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <BarChart3 className="w-4 h-4" />
                Analytics
              </Link>
              <Link
                to="/backups"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Save className="w-4 h-4" />
                Backups
              </Link>
              <Link
                to="/notifications"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Bell className="w-4 h-4" />
                Notifications
              </Link>
              <Link
                to="/settings"
                className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-700 transition"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus />
            <Link
              to="/create"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
            >
              <Plus className="w-4 h-4" />
              Create VM
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
