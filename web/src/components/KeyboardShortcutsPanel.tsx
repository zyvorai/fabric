import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Keyboard } from 'lucide-react'

interface Shortcut {
  keys: string[]
  description: string
  category: string
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['g', 'd'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['g', 'v'], description: 'Go to VMs', category: 'Navigation' },
  { keys: ['g', 'l'], description: 'Go to Logs', category: 'Navigation' },
  { keys: ['g', 'n'], description: 'Go to Network', category: 'Navigation' },
  { keys: ['g', 's'], description: 'Go to Storage', category: 'Navigation' },
  { keys: ['g', 'c'], description: 'Create new VM', category: 'Navigation' },

  // Search
  { keys: ['/'], description: 'Focus search input', category: 'Search' },
  { keys: ['Esc'], description: 'Clear search / Close dialogs', category: 'Search' },

  // Actions
  { keys: ['r'], description: 'Refresh current page', category: 'Actions' },
  { keys: ['?'], description: 'Show/hide this help', category: 'Actions' },
  { keys: ['Ctrl+K'], description: 'Open command palette', category: 'Actions' },
]

export default function KeyboardShortcutsPanel() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<string[]>([])

  const handleNavigation = useCallback(
    (path: string) => {
      navigate(path)
    },
    [navigate]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Toggle panel with '?'
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
        return
      }

      // Close panel with Escape
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        setIsOpen(false)
        return
      }

      // Handle navigation shortcuts
      setPressedKeys((prev) => {
        const newKeys = [...prev, e.key].slice(-2) // Keep last 2 keys

        // Check for 'g' followed by another key
        if (newKeys.length === 2 && newKeys[0] === 'g') {
          switch (newKeys[1]) {
            case 'd':
              handleNavigation('/')
              return []
            case 'v':
              handleNavigation('/vms')
              return []
            case 'l':
              handleNavigation('/logs')
              return []
            case 'n':
              handleNavigation('/network')
              return []
            case 's':
              handleNavigation('/storage')
              return []
            case 'c':
              handleNavigation('/create')
              return []
          }
        }

        // Single key shortcuts
        if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault()
          const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
          if (searchInput) {
            searchInput.focus()
          }
          return []
        }

        // Clear after 1 second of no input
        setTimeout(() => setPressedKeys([]), 1000)

        return newKeys
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleNavigation])

  if (!isOpen) return null

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-3xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-700 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {categories.map((category) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-lg font-semibold mb-3 text-blue-400">{category}</h3>
              <div className="space-y-2">
                {shortcuts
                  .filter((s) => s.category === category)
                  .map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-700 rounded hover:bg-gray-600 transition"
                    >
                      <span className="text-gray-300">{shortcut.description}</span>
                      <div className="flex items-center gap-2">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            <kbd className="px-3 py-1 bg-gray-900 border border-gray-600 rounded text-sm font-mono text-white shadow-sm">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-gray-500">then</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-750 text-center text-sm text-gray-400">
          Press <kbd className="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs font-mono mx-1">?</kbd> to toggle this panel
        </div>
      </div>
    </div>
  )
}
