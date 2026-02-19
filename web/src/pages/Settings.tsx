import { useState } from 'react'
import { Settings as SettingsIcon, Save, RotateCcw, Bell, Globe, Shield, Database } from 'lucide-react'
import { useToastContext } from '../contexts/ToastContext'

export default function Settings() {
  const toast = useToastContext()

  // General Settings
  const [daemonName, setDaemonName] = useState('vmspawnd-01')
  const [apiPort, setApiPort] = useState('8080')
  const [logLevel, setLogLevel] = useState('info')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState('5')

  // Network Settings
  const [defaultBridge, setDefaultBridge] = useState('br0')
  const [enableIPv6, setEnableIPv6] = useState(false)
  const [dnsServers, setDnsServers] = useState('8.8.8.8, 8.8.4.4')

  // Storage Settings
  const [defaultPool, setDefaultPool] = useState('default')
  const [defaultFormat, setDefaultFormat] = useState('qcow2')
  const [enableCompression, setEnableCompression] = useState(true)
  const [snapshotRetention, setSnapshotRetention] = useState('30')

  // Security Settings
  const [enableAuth, setEnableAuth] = useState(true)
  const [enableTLS, setEnableTLS] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('3600')
  const [auditLogging, setAuditLogging] = useState(true)

  // Notification Settings
  const [emailNotifications, setEmailNotifications] = useState(false)
  const [webhookURL, setWebhookURL] = useState('')
  const [notifyOnStart, setNotifyOnStart] = useState(true)
  const [notifyOnStop, setNotifyOnStop] = useState(true)
  const [notifyOnError, setNotifyOnError] = useState(true)

  const handleSave = () => {
    // In real app, save to API
    toast.success('Settings saved successfully')
  }

  const handleReset = () => {
    // Reset to defaults
    toast.info('Settings reset to defaults')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <SettingsIcon className="w-8 h-8" />
          Settings
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* General Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            General
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Daemon Name
              </label>
              <input
                type="text"
                value={daemonName}
                onChange={(e) => setDaemonName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                API Port
              </label>
              <input
                type="text"
                value={apiPort}
                onChange={(e) => setApiPort(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Log Level
              </label>
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Refresh Interval (seconds)
              </label>
              <input
                type="number"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                disabled={!autoRefresh}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-300">
              Enable auto-refresh
            </label>
          </div>
        </div>
      </div>

      {/* Network Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-green-400" />
            Network
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Default Bridge
              </label>
              <input
                type="text"
                value={defaultBridge}
                onChange={(e) => setDefaultBridge(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                DNS Servers
              </label>
              <input
                type="text"
                value={dnsServers}
                onChange={(e) => setDnsServers(e.target.value)}
                placeholder="Comma-separated"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableIPv6"
              checked={enableIPv6}
              onChange={(e) => setEnableIPv6(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="enableIPv6" className="text-sm text-gray-300">
              Enable IPv6 networking
            </label>
          </div>
        </div>
      </div>

      {/* Storage Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            Storage
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Default Storage Pool
              </label>
              <select
                value={defaultPool}
                onChange={(e) => setDefaultPool(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="default">default</option>
                <option value="ssd-pool">ssd-pool</option>
                <option value="hdd-pool">hdd-pool</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Default Disk Format
              </label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="qcow2">QCOW2</option>
                <option value="raw">RAW</option>
                <option value="vmdk">VMDK</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Snapshot Retention (days)
            </label>
            <input
              type="number"
              value={snapshotRetention}
              onChange={(e) => setSnapshotRetention(e.target.value)}
              className="w-full md:w-1/2 bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enableCompression"
              checked={enableCompression}
              onChange={(e) => setEnableCompression(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="enableCompression" className="text-sm text-gray-300">
              Enable disk compression for QCOW2
            </label>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            Security
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Session Timeout (seconds)
            </label>
            <input
              type="number"
              value={sessionTimeout}
              onChange={(e) => setSessionTimeout(e.target.value)}
              className="w-full md:w-1/2 bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableAuth"
                checked={enableAuth}
                onChange={(e) => setEnableAuth(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="enableAuth" className="text-sm text-gray-300">
                Enable authentication (JWT)
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableTLS"
                checked={enableTLS}
                onChange={(e) => setEnableTLS(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="enableTLS" className="text-sm text-gray-300">
                Enable TLS/HTTPS
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auditLogging"
                checked={auditLogging}
                onChange={(e) => setAuditLogging(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="auditLogging" className="text-sm text-gray-300">
                Enable audit logging
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-400" />
            Notifications
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Webhook URL (optional)
            </label>
            <input
              type="text"
              value={webhookURL}
              onChange={(e) => setWebhookURL(e.target.value)}
              placeholder="https://hooks.slack.com/..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="emailNotifications"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="emailNotifications" className="text-sm text-gray-300">
                Enable email notifications
              </label>
            </div>

            <div className="ml-6 space-y-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="notifyOnStart"
                  checked={notifyOnStart}
                  onChange={(e) => setNotifyOnStart(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="notifyOnStart">VM started</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="notifyOnStop"
                  checked={notifyOnStop}
                  onChange={(e) => setNotifyOnStop(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="notifyOnStop">VM stopped</label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="notifyOnError"
                  checked={notifyOnError}
                  onChange={(e) => setNotifyOnError(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="notifyOnError">VM errors</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
