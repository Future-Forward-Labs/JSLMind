import ServiceCard from '../components/ServiceCard.jsx'
import { useEffect, useState } from 'react'

const SERVICES = [
  { name: 'RAG Service',     port: 8001, url: 'http://localhost:8001/docs',      healthUrl: 'http://localhost:8001/health' },
  { name: 'Qdrant',          port: 6333, url: 'http://localhost:6333/dashboard', healthUrl: 'http://localhost:6333/healthz' },
  { name: 'Camel',           port: 8090, url: 'http://localhost:8090/actuator',  healthUrl: 'http://localhost:8090/actuator/health' },
  { name: 'Backstage',       port: 7007, url: 'http://localhost:7007',           healthUrl: 'http://localhost:7007/healthcheck' },
  { name: 'LiteLLM',         port: 4000, url: 'http://localhost:4000/ui',        healthUrl: 'http://localhost:4000/health' },
  { name: 'Langfuse',        port: 3002, url: 'http://localhost:3002',           healthUrl: 'http://localhost:3002/api/public/health' },
  { name: 'Grafana',         port: 3001, url: 'http://localhost:3001',           healthUrl: 'http://localhost:3001/api/health' },
  { name: 'MinIO',           port: 9001, url: 'http://localhost:9001',           healthUrl: 'http://localhost:9000/minio/health/live' },
  { name: 'Kong',            port: 8000, url: 'http://localhost:8002',           healthUrl: 'http://localhost:8002/status' },
  { name: 'Keycloak',        port: 8080, url: 'http://localhost:8080/admin',     healthUrl: 'http://localhost:8080/health' },
]

function useQuickStats() {
  const [stats, setStats] = useState({ vectors: '—', agents: '—' })

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [vRes, aRes] = await Promise.allSettled([
          fetch('http://localhost:6333/collections/jsl_docs'),
          fetch('http://localhost:7007/api/catalog/entities'),
        ])
        const next = {}
        if (vRes.status === 'fulfilled') {
          const d = await vRes.value.json()
          next.vectors = d?.result?.points_count ?? '—'
        } else {
          next.vectors = '—'
        }
        if (aRes.status === 'fulfilled') {
          const d = await aRes.value.json()
          next.agents = d?.length ?? '—'
        } else {
          next.agents = '—'
        }
        setStats(next)
      } catch (_) {}
    }
    fetch_()
  }, [])

  return stats
}

export default function Overview() {
  const stats = useQuickStats()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-1">Platform Overview</h1>
        <p className="text-sm text-gray-500">JSLMind — On-Premise Enterprise AI Platform</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Vectors Indexed', value: stats.vectors },
          { label: 'Catalog Entities', value: stats.agents },
          { label: 'Active Services', value: SERVICES.length },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-jsl-steel">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Service health grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Service Health</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SERVICES.map(s => (
            <ServiceCard key={s.name} {...s} />
          ))}
        </div>
      </div>
    </div>
  )
}
