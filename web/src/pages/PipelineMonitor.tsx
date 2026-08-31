// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useCallback, Fragment } from 'react'
import { RefreshCw, Workflow } from 'lucide-react'
import { apiFetch } from '../api/client'
import ErrorBanner from '../components/ErrorBanner'
import { PageHeader, EmptyState } from '../components/ui'
import { formatHttpErrorBody, formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'
import { useToastContext } from '../contexts/ToastContext'

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
    case 'completed': return 'bg-green-500/20 text-emerald-600'
    case 'running': return 'bg-blue-500/20 text-[#0066cc]'
    case 'failed': return 'bg-red-500/20 text-red-600'
    case 'pending': return 'bg-black/[0.06] text-[#6e6e73]'
    default: return 'bg-black/[0.06] text-[#6e6e73]'
  }
}

function getProgressBarColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed': return 'bg-green-500'
    case 'running': return 'bg-blue-500'
    case 'failed': return 'bg-red-500'
    default: return 'bg-[#6e6e73]'
  }
}

function getStageIndex(stage: string): number {
  const idx = PIPELINE_STAGES.indexOf(stage.toLowerCase())
  return idx >= 0 ? idx : -1
}

export default function PipelineMonitor() {
  const toast = useToastContext()
  const [jobs, setJobs] = useState<PipelineJob[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setLoadError(null)
    try {
      const response = await apiFetch('/api/pipeline/jobs')
      if (!response.ok) {
        const body = await response.text()
        throw new Error(formatHttpErrorBody(response.status, response.statusText, body))
      }
      const data = await response.json()
      setJobs(Array.isArray(data) ? data : data.jobs || [])
      setLoadError(null)
    } catch (err) {
      const msg = formatUserError(err)
      if (!silent || jobs.length === 0) {
        setLoadError(msg)
        if (!silent) toastFailure(toast, 'Failed to load pipeline jobs', err)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [toast, jobs.length])

  useEffect(() => {
    void fetchJobs(false)
    const interval = setInterval(() => void fetchJobs(true), 3000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Monitor"
        description="Migration and conversion pipeline jobs (auto-refresh 3s)"
        onRefresh={fetchJobs}
        refreshing={loading}
      />

      {loadError && (
        <ErrorBanner
          title="Could not load pipeline jobs"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={fetchJobs}
        />
      )}

      <div className="bg-[#f5f5f7] rounded-xl border border-[#d2d2d7] overflow-hidden">
      <div className="p-5">
        {loading && !loadError && (
          <div className="flex items-center justify-center py-10 text-sm text-[#6e6e73]">
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading pipeline jobs…
          </div>
        )}

        {!loading && jobs.length === 0 && !loadError && (
          <EmptyState
            icon={<Workflow className="w-10 h-10" />}
            title="No active pipeline jobs"
            description="Jobs appear here when migrations or conversions are running"
          />
        )}

        {jobs.map((job) => {
          const currentStage = getStageIndex(job.pipeline_stage)
          return (
            <div key={job.id} className="p-4 border-b border-[#d2d2d7]/60 last:border-b-0">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-sm font-semibold text-[#1d1d1f] mb-0.5">{job.vm_name || job.id}</div>
                  <div className="text-xs text-[#6e6e73]">Source: {job.source} | ID: {job.id}</div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClasses(job.status)}`}>{job.status.toUpperCase()}</span>
              </div>

              <div className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-[#6e6e73]">Progress</span>
                  <span className="text-xs font-semibold text-[#1d1d1f]">{job.progress}%</span>
                </div>
                <div className="bg-[#e8e8ed] rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(job.status)}`} style={{ width: `${job.progress}%` }} />
                </div>
              </div>

              <div className="mb-3">
                <div className="text-xs text-[#6e6e73] mb-2">Pipeline Stage</div>
                <div className="flex items-center gap-0">
                  {PIPELINE_STAGES.map((stage, idx) => {
                    let circleClasses = 'bg-[#e8e8ed] text-[#6e6e73]'
                    let lineClasses = 'h-0.5 w-8 bg-[#e8e8ed]'
                    if (idx < currentStage) circleClasses = 'bg-green-500 text-white'
                    else if (idx === currentStage) circleClasses = job.status === 'failed' ? 'bg-red-500 text-white' : 'bg-blue-500 text-[#1d1d1f] animate-pulse'
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
                {job.duration && <div><span className="text-xs text-[#6e6e73]">Duration: </span><span className="text-xs font-semibold text-[#1d1d1f]">{job.duration}</span></div>}
                {job.output_path && <div><span className="text-xs text-[#6e6e73]">Output: </span><span className="text-xs font-semibold text-[#1d1d1f] font-mono">{job.output_path}</span></div>}
              </div>

              {job.error && (
                <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-600 font-mono">{job.error}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
