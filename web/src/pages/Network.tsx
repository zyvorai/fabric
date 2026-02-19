import { useEffect, useState } from 'react'
import { Network as NetworkIcon, Plus, Edit, Trash2, Activity } from 'lucide-react'

interface NetworkBridge {
  name: string
  ip: string
  status: 'UP' | 'DOWN'
  type: 'bridge' | 'nat' | 'isolated'
  vms: number
}

interface VLAN {
  id: number
  name: string
  bridge: string
  vms: number
}

export default function Network() {
  const [bridges, setBridges] = useState<NetworkBridge[]>([
    { name: 'br0', ip: '192.168.100.1/24', status: 'UP', type: 'bridge', vms: 5 },
    { name: 'br1', ip: '192.168.200.1/24', status: 'UP', type: 'bridge', vms: 3 },
    { name: 'virbr0', ip: '192.168.122.1/24', status: 'UP', type: 'nat', vms: 2 },
  ])

  const [vlans, setVLANs] = useState<VLAN[]>([
    { id: 100, name: 'vlan100', bridge: 'br0', vms: 2 },
    { id: 200, name: 'vlan200', bridge: 'br0', vms: 3 },
    { id: 300, name: 'vlan300', bridge: 'br1', vms: 1 },
  ])

  const getStatusColor = (status: string) => {
    return status === 'UP' ? 'bg-green-500' : 'bg-red-500'
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bridge': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      case 'nat': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'isolated': return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <NetworkIcon className="w-8 h-8" />
          Network Configuration
        </h1>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition">
          <Plus className="w-4 h-4" />
          Create Bridge
        </button>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Total Bridges</div>
          <div className="text-3xl font-bold text-blue-400">{bridges.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Active</div>
          <div className="text-3xl font-bold text-green-400">
            {bridges.filter(b => b.status === 'UP').length}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">VLANs</div>
          <div className="text-3xl font-bold text-purple-400">{vlans.length}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-2">Connected VMs</div>
          <div className="text-3xl font-bold text-orange-400">
            {bridges.reduce((acc, b) => acc + b.vms, 0)}
          </div>
        </div>
      </div>

      {/* Network Bridges */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Network Bridges</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">IP Address</th>
                <th className="text-left p-4 font-medium text-gray-300">Type</th>
                <th className="text-left p-4 font-medium text-gray-300">Status</th>
                <th className="text-left p-4 font-medium text-gray-300">Connected VMs</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {bridges.map((bridge) => (
                <tr key={bridge.name} className="hover:bg-gray-700 transition">
                  <td className="p-4">
                    <div className="font-medium">{bridge.name}</div>
                  </td>
                  <td className="p-4 text-gray-400 font-mono text-sm">
                    {bridge.ip}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTypeColor(bridge.type)}`}>
                      {bridge.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(bridge.status)}`}></div>
                      <span className="text-sm">{bridge.status}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-blue-400">
                      <Activity className="w-4 h-4" />
                      {bridge.vms}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-600 rounded transition">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* VLANs */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold">VLANs</h2>
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg transition text-sm">
            <Plus className="w-4 h-4" />
            Create VLAN
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4 font-medium text-gray-300">VLAN ID</th>
                <th className="text-left p-4 font-medium text-gray-300">Name</th>
                <th className="text-left p-4 font-medium text-gray-300">Bridge</th>
                <th className="text-left p-4 font-medium text-gray-300">Connected VMs</th>
                <th className="text-left p-4 font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {vlans.map((vlan) => (
                <tr key={vlan.id} className="hover:bg-gray-700 transition">
                  <td className="p-4">
                    <span className="font-mono text-purple-400">{vlan.id}</span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{vlan.name}</div>
                  </td>
                  <td className="p-4 text-gray-400">
                    {vlan.bridge}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-blue-400">
                      <Activity className="w-4 h-4" />
                      {vlan.vms}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-gray-600 rounded transition">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-red-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Network Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Network I/O</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">RX Packets</span>
              <span className="font-mono text-green-400">1,234,567</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">TX Packets</span>
              <span className="font-mono text-blue-400">987,654</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">RX Bytes</span>
              <span className="font-mono text-green-400">2.3 GB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">TX Bytes</span>
              <span className="font-mono text-blue-400">1.8 GB</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">Port Forwarding Rules</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-cyan-400">80</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono text-sm text-blue-400">web-01:80</span>
              </div>
              <span className="text-xs text-gray-500">TCP</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-cyan-400">443</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono text-sm text-blue-400">web-01:443</span>
              </div>
              <span className="text-xs text-gray-500">TCP</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-cyan-400">3306</span>
                <span className="text-gray-400">→</span>
                <span className="font-mono text-sm text-blue-400">db-01:3306</span>
              </div>
              <span className="text-xs text-gray-500">TCP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
