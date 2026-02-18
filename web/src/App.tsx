import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import VMList from './pages/VMList'
import VMDetails from './pages/VMDetails'
import CreateVM from './pages/CreateVM'
import Console from './pages/Console'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/vms" element={<VMList />} />
            <Route path="/vms/:name" element={<VMDetails />} />
            <Route path="/vms/:name/console" element={<Console />} />
            <Route path="/create" element={<CreateVM />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
