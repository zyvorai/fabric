import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './contexts/ToastContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Navbar from './components/Navbar'
import KeyboardShortcutsPanel from './components/KeyboardShortcutsPanel'
import CommandPalette from './components/CommandPalette'
import Dashboard from './pages/Dashboard'
import VMList from './pages/VMList'
import VMDetails from './pages/VMDetailsEnhanced'
import CreateVM from './pages/CreateVM'
import Console from './pages/Console'
import Logs from './pages/Logs'
import Network from './pages/Network'
import Storage from './pages/Storage'
import Settings from './pages/Settings'
import Templates from './pages/Templates'
import Quotas from './pages/Quotas'
import Schedules from './pages/Schedules'
import AuditLogs from './pages/AuditLogs'
import Analytics from './pages/Analytics'
import Backups from './pages/Backups'
import Notifications from './pages/Notifications'
import StoragePools from './pages/StoragePools'
import SystemResources from './pages/SystemResources'
import NotFound from './pages/NotFound'

function App() {
  return (
    <ToastProvider>
      <WebSocketProvider>
        <BrowserRouter>
        <div className="min-h-screen bg-gray-900 text-white">
          <Navbar />
          <KeyboardShortcutsPanel />
          <CommandPalette />
          <main className="container mx-auto px-4 py-8">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/vms" element={<VMList />} />
                <Route path="/vms/:name" element={<VMDetails />} />
                <Route path="/vms/:name/console" element={<Console />} />
                <Route path="/create" element={<CreateVM />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/network" element={<Network />} />
                <Route path="/storage" element={<Storage />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/quotas" element={<Quotas />} />
                <Route path="/schedules" element={<Schedules />} />
                <Route path="/audit" element={<AuditLogs />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/storage-pools" element={<StoragePools />} />
                <Route path="/system" element={<SystemResources />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
        </BrowserRouter>
      </WebSocketProvider>
    </ToastProvider>
  )
}

export default App
