import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './contexts/ToastContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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
import Datacenters from './pages/Datacenters'
import ResourcePools from './pages/ResourcePools'
import DRS from './pages/DRS'
import DistributedStorage from './pages/DistributedStorage'
import Encryption from './pages/Encryption'

import FaultTolerance from './pages/FaultTolerance'
import Replication from './pages/Replication'
import SiteRecovery from './pages/SiteRecovery'
import ContentLibrary from './pages/ContentLibrary'
import LifecycleManager from './pages/LifecycleManager'
import Certificates from './pages/Certificates'
import Snapshots from './pages/Snapshots'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import { ReactNode } from 'react'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <ProtectedRoute>
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
                  <Route path="/datacenters" element={<Datacenters />} />
                  <Route path="/resource-pools" element={<ResourcePools />} />
                  <Route path="/drs" element={<DRS />} />
                  <Route path="/distributed-storage" element={<DistributedStorage />} />
                  <Route path="/encryption" element={<Encryption />} />

                  <Route path="/fault-tolerance" element={<FaultTolerance />} />
                  <Route path="/replication" element={<Replication />} />
                  <Route path="/site-recovery" element={<SiteRecovery />} />
                  <Route path="/snapshots" element={<Snapshots />} />
                  <Route path="/content-library" element={<ContentLibrary />} />
                  <Route path="/lifecycle" element={<LifecycleManager />} />
                  <Route path="/certificates" element={<Certificates />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </ErrorBoundary>
            </main>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <WebSocketProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </WebSocketProvider>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
