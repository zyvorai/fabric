import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Suspense, lazy, ReactNode } from 'react'
import { ToastProvider } from './contexts/ToastContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PageErrorBoundary } from './components/ErrorBoundary'
import Navbar from './components/Navbar'
import KeyboardShortcutsPanel from './components/KeyboardShortcutsPanel'
import CommandPalette from './components/CommandPalette'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const VMList = lazy(() => import('./pages/VMList'))
const VMDetails = lazy(() => import('./pages/VMDetails'))
const CreateVM = lazy(() => import('./pages/CreateVM'))
const Console = lazy(() => import('./pages/Console'))
const Logs = lazy(() => import('./pages/Logs'))
const Network = lazy(() => import('./pages/Network'))
const Storage = lazy(() => import('./pages/Storage'))
const Settings = lazy(() => import('./pages/Settings'))
const Templates = lazy(() => import('./pages/Templates'))
const Quotas = lazy(() => import('./pages/Quotas'))
const Schedules = lazy(() => import('./pages/Schedules'))
const AuditLogs = lazy(() => import('./pages/AuditLogs'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Backups = lazy(() => import('./pages/Backups'))
const Notifications = lazy(() => import('./pages/Notifications'))
const StoragePools = lazy(() => import('./pages/StoragePools'))
const SystemResources = lazy(() => import('./pages/SystemResources'))
const Datacenters = lazy(() => import('./pages/Datacenters'))
const ResourcePools = lazy(() => import('./pages/ResourcePools'))
const DRS = lazy(() => import('./pages/DRS'))
const DistributedStorage = lazy(() => import('./pages/DistributedStorage'))
const Encryption = lazy(() => import('./pages/Encryption'))
const FaultTolerance = lazy(() => import('./pages/FaultTolerance'))
const Replication = lazy(() => import('./pages/Replication'))
const SiteRecovery = lazy(() => import('./pages/SiteRecovery'))
const ContentLibrary = lazy(() => import('./pages/ContentLibrary'))
const LifecycleManager = lazy(() => import('./pages/LifecycleManager'))
const Certificates = lazy(() => import('./pages/Certificates'))
const ImageBuilder = lazy(() => import('./pages/ImageBuilder'))
const Machines = lazy(() => import('./pages/Machines'))
const Migrations = lazy(() => import('./pages/Migrations'))
const Profiles = lazy(() => import('./pages/Profiles'))
const Snapshots = lazy(() => import('./pages/Snapshots'))
const NetworkSecurity = lazy(() => import('./pages/NetworkSecurity'))

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
              <PageErrorBoundary>
                <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>}>
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
                  <Route path="/migrations" element={<Migrations />} />
                  <Route path="/machines" element={<Machines />} />
                  <Route path="/image-builder" element={<ImageBuilder />} />
                  <Route path="/profiles" element={<Profiles />} />
                  <Route path="/snapshots" element={<Snapshots />} />
                  <Route path="/content-library" element={<ContentLibrary />} />
                  <Route path="/lifecycle" element={<LifecycleManager />} />
                  <Route path="/certificates" element={<Certificates />} />
                  <Route path="/network-security" element={<NetworkSecurity />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
              </PageErrorBoundary>
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
