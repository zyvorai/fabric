import { useState, useRef, useCallback } from 'react'
import { Upload, X, HardDrive, CheckCircle, AlertTriangle } from 'lucide-react'
import { getToken } from '../api/client'

interface UploadedFile { name: string; path: string; size_bytes: number; format: string; uploadedAt: string }

const ACCEPTED_EXTENSIONS = '.qcow2,.vmdk,.vhd,.vhdx,.raw,.img,.ova'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function UploadDisk() {
  const [file, setFile] = useState<File | null>(null)
  const [destDir, setDestDir] = useState('/var/lib/libvirt/images')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploaded, setUploaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [error, setError] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadedFile | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const startTimeRef = useRef<number>(0)

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const f = files[0]
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase()
    const valid = ['.qcow2', '.vmdk', '.vhd', '.vhdx', '.raw', '.img', '.ova']
    if (!valid.includes(ext)) { setError(`Unsupported format: ${ext}. Supported: ${valid.join(', ')}`); return }
    setFile(f); setError(''); setUploadResult(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }, [handleFiles])

  const handleUpload = () => {
    if (!file) return
    setUploading(true); setProgress(0); setUploaded(0); setTotal(file.size); setSpeed(0); setError(''); setUploadResult(null)
    startTimeRef.current = Date.now()
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100)); setUploaded(e.loaded); setTotal(e.total)
        const elapsed = (Date.now() - startTimeRef.current) / 1000
        if (elapsed > 0) setSpeed(e.loaded / elapsed)
      }
    }
    xhr.onload = () => {
      setUploading(false); xhrRef.current = null
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText)
          const uploadedFile: UploadedFile = { name: result.name, path: result.path, size_bytes: result.size_bytes, format: result.format, uploadedAt: new Date().toLocaleString() }
          setUploadResult(uploadedFile); setHistory((prev) => [uploadedFile, ...prev]); setFile(null)
        } catch { setError('Invalid response from server') }
      } else {
        try { setError(JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})`) } catch { setError(`Upload failed with status ${xhr.status}`) }
      }
    }
    xhr.onerror = () => { setUploading(false); xhrRef.current = null; setError('Network error during upload') }
    xhr.onabort = () => { setUploading(false); xhrRef.current = null; setError('Upload cancelled') }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dest_dir', destDir)
    xhr.open('POST', '/api/images/upload')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }

  const handleCancel = () => { if (xhrRef.current) xhrRef.current.abort() }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20"><Upload className="w-5 h-5 text-rose-400" /></div>
        <div><h2 className="text-xl font-bold text-white">Upload Disk Image</h2><p className="text-sm text-slate-400">Upload VM disk images to the server</p></div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
        onClick={() => fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'}`}
      >
        <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <p className="text-sm text-slate-300 mb-1">{file ? file.name : 'Drop a disk image here or click to browse'}</p>
        <p className="text-xs text-slate-500">{file ? formatBytes(file.size) : 'Supports: qcow2, vmdk, vhd, vhdx, raw, img, ova'}</p>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {file && !uploading && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Destination Directory</label>
            <input type="text" value={destDir} onChange={(e) => setDestDir(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleUpload} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/20 transition-all">
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button onClick={() => { setFile(null); setError('') }} className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">Clear</button>
          </div>
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Uploading {file?.name}...</span>
            <button onClick={handleCancel} className="p-1 text-slate-500 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="bg-slate-700 rounded-full h-3 mb-2">
            <div className="bg-blue-500 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>{formatBytes(uploaded)} / {formatBytes(total)} ({progress}%)</span>
            <span>{formatBytes(speed)}/s</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {uploadResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-400">Upload complete!</p>
            <p className="text-xs text-slate-400 mt-1">Path: <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-200">{uploadResult.path}</code></p>
            <p className="text-xs text-slate-400">Format: {uploadResult.format} | Size: {formatBytes(uploadResult.size_bytes)}</p>
          </div>
        </div>
      )}

      {/* Upload history */}
      {history.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50"><h3 className="text-sm font-semibold text-white">Upload History</h3></div>
          <div className="divide-y divide-slate-700/30">
            {history.map((h, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <HardDrive className="w-4 h-4 text-slate-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.format} | {formatBytes(h.size_bytes)} | {h.uploadedAt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
