import { useEffect, useState } from 'react'
import { listVMs, VM } from '../api/vm'
import { Search, X, Tag, Layers, Monitor } from 'lucide-react'
import VMCard from '../components/VMCard'
import { getTagColor } from '../components/TagEditor'
import { PageHeader, EmptyState } from '../components/ui'

export default function VMList() {
  const [vms, setVMs] = useState<VM[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [groupByTags, setGroupByTags] = useState(false)

  useEffect(() => {
    loadVMs()
  }, [])

  const loadVMs = async () => {
    try {
      const data = await listVMs()
      setVMs(data)
    } catch (error) {
      console.error('Failed to load VMs:', error)
    } finally {
      setLoading(false)
    }
  }

  // Get all unique tags across all VMs
  const allTags = Array.from(
    new Set(vms.flatMap((vm) => vm.tags || []))
  ).sort()

  // Filter VMs by search query and selected tags
  const filteredVMs = vms.filter((vm) => {
    const matchesSearch =
      vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vm.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vm.tags && vm.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))

    const matchesTags =
      selectedTags.length === 0 ||
      (vm.tags && selectedTags.every(tag => vm.tags!.includes(tag)))

    return matchesSearch && matchesTags
  })

  // Group VMs by tags if grouping is enabled
  const groupedVMs: Record<string, VM[]> = {}
  if (groupByTags) {
    filteredVMs.forEach((vm) => {
      if (vm.tags && vm.tags.length > 0) {
        vm.tags.forEach((tag) => {
          if (!groupedVMs[tag]) {
            groupedVMs[tag] = []
          }
          groupedVMs[tag].push(vm)
        })
      } else {
        if (!groupedVMs['Untagged']) {
          groupedVMs['Untagged'] = []
        }
        groupedVMs['Untagged'].push(vm)
      }
    })
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const clearTags = () => {
    setSelectedTags([])
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div>
      <PageHeader
        title="Virtual Machines"
        actions={
          <div className="flex items-center gap-4">
            <button
              onClick={() => setGroupByTags(!groupByTags)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
                groupByTags
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              Group by Tags
            </button>
            <div className="text-sm text-gray-400">
              {filteredVMs.length} of {vms.length} VMs
            </div>
          </div>
        }
      />

      {/* Search Bar */}
      {vms.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search VMs by name, image, state, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 pl-10 pr-10 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="mb-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium">Filter by Tags</span>
            </div>
            {selectedTags.length > 0 && (
              <button
                onClick={clearTags}
                className="text-xs text-blue-500 hover:text-blue-400 transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const isSelected = selectedTags.includes(tag)
              const vmCount = vms.filter((vm) => vm.tags?.includes(tag)).length
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                    isSelected
                      ? getTagColor(tag)
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tag} ({vmCount})
                </button>
              )
            })}
          </div>
          {selectedTags.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <span className="text-xs text-gray-400">
                Filtering by: {selectedTags.join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {vms.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <EmptyState
            icon={<Monitor className="w-16 h-16" />}
            title="No VMs found"
            description="Create your first virtual machine to get started"
          />
        </div>
      ) : filteredVMs.length === 0 ? (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <EmptyState
            icon={<Search className="w-16 h-16" />}
            title="No matching VMs"
            description="Try adjusting your search query or tag filters"
          />
        </div>
      ) : groupByTags ? (
        <div className="space-y-8">
          {Object.entries(groupedVMs).map(([tag, vmsInGroup]) => (
            <div key={tag}>
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-4 py-2 rounded-full text-sm font-medium ${getTagColor(tag)}`}>
                  {tag}
                </span>
                <span className="text-sm text-gray-400">
                  {vmsInGroup.length} {vmsInGroup.length === 1 ? 'VM' : 'VMs'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vmsInGroup.map((vm) => (
                  <VMCard key={`${tag}-${vm.name}`} vm={vm} onUpdate={loadVMs} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVMs.map((vm) => (
            <VMCard key={vm.name} vm={vm} onUpdate={loadVMs} />
          ))}
        </div>
      )}
    </div>
  )
}
