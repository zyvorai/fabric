// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, Fragment } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '../api/client'

interface PipelineJob {
  id: string
  vm_name: string
  source: string
  status: string
  progress: number
  pipeline_stage: string
  duration: string
  output_path: string
  error?: string
}

const PIPELINE_STAGES = ['inspect', 'prepare', 'convert', 'validate', 'deploy']

function getStatusClasses(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed': return 'bg-green-500/20 text-green-400'
    case 'running': return 'bg-blue-500/20 text-blue-400'
    case 'failed': return 'bg-red-500/20 text-red-400'
    case 'pending': return 'bg-slate-500/20 text-slate-400'
    default: return 'bg-slate-500/20 text-slate-400'
  }
}

function getProgressBarColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed': return 'bg-green-500'
    case 'running': return 'bg-blue-500'
    case 'failed': return 'bg-red-500'
    default: return 'bg-slate-500'
  }
}

function getStageIndex(stage: string): number {
  const idx = PIPELINE_STAGES.indexOf(stage.toLowerCase())
  return idx >= 0 ? idx : -1
}

export default function PipelineMonitor() {
  const [jobs, setJobs] = useState<PipelineJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const fetchJobs = async () => {
      try {
        const response = await apiFetch('/api/pipeline/jobs')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        if (active) {
          setJobs(Array.isArray(data) ? data : data.jobs || [])
          setError(null)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to fetch jobs')
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchJobs()
    const interval = setInterval(fetchJobs, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <RefreshCw className="w-4 h-4 text-white" />
            </div>
            <span className="text-gradient-blue">Pipeline Monitor</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`} />
            <span className="text-xs text-slate-500">{error ? 'Disconnected' : 'Auto-refresh 3s'}</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 mb-4">
            <p className="text-xs text-red-400">Failed to fetch pipeline data: {error}</p>
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-10 text-sm text-slate-500">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading pipeline jobs...
          </div>
        )}

        {!loading && jobs.length === 0 && !error && (
          <div className="text-center py-10 text-sm text-slate-500">No active pipeline jobs</div>
        )}

        {jobs.map((job) => {
          const currentStage = getStageIndex(job.pipeline_stage)
          return (
            <div key={job.id} className="p-4 border-b border-slate-700/30 last:border-b-0">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5">{job.vm_name || job.id}</div>
                  <div className="text-xs text-slate-500">Source: {job.source} | ID: {job.id}</div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClasses(job.status)}`}>{job.status.toUpperCase()}</span>
              </div>

              <div className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-500">Progress</span>
                  <span className="text-xs font-semibold text-white">{job.progress}%</span>
                </div>
                <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(job.status)}`} style={{ width: `${job.progress}%` }} />
                </div>
              </div>

              <div className="mb-3">
                <div className="text-xs text-slate-500 mb-2">Pipeline Stage</div>
                <div className="flex items-center gap-0">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    let circleClasses = 'bg-slate-700 text-slate-400'
                    let lineClasses = 'h-0.5 w-8 bg-slate-700'
                    if (idx < currentStage) circleClasses = 'bg-green-500 text-white'
                    else if (idx === currentStage) circleClasses = job.status === 'failed' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white animate-pulse'
                    if (idx <= currentStage) lineClasses = 'h-0.5 w-8 bg-green-500'
                    return (
                      <Fragment key={stage}>
                        {idx > 0 && <div className={lineClasses} />}
                        <div className={`px-2 py-1 text-[10px] font-semibold rounded uppercase whitespace-nowrap ${circleClasses}`}>{stage}</div>
                      </Fragment>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-4 flex-wrap">
                {job.duration && <div><span className="text-xs text-slate-500">Duration: </span><span className="text-xs font-semibold text-slate-300">{job.duration}</span></div>}
                {job.output_path && <div><span className="text-xs text-slate-500">Output: </span><span className="text-xs font-semibold text-slate-300 font-mono">{job.output_path}</span></div>}
              </div>

              {job.error && (
                <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400 font-mono">{job.error}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
