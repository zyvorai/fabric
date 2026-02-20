import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import {
  listSwitches,
  createSwitch,
  deleteSwitch,
  listPortGroups,
  listFirewallRules,
  createFirewallRule,
  deleteFirewallRule,
  listSecurityGroups,
  createSecurityGroup,
  listOverlays,
  createOverlay,
  listLoadBalancers,
  createLoadBalancer,
  type DistributedSwitch,
  type PortGroup,
  type FirewallRule,
  type SecurityGroup,
  type OverlayNetwork,
  type LoadBalancer,
} from '../api/networking'
import { useToastContext } from '../contexts/ToastContext'

export default function SDNNetworking() {
  const toast = useToastContext()
  const [switches, setSwitches] = useState<DistributedSwitch[]>([])
  const [portGroups, setPortGroups] = useState<PortGroup[]>([])
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([])
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([])
  const [overlays, setOverlays] = useState<OverlayNetwork[]>([])
  const [loadBalancers, setLoadBalancers] = useState<LoadBalancer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'switches' | 'firewall' | 'security' | 'overlays' | 'lb'>('switches')
  const [showCreateSwitch, setShowCreateSwitch] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateOverlay, setShowCreateOverlay] = useState(false)
  const [showCreateLB, setShowCreateLB] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [sw, pg, fw, sg, ov, lb] = await Promise.all([
        listSwitches(), listPortGroups(), listFirewallRules(),
        listSecurityGroups(), listOverlays(), listLoadBalancers(),
      ])
      setSwitches(sw); setPortGroups(pg); setFirewallRules(fw)
      setSecurityGroups(sg); setOverlays(ov); setLoadBalancers(lb)
    } catch (error) {
      console.error('Failed to load networking data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSwitch = async (id: string) => {
    if (!confirm('Delete this distributed switch?')) return
    try { await deleteSwitch(id); toast.success('Switch deleted'); loadData() }
    catch { toast.error('Failed to delete switch') }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this firewall rule?')) return
    try { await deleteFirewallRule(id); toast.success('Rule deleted'); loadData() }
    catch { toast.error('Failed to delete rule') }
  }

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      active: 'bg-green-100 text-green-800', inactive: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800', degraded: 'bg-yellow-100 text-yellow-800',
      down: 'bg-red-100 text-red-800',
    }
    return m[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">SDN Networking</h1>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Switches</div>
          <div className="text-3xl font-bold">{switches.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Firewall Rules</div>
          <div className="text-3xl font-bold">{firewallRules.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Security Groups</div>
          <div className="text-3xl font-bold">{securityGroups.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Overlay Networks</div>
          <div className="text-3xl font-bold">{overlays.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-400 text-sm mb-1">Load Balancers</div>
          <div className="text-3xl font-bold">{loadBalancers.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {(['switches', 'firewall', 'security', 'overlays', 'lb'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded text-sm font-medium ${activeTab === tab ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>
            {tab === 'switches' ? 'Switches' : tab === 'firewall' ? 'Firewall' : tab === 'security' ? 'Security Groups' : tab === 'overlays' ? 'Overlays' : 'Load Balancers'}
          </button>
        ))}
      </div>

      {/* Switches Tab */}
      {activeTab === 'switches' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateSwitch(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Switch
            </button>
          </div>
          {switches.map(sw => (
            <div key={sw.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-lg">{sw.name}</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(sw.status)}`}>{sw.status}</span>
                  <span className="text-sm text-gray-400">MTU: {sw.mtu} | {sw.uplink_count} uplinks | {sw.hosts.length} hosts</span>
                </div>
                <button onClick={() => handleDeleteSwitch(sw.id)} className="text-red-600 hover:text-red-800">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {portGroups.filter(pg => pg.switch_id === sw.id).length > 0 && (
                <table className="min-w-full divide-y divide-gray-700 mt-2">
                  <thead>
                    <tr className="text-left text-xs text-gray-400">
                      <th className="p-2">Port Group</th>
                      <th className="p-2">VLAN</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Ports (Used/Available)</th>
                      <th className="p-2">Teaming</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {portGroups.filter(pg => pg.switch_id === sw.id).map(pg => (
                      <tr key={pg.id} className="hover:bg-gray-750">
                        <td className="p-2 font-medium">{pg.name}</td>
                        <td className="p-2 text-sm">{pg.vlan_id}</td>
                        <td className="p-2 text-sm">{pg.vlan_type}</td>
                        <td className="p-2 text-sm">{pg.ports_used}/{pg.ports_available}</td>
                        <td className="p-2 text-sm text-gray-400">{pg.teaming_policy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {switches.length === 0 && (
            <div className="text-center py-12 text-gray-400 bg-gray-800 rounded-lg">No distributed switches.</div>
          )}
        </div>
      )}

      {/* Firewall Tab */}
      {activeTab === 'firewall' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateRule(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Rule
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Priority</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Direction</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Protocol</th>
                  <th className="p-4">Source</th>
                  <th className="p-4">Destination</th>
                  <th className="p-4">Port</th>
                  <th className="p-4">Enabled</th>
                  <th className="p-4">Hits</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {firewallRules.length === 0 ? (
                  <tr><td colSpan={11} className="p-8 text-center text-gray-400">No firewall rules.</td></tr>
                ) : firewallRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-gray-750">
                    <td className="p-4 text-sm font-mono">{rule.priority}</td>
                    <td className="p-4 font-medium">{rule.name}</td>
                    <td className="p-4 text-sm">{rule.direction}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rule.action === 'allow' ? 'bg-green-100 text-green-800' :
                        rule.action === 'deny' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>{rule.action}</span>
                    </td>
                    <td className="p-4 text-sm font-mono">{rule.protocol}</td>
                    <td className="p-4 text-sm font-mono text-gray-400">{rule.source}</td>
                    <td className="p-4 text-sm font-mono text-gray-400">{rule.destination}</td>
                    <td className="p-4 text-sm font-mono">{rule.port_range || 'Any'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {rule.enabled ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-400">{rule.hit_count}</td>
                    <td className="p-4">
                      <button onClick={() => handleDeleteRule(rule.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Groups Tab */}
      {activeTab === 'security' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateGroup(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Group
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {securityGroups.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-400 bg-gray-800 rounded-lg">No security groups.</div>
            ) : securityGroups.map(sg => (
              <div key={sg.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">{sg.name}</h3>
                {sg.description && <p className="text-sm text-gray-400 mb-3">{sg.description}</p>}
                <div className="flex justify-between text-sm text-gray-400">
                  <span>{sg.vm_ids.length} members</span>
                  <span>{sg.rule_count} rules</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlays Tab */}
      {activeTab === 'overlays' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateOverlay(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Overlay
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">VNI</th>
                  <th className="p-4">Tunnel Type</th>
                  <th className="p-4">Subnet</th>
                  <th className="p-4">Gateway</th>
                  <th className="p-4">VMs</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {overlays.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No overlay networks.</td></tr>
                ) : overlays.map(ov => (
                  <tr key={ov.id} className="hover:bg-gray-750">
                    <td className="p-4 font-medium">{ov.name}</td>
                    <td className="p-4 text-sm font-mono">{ov.vni}</td>
                    <td className="p-4 text-sm">{ov.tunnel_type.toUpperCase()}</td>
                    <td className="p-4 text-sm font-mono text-gray-400">{ov.subnet}</td>
                    <td className="p-4 text-sm font-mono text-gray-400">{ov.gateway || '-'}</td>
                    <td className="p-4 text-sm">{ov.vm_count}</td>
                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(ov.status)}`}>{ov.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load Balancers Tab */}
      {activeTab === 'lb' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCreateLB(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Load Balancer
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="p-4">Name</th>
                  <th className="p-4">VIP</th>
                  <th className="p-4">Port</th>
                  <th className="p-4">Protocol</th>
                  <th className="p-4">Algorithm</th>
                  <th className="p-4">Backends</th>
                  <th className="p-4">Health</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loadBalancers.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">No load balancers.</td></tr>
                ) : loadBalancers.map(lb => {
                  const healthy = lb.backends.filter(b => b.status === 'healthy' || b.status === 'active').length
                  return (
                    <tr key={lb.id} className="hover:bg-gray-750">
                      <td className="p-4 font-medium">{lb.name}</td>
                      <td className="p-4 text-sm font-mono">{lb.vip}</td>
                      <td className="p-4 text-sm">{lb.port}</td>
                      <td className="p-4 text-sm">{lb.protocol.toUpperCase()}</td>
                      <td className="p-4 text-sm text-gray-400">{lb.algorithm.replace(/_/g, ' ')}</td>
                      <td className="p-4 text-sm">{lb.backends.length}</td>
                      <td className="p-4">
                        <span className={`text-sm ${healthy === lb.backends.length ? 'text-green-400' : healthy > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {healthy}/{lb.backends.length} healthy
                        </span>
                      </td>
                      <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(lb.status)}`}>{lb.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateSwitch && <SimpleModal title="Create Distributed Switch" onClose={() => setShowCreateSwitch(false)} onSubmit={async (d) => { await createSwitch({ name: d.name, mtu: Number(d.mtu) || 1500 }); toast.success('Switch created'); setShowCreateSwitch(false); loadData() }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'mtu', label: 'MTU', type: 'number', defaultValue: '1500' }]} />}
      {showCreateRule && <SimpleModal title="Create Firewall Rule" onClose={() => setShowCreateRule(false)} onSubmit={async (d) => { await createFirewallRule({ name: d.name, direction: d.direction as any, action: d.action as any, protocol: d.protocol, source: d.source, destination: d.destination, port_range: d.port_range || undefined, priority: Number(d.priority) }); toast.success('Rule created'); setShowCreateRule(false); loadData() }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'priority', label: 'Priority', type: 'number', defaultValue: '100' }, { name: 'direction', label: 'Direction', type: 'select', options: 'inbound,outbound' }, { name: 'action', label: 'Action', type: 'select', options: 'allow,deny,reject' }, { name: 'protocol', label: 'Protocol', defaultValue: 'tcp' }, { name: 'source', label: 'Source', defaultValue: '0.0.0.0/0' }, { name: 'destination', label: 'Destination', defaultValue: '0.0.0.0/0' }, { name: 'port_range', label: 'Port Range' }]} />}
      {showCreateGroup && <SimpleModal title="Create Security Group" onClose={() => setShowCreateGroup(false)} onSubmit={async (d) => { await createSecurityGroup({ name: d.name, description: d.description || undefined }); toast.success('Group created'); setShowCreateGroup(false); loadData() }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }]} />}
      {showCreateOverlay && <SimpleModal title="Create Overlay Network" onClose={() => setShowCreateOverlay(false)} onSubmit={async (d) => { await createOverlay({ name: d.name, tunnel_type: d.tunnel_type as any, subnet: d.subnet, gateway: d.gateway || undefined }); toast.success('Overlay created'); setShowCreateOverlay(false); loadData() }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'tunnel_type', label: 'Tunnel Type', type: 'select', options: 'vxlan,geneve,gre' }, { name: 'subnet', label: 'Subnet', required: true, defaultValue: '10.0.0.0/24' }, { name: 'gateway', label: 'Gateway' }]} />}
      {showCreateLB && <SimpleModal title="Create Load Balancer" onClose={() => setShowCreateLB(false)} onSubmit={async (d) => { await createLoadBalancer({ name: d.name, vip: d.vip, port: Number(d.port), protocol: d.protocol as any, backends: [] }); toast.success('LB created'); setShowCreateLB(false); loadData() }} fields={[{ name: 'name', label: 'Name', required: true }, { name: 'vip', label: 'Virtual IP', required: true }, { name: 'port', label: 'Port', type: 'number', defaultValue: '80' }, { name: 'protocol', label: 'Protocol', type: 'select', options: 'tcp,udp,http,https' }]} />}
    </div>
  )
}

interface SimpleField { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; options?: string }

function SimpleModal({ title, fields, onClose, onSubmit }: { title: string; fields: SimpleField[]; onClose: () => void; onSubmit: (data: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    fields.forEach(f => { init[f.name] = f.defaultValue || '' })
    return init
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await onSubmit(values) } catch { alert(`Failed: ${title}`) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              {f.type === 'select' ? (
                <select value={values[f.name]} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2">
                  {f.options?.split(',').map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : 'text'} value={values[f.name]}
                  onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" required={f.required} />
              )}
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}
