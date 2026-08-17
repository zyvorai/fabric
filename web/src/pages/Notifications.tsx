// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, Power, PowerOff, Send, Mail, MessageSquare, Webhook } from 'lucide-react'
import {
  listChannels,
  listRules,
  createChannel,
  deleteChannel,
  deleteRule,
  enableRule,
  disableRule,
  testChannel,
  getHistory,
  NotificationChannel,
  NotificationRule,
  NotificationHistory,
} from '../api/notifications'
import { useToastContext } from '../contexts/ToastContext'
import { useConfirm } from '../hooks/useConfirm'
import ConfirmDialog from '../components/ConfirmDialog'
import { PageHeader } from '../components/ui'
import ErrorBanner from '../components/ErrorBanner'
import { formatUserError } from '../utils/apiError'
import { toastFailure } from '../utils/toastError'
import { hintsForError } from '../utils/daemonHints'

export default function Notifications() {
  const toast = useToastContext()
  const { confirmState, confirm, cancel } = useConfirm()
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [history, setHistory] = useState<NotificationHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'channels' | 'rules' | 'history'>('channels')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    setLoadError(null)
    const [chRes, rulesRes, histRes] = await Promise.allSettled([
      listChannels(),
      listRules(),
      getHistory(50),
    ])
    if (chRes.status === 'fulfilled') setChannels(chRes.value)
    else {
      setChannels([])
      const msg = formatUserError(chRes.reason)
      setLoadError(msg)
      toastFailure(toast, 'Failed to load notifications', chRes.reason)
    }
    if (rulesRes.status === 'fulfilled') setRules(rulesRes.value)
    else setRules([])
    if (histRes.status === 'fulfilled') setHistory(histRes.value)
    else setHistory([])
    setLoading(false)
  }

  const handleDeleteChannel = async (id: string) => {
    const ok = await confirm('Delete Channel', 'Delete this notification channel?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await deleteChannel(id)
      toast.success('Channel deleted')
      loadData()
    } catch (error) {
      toastFailure(toast, 'Failed to delete channel', error)
    }
  }

  const handleTestChannel = async (id: string, name: string) => {
    try {
      await testChannel(id)
      toast.success(`Test notification sent to ${name}`)
    } catch (error) {
      toastFailure(toast, 'Failed to send test notification', error)
    }
  }

  const handleDeleteRule = async (id: string) => {
    const ok = await confirm('Delete Rule', 'Delete this notification rule?', { variant: 'danger', confirmLabel: 'Delete' })
    if (!ok) return

    try {
      await deleteRule(id)
      toast.success('Rule deleted')
      loadData()
    } catch (error) {
      toastFailure(toast, 'Failed to delete rule', error)
    }
  }

  const handleToggleRule = async (rule: NotificationRule) => {
    try {
      if (rule.enabled) {
        await disableRule(rule.id)
        toast.success('Rule disabled')
      } else {
        await enableRule(rule.id)
        toast.success('Rule enabled')
      }
      loadData()
    } catch (error) {
      toastFailure(toast, `Failed to ${rule.enabled ? 'disable' : 'enable'} rule`, error)
    }
  }

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-5 h-5 text-blue-500" />
      case 'slack': return <MessageSquare className="w-5 h-5 text-purple-500" />
      case 'webhook': return <Webhook className="w-5 h-5 text-green-500" />
      case 'teams': return <MessageSquare className="w-5 h-5 text-cyan-500" />
      default: return <Bell className="w-5 h-5 text-slate-500" />
    }
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-600'
      case 'warning': return 'bg-yellow-600'
      case 'info': return 'bg-blue-600'
      default: return 'bg-slate-600'
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading notifications...</div>
  }

  return (
    <div>
      {loadError && (
        <ErrorBanner
          title="Could not load notifications"
          headline={loadError}
          hints={hintsForError(loadError)}
          onRetry={loadData}
        />
      )}
      <PageHeader
        title="Notifications"
        description="Manage notification channels and alert rules"
      />

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-700/50">
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'channels'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Channels ({channels.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'rules'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Rules ({rules.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'history'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Notification Channels</h2>
            <button
              onClick={() => setShowCreateChannel(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Add Channel
            </button>
          </div>

          {channels.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Bell className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-xl text-slate-400 mb-4">No notification channels</p>
              <p className="text-slate-500 mb-6">Add a channel to receive notifications</p>
              <button
                onClick={() => setShowCreateChannel(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Add First Channel
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getChannelIcon(channel.type)}
                      <div>
                        <h3 className="font-bold">{channel.name}</h3>
                        <p className="text-xs text-slate-400 capitalize">{channel.type}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        channel.enabled ? 'bg-green-600' : 'bg-slate-600'
                      }`}
                    >
                      {channel.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleTestChannel(channel.id, channel.name)}
                      disabled={!channel.enabled}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      <Send className="w-4 h-4" />
                      Test
                    </button>
                    <button
                      onClick={() => handleDeleteChannel(channel.id)}
                      className="p-2 bg-red-600 hover:bg-red-700 rounded transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Notification Rules</h2>
            <button
              onClick={() => setShowCreateRule(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Bell className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-xl text-slate-400 mb-4">No notification rules</p>
              <p className="text-slate-500 mb-6">Create rules to trigger notifications</p>
              <button
                onClick={() => setShowCreateRule(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Create First Rule
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold">{rule.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            rule.enabled ? 'bg-green-600' : 'bg-slate-600'
                          }`}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-slate-400 mb-2">{rule.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {rule.event_types.slice(0, 3).map((event) => (
                          <span
                            key={event}
                            className="px-2 py-1 bg-blue-600 rounded text-xs"
                          >
                            {event}
                          </span>
                        ))}
                        {rule.event_types.length > 3 && (
                          <span className="px-2 py-1 bg-slate-800 rounded text-xs">
                            +{rule.event_types.length - 3} more
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 text-xs text-slate-400">
                        <span>Triggered: {rule.triggered_count} times</span>
                        {rule.last_triggered && (
                          <span>• Last: {new Date(rule.last_triggered).toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleRule(rule)}
                        className={`p-2 rounded transition ${
                          rule.enabled
                            ? 'bg-yellow-600 hover:bg-yellow-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                        title={rule.enabled ? 'Disable' : 'Enable'}
                      >
                        {rule.enabled ? (
                          <PowerOff className="w-4 h-4" />
                        ) : (
                          <Power className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          <h2 className="text-xl font-bold mb-4">Notification History</h2>
          {history.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <p className="text-slate-400">No notification history yet</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        Rule
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        Event
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        VM
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        Channel
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900">
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {new Date(item.sent_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">{item.rule_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(item.severity)}`}>
                            {item.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.vm_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{item.channel}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              item.status === 'sent' ? 'bg-green-600' : 'bg-red-600'
                            }`}
                          >
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateChannel && (
        <CreateChannelModal
          onClose={() => setShowCreateChannel(false)}
          onCreated={() => { setShowCreateChannel(false); loadData() }}
        />
      )}

      {showCreateRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Create Notification Rule</h2>
            <p className="text-slate-400 mb-4">
              Configure when and how to send notifications
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateRule(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          variant={confirmState.variant}
          onConfirm={confirmState.onConfirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

type ChannelType = 'email' | 'slack' | 'webhook' | 'teams'

function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToastContext()
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('webhook')
  const [saving, setSaving] = useState(false)
  // One field set per type -- only the active type's fields are sent as `config`.
  const [webhookUrl, setWebhookUrl] = useState('')
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('')
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')

  const configFor = (t: ChannelType): Record<string, unknown> => {
    switch (t) {
      case 'webhook':
        return { url: webhookUrl }
      case 'slack':
        return { webhook_url: slackWebhookUrl }
      case 'teams':
        return { webhook_url: teamsWebhookUrl }
      case 'email':
        return { smtp_host: smtpHost, smtp_port: Number(smtpPort), from: fromAddress, to: toAddress }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createChannel({ name, type, config: configFor(type) })
      toast.success('Notification channel created')
      onCreated()
    } catch (err) {
      toastFailure(toast, 'Failed to create channel', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Add Notification Channel</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="e.g. ops-slack" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ChannelType)}
              className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2">
              <option value="webhook">Webhook</option>
              <option value="slack">Slack</option>
              <option value="teams">Microsoft Teams</option>
              <option value="email">Email</option>
            </select>
          </div>

          {type === 'webhook' && (
            <div>
              <label className="block text-sm font-medium mb-1">Webhook URL</label>
              <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} required
                className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="https://..." />
            </div>
          )}

          {type === 'slack' && (
            <div>
              <label className="block text-sm font-medium mb-1">Slack Webhook URL</label>
              <input type="url" value={slackWebhookUrl} onChange={(e) => setSlackWebhookUrl(e.target.value)} required
                className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="https://hooks.slack.com/services/..." />
            </div>
          )}

          {type === 'teams' && (
            <div>
              <label className="block text-sm font-medium mb-1">Teams Webhook URL</label>
              <input type="url" value={teamsWebhookUrl} onChange={(e) => setTeamsWebhookUrl(e.target.value)} required
                className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="https://xxx.webhook.office.com/..." />
            </div>
          )}

          {type === 'email' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Host</label>
                  <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required
                    className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Port</label>
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required
                    className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">From Address</label>
                <input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} required
                  className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="alerts@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">To Address</label>
                <input type="email" value={toAddress} onChange={(e) => setToAddress(e.target.value)} required
                  className="w-full bg-slate-900 border border-slate-700/50 rounded px-3 py-2" placeholder="oncall@example.com" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-600 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
