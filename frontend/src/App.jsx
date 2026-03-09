import { Routes, Route } from 'react-router-dom'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import HybridRAG from './pages/HybridRAG.jsx'
import AgentCatalog from './pages/AgentCatalog.jsx'
import Observability from './pages/Observability.jsx'

export default function App() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-950 p-6">
          <Routes>
            <Route path="/"        element={<Overview />} />
            <Route path="/rag"     element={<HybridRAG />} />
            <Route path="/catalog" element={<AgentCatalog />} />
            <Route path="/observe" element={<Observability />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
