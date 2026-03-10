import { Routes, Route } from 'react-router-dom'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import HybridRAG from './pages/HybridRAG.jsx'
import AgentCatalog from './pages/AgentCatalog.jsx'
import Observability from './pages/Observability.jsx'
import MedallionPipeline from './pages/MedallionPipeline.jsx'
import OTStreaming from './pages/OTStreaming.jsx'

export default function App() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-950 p-6">
          <Routes>
            <Route path="/"          element={<Overview />} />
            <Route path="/ot"        element={<OTStreaming />} />
            <Route path="/rag"       element={<HybridRAG />} />
            <Route path="/catalog"   element={<AgentCatalog />} />
            <Route path="/observe"   element={<Observability />} />
            <Route path="/medallion" element={<MedallionPipeline />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
