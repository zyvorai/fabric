// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, HardDrive, ArrowRight, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { apiFetch } from '../api/client'

interface DiskImage {
  path: string
  name: string
  format: string
  size: number
}

interface JobStatus {
  id: string
  status: string
  progress: number
  error?: string
  output_path?: string
}

const FORMATS = ['qcow2', 'vmdk', 'vhd', 'vhdx', 'raw'] as const

function deriveOutputPath(sourcePath: string, targetFormat: string): string {
  if (!sourcePath) return ''
  const lastDot = sourcePath.lastIndexOf('.')
  const base = lastDot > 0 ? sourcePath.substring(0, lastDot) : sourcePath
  return `${base}.${targetFormat}`
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(1)} ${units[i]}`
}

export default function DiskConverter() {
  const [diskImages, setDiskImages] = useState<DiskImage[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [targetFormat, setTargetFormat] = useState<string>('qcow2')
  const [outputPath, setOutputPath] = useState('')
  const [outputEdited, setOutputEdited] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [job, setJob] = useState<JobStatus | null>(null)
  const [polling, setPolling] = useState(false)

  const loadDiskImages = async () => {
    setLoadingImages(true)
    try {
      const res = await apiFetch('/api/images')
      if (res.ok) {
        const data = await res.json()
        setDiskImages(data.images || data.disk_images || [])
      }
    } catch { /* endpoint may not be available */ } finally { setLoadingImages(false) }
  }

  useEffect(() => { loadDiskImages() }, [])

  useEffect(() => {
    if (!outputEdited) setOutputPath(deriveOutputPath(sourcePath, targetFormat))
  }, [sourcePath, targetFormat, outputEdited])

  const jobRef = useRef<JobStatus | null>(null)
  useEffect(() => { jobRef.current = job }, [job])

  useEffect(() => {
    if (!polling) return
    const currentJob = jobRef.current
    if (!currentJob) return
    if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') { setPolling(false); return }
    const jobId = currentJob.id
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/images/convert/${jobId}`)
        if (res.ok) {
          const data = await res.json()
          const updated: JobStatus = { id: jobId, status: data.status || 'unknown', progress: data.progress ?? 0, error: data.error, output_path: data.output_path }
          setJob(updated)
          if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'cancelled') setPolling(false)
        }
      } catch { /* retry */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [polling])

  const handleConvert = async () => {
    if (!sourcePath.trim()) { setError('Please select or enter a source disk image.'); return }
    if (!outputPath.trim()) { setError('Please enter an output path.'); return }
    setError(''); setSubmitting(true); setJob(null)
    try {
      const res = await apiFetch('/api/images/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath, output_path: outputPath, format: targetFormat }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Conversion request failed')
      const jobId = data.job_id || data.id
      if (!jobId) throw new Error('No job ID returned from server')
      setJob({ id: jobId, status: 'pending', progress: 0 })
      setPolling(true)
    } catch (e: any) { setError(e.message || 'Failed to submit conversion job') } finally { setSubmitting(false) }
  }

  const handleReset = () => {
    setSourcePath(''); setTargetFormat('qcow2'); setOutputPath(''); setOutputEdited(false); setError(''); setJob(null); setPolling(false)
  }

  const jobDone = job?.status === 'completed'
  const jobFailed = job?.status === 'failed'
  const jobRunning = job && !jobDone && !jobFailed && job.status !== 'cancelled'

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <HardDrive className="w-4 h-4 text-white" />
            </div>
            <span className="text-gradient-blue">Disk Format Converter</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">Convert disk images between qcow2, vmdk, vhd, vhdx, and raw formats</p>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-1">Source Disk Image</label>
          {diskImages.length > 0 ? (
            <div className="space-y-2">
              <select value={sourcePath} onChange={(e) => { setSourcePath(e.target.value); setOutputEdited(false) }}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                <option value="">Select a disk image...</option>
                {diskImages.map((img) => (
                  <option key={img.path} value={img.path}>{img.name || img.path} ({img.format?.toUpperCase()}, {formatBytes(img.size)})</option>
                ))}
              </select>
              <div className="text-xs text-slate-500">Or type a path:</div>
              <input type="text" value={sourcePath} onChange={(e) => { setSourcePath(e.target.value); setOutputEdited(false) }} placeholder="/path/to/disk.vmdk"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>
          ) : (
            <div className="space-y-2">
              <input type="text" value={sourcePath} onChange={(e) => { setSourcePath(e.target.value); setOutputEdited(false) }} placeholder="/path/to/disk.vmdk"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              <button onClick={loadDiskImages} disabled={loadingImages} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                <RefreshCw className={`w-3 h-3 ${loadingImages ? 'animate-spin' : ''}`} /> Load available disk images
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Format</label>
            <select value={targetFormat} onChange={(e) => { setTargetFormat(e.target.value); setOutputEdited(false) }}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              {FORMATS.map((f) => (<option key={f} value={f}>{f.toUpperCase()}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Output Path</label>
            <input type="text" value={outputPath} onChange={(e) => { setOutputPath(e.target.value); setOutputEdited(true) }} placeholder="Auto-generated from source"
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
        </div>

        {sourcePath && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
            <span className="text-xs text-slate-300 truncate flex-1">{sourcePath}</span>
            <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-xs font-medium text-blue-400 flex-shrink-0">{targetFormat.toUpperCase()}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleConvert} disabled={submitting || !!jobRunning || !sourcePath.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-teal-600 to-cyan-700 text-white hover:from-teal-500 hover:to-cyan-600 shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : <><HardDrive className="w-4 h-4" />Convert</>}
          </button>
          {(job || error) && (
            <button onClick={handleReset} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 transition-all">Reset</button>
          )}
        </div>

        {job && (
          <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {jobDone && <CheckCircle className="w-4 h-4 text-green-400" />}
                {jobFailed && <AlertTriangle className="w-4 h-4 text-red-400" />}
                {jobRunning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                <span className="text-sm font-medium text-white">
                  {jobDone ? 'Conversion Complete' : jobFailed ? 'Conversion Failed' : 'Converting...'}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">{job.id.substring(0, 12)}</span>
            </div>
            <div className="bg-slate-700 rounded-full h-2 mb-2">
              <div className={`rounded-full h-full transition-all duration-500 ${jobDone ? 'bg-green-500' : jobFailed ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${job.progress}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{job.progress}%</span>
              <span className={`capitalize ${jobDone ? 'text-green-400' : jobFailed ? 'text-red-400' : 'text-blue-400'}`}>{job.status}</span>
            </div>
            {jobFailed && job.error && <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-300">{job.error}</div>}
            {jobDone && (
              <div className="mt-3 text-xs text-slate-400">
                Output: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs text-slate-200">{job.output_path || outputPath}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
