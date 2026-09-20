// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useState } from 'react'
import { Bot, Cpu, Layers, Radio } from 'lucide-react'
import {
  FabricGpuView,
  InferenceDeployment,
  InferenceEndpoint,
  InferenceProfile,
  ModelArtifact,
  listDeployments,
  listEndpoints,
  listGpus,
  listModels,
  listProfiles,
} from '../api/ai'
import { PageHeader, EmptyState, Card } from '../components/ui'
import PageLoadBanner from '../components/PageLoadBanner'
import { usePageLoader } from '../hooks/usePageLoader'

type Tab = 'models' | 'deployments' | 'endpoints' | 'gpus'

export default function AiWorkloads() {
  const [tab, setTab] = useState<Tab>('deployments')
  const [models, setModels] = useState<ModelArtifact[]>([])
  const [profiles, setProfiles] = useState<InferenceProfile[]>([])
  const [deployments, setDeployments] = useState<InferenceDeployment[]>([])
  const [endpoints, setEndpoints] = useState<InferenceEndpoint[]>([])
  const [gpus, setGpus] = useState<FabricGpuView[]>([])
  const { loading, loadError, run } = usePageLoader('Failed to load AI workloads')

  const load = useCallback(() => {
    return run(async () => {
      const [m, p, d, e, g] = await Promise.all([
        listModels(),
        listProfiles(),
        listDeployments(),
        listEndpoints(),
        listGpus(),
      ])
      setModels(Array.isArray(m) ? m : [])
      setProfiles(Array.isArray(p) ? p : [])
      setDeployments(Array.isArray(d) ? d : [])
      setEndpoints(Array.isArray(e) ? e : [])
      const gItems = Array.isArray(g) ? g : (g as { items?: FabricGpuView[] }).items ?? []
      setGpus(gItems)
    })
  }, [run])

  useEffect(() => {
    void load()
  }, [load])

  const tabs: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: 'models', label: 'Models', icon: Layers },
    { id: 'deployments', label: 'Deployments', icon: Bot },
    { id: 'endpoints', label: 'Endpoints', icon: Radio },
    { id: 'gpus', label: 'GPUs', icon: Cpu },
  ]

  return (
    <div>
      <PageHeader
        title="AI Workloads"
        description="Preview: deploy vLLM on NVIDIA GPU VMs and expose OpenAI-compatible Maglev endpoints. Aligns with Janus FabricAIJob / FabricGpuNode vocabulary."
        onRefresh={() => void load()}
        refreshing={loading}
      />
      <PageLoadBanner title="Could not load AI workloads" headline={loadError} onRetry={() => void load()} />

      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`zf-btn zf-btn-sm ${tab === t.id ? 'zf-btn-primary' : 'zf-btn-ghost'}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'models' && (
        models.length === 0 ? (
          <EmptyState icon={<Layers className="w-8 h-8" />} title="No model artifacts" description="zyvorctl ai model add NAME --source hf://org/model" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--zf-muted)] border-b border-[var(--zf-hairline)]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Local path</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.name} className="border-b border-[var(--zf-hairline)]">
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{m.source}</td>
                    <td className="px-4 py-3">{m.format}</td>
                    <td className="px-4 py-3 font-mono text-xs">{m.local_path ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'deployments' && (
        deployments.length === 0 ? (
          <EmptyState icon={<Bot className="w-8 h-8" />} title="No inference deployments" description="zyvorctl ai deploy MODEL --runtime vllm --gpu 1 --replicas 1" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--zf-muted)] border-b border-[var(--zf-hairline)]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3">Replicas</th>
                  <th className="px-4 py-3">Phase</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => (
                  <tr key={d.name} className="border-b border-[var(--zf-hairline)]">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3">{d.model}</td>
                    <td className="px-4 py-3">{d.profile}</td>
                    <td className="px-4 py-3">{d.status.replicas?.filter((r) => r.ready).length ?? 0}/{d.replicas}</td>
                    <td className="px-4 py-3">{d.status.phase || '—'}</td>
                    <td className="px-4 py-3 text-xs text-[var(--zf-muted)]">{d.status.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'endpoints' && (
        endpoints.length === 0 ? (
          <EmptyState icon={<Radio className="w-8 h-8" />} title="No endpoints" description="zyvorctl ai endpoint expose DEPLOYMENT --openai-compatible" />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--zf-muted)] border-b border-[var(--zf-hairline)]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Deployment</th>
                  <th className="px-4 py-3">Protocol</th>
                  <th className="px-4 py-3">Port</th>
                  <th className="px-4 py-3">VIP</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e) => (
                  <tr key={e.name} className="border-b border-[var(--zf-hairline)]">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3">{e.deployment}</td>
                    <td className="px-4 py-3">{e.protocol}</td>
                    <td className="px-4 py-3">{e.port}</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.vip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'gpus' && (
        gpus.length === 0 ? (
          <EmptyState icon={<Cpu className="w-8 h-8" />} title="No GPUs reported" description="FluxVM GET /v1/host/gpus returned an empty inventory. Janus can simulate FabricGpuNode fleets offline." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--zf-muted)] border-b border-[var(--zf-hairline)]">
                  <th className="px-4 py-3">BDF</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">VRAM</th>
                  <th className="px-4 py-3">VFIO</th>
                  <th className="px-4 py-3">Held</th>
                  <th className="px-4 py-3">Allocated</th>
                </tr>
              </thead>
              <tbody>
                {gpus.map((g) => (
                  <tr key={g.bdf} className="border-b border-[var(--zf-hairline)]">
                    <td className="px-4 py-3 font-mono text-xs">{g.bdf}</td>
                    <td className="px-4 py-3">{g.vendor}</td>
                    <td className="px-4 py-3">{g.driver ?? '—'}</td>
                    <td className="px-4 py-3">{g.vram_gib != null ? `${g.vram_gib} GiB` : '—'}</td>
                    <td className="px-4 py-3">{g.group_bound_to_vfio ? 'yes' : 'no'}</td>
                    <td className="px-4 py-3">{g.group_held ? 'yes' : 'no'}</td>
                    <td className="px-4 py-3 text-xs">{g.allocated_to?.deployment ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}

      {profiles.length > 0 && tab === 'deployments' && (
        <p className="mt-3 text-xs text-[var(--zf-muted)]">{profiles.length} profile(s) registered</p>
      )}
    </div>
  )
}
