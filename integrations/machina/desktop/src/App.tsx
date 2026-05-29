import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type VmRow = {
  name: string
  state: string
  cpus: number
  memory: number
}

export default function App() {
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:9095')
  const [token, setToken] = useState('')
  const [health, setHealth] = useState('')
  const [vms, setVms] = useState<VmRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const h = await invoke<string>('fabric_health', { endpoint, token: token || null })
      setHealth(h)
      const list = await invoke<VmRow[]>('fabric_list_vms', { endpoint, token: token || null })
      setVms(list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Machina</h1>
        <p className="tagline">Zyvor Fabric · Infrastructure Workbench (v0.1)</p>
      </header>

      <section className="panel">
        <label>
          Endpoint
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </label>
        <label>
          Token (optional)
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="JWT from /api/auth/login"
          />
        </label>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Connecting…' : 'Connect'}
        </button>
        {error && <p className="error">{error}</p>}
        {health && <p className="health">Health: {health}</p>}
      </section>

      <section className="panel">
        <h2>Virtual machines</h2>
        {vms.length === 0 ? (
          <p className="muted">No VMs loaded — connect to a Fabric cluster.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>CPUs</th>
                <th>Memory (MB)</th>
              </tr>
            </thead>
            <tbody>
              {vms.map((vm) => (
                <tr key={vm.name}>
                  <td>{vm.name}</td>
                  <td>{vm.state}</td>
                  <td>{vm.cpus}</td>
                  <td>{vm.memory}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer>
        <a href="https://zyvor.dev" target="_blank" rel="noreferrer">
          zyvor.dev
        </a>
      </footer>
    </div>
  )
}
