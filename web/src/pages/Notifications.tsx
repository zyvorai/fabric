import { useEffect, useState } from 'react'
import { Bell, Plus, Trash2, Power, PowerOff, Send, Mail, MessageSquare, Webhook } from 'lucide-react'
import {
  listChannels,
  listRules,
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

export default function Notifications() {
  const toast = useToastContext()
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [history, setHistory] = useState<NotificationHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'channels' | 'rules' | 'history'>('channels')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [showCreateRule, setShowCreateRule] = useState(false)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      const [channelsData, rulesData, historyData] = await Promise.all([
        listChannels(),
        listRules(),
        getHistory(50)
      ])
      setChannels(channelsData)
      setRules(rulesData)
      setHistory(historyData)
    } catch (error) {
      console.error('Failed to load notifications:', error)
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Delete this notification channel?')) return

    try {
      await deleteChannel(id)
      toast.success('Channel deleted')
      loadData()
    } catch (_error) {
      toast.error('Failed to delete channel')
    }
  }

  const handleTestChannel = async (id: string, name: string) => {
    try {
      await testChannel(id)
      toast.success(`Test notification sent to ${name}`)
    } catch (_error) {
      toast.error('Failed to send test notification')
    }
  }

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this notification rule?')) return

    try {
      await deleteRule(id)
      toast.success('Rule deleted')
      loadData()
    } catch (_error) {
      toast.error('Failed to delete rule')
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
    } catch (_error) {
      toast.error(`Failed to ${rule.enabled ? 'disable' : 'enable'} rule`)
    }
  }

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-5 h-5 text-blue-500" />
      case 'slack': return <MessageSquare className="w-5 h-5 text-purple-500" />
      case 'webhook': return <Webhook className="w-5 h-5 text-green-500" />
      case 'teams': return <MessageSquare className="w-5 h-5 text-cyan-500" />
      default: return <Bell className="w-5 h-5 text-gray-500" />
    }
  }

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-600'
      case 'warning': return 'bg-yellow-600'
      case 'info': return 'bg-blue-600'
      default: return 'bg-gray-600'
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading notifications...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-gray-400">Manage notification channels and alert rules</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'channels'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Channels ({channels.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'rules'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Rules ({rules.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'history'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
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
            <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
              <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-xl text-gray-400 mb-4">No notification channels</p>
              <p className="text-gray-500 mb-6">Add a channel to receive notifications</p>
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
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getChannelIcon(channel.type)}
                      <div>
                        <h3 className="font-bold">{channel.name}</h3>
                        <p className="text-xs text-gray-400 capitalize">{channel.type}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        channel.enabled ? 'bg-green-600' : 'bg-gray-600'
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
            <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
              <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-xl text-gray-400 mb-4">No notification rules</p>
              <p className="text-gray-500 mb-6">Create rules to trigger notifications</p>
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
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold">{rule.name}</h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            rule.enabled ? 'bg-green-600' : 'bg-gray-600'
                          }`}
                        >
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-gray-400 mb-2">{rule.description}</p>
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
                          <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                            +{rule.event_types.length - 3} more
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 text-xs text-gray-400">
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
            <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
              <p className="text-gray-400">No notification history yet</p>
            </div>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-750">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Rule
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Event
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        VM
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Channel
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-750">
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {new Date(item.sent_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">{item.rule_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(item.severity)}`}>
                            {item.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{item.vm_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-400">{item.channel}</td>
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

      {/* Placeholder dialogs */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Add Notification Channel</h2>
            <p className="text-gray-400 mb-4">
              Configure email, Slack, webhook, or Teams integration
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateChannel(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Create Notification Rule</h2>
            <p className="text-gray-400 mb-4">
              Configure when and how to send notifications
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreateRule(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
