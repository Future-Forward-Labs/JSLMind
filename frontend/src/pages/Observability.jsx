import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const DEPT_BUDGETS = [
  { label: 'Operations Team', key: 'operations-team', budget: 50000, color: 'bg-emerald-500' },
  { label: 'Finance Team',    key: 'finance-team',    budget: 30000, color: 'bg-blue-500' },
  { label: 'Quality Team',    key: 'quality-team',    budget: 20000, color: 'bg-purple-500' },
]

function useLiteLLMSpend() {
  const [spend, setSpend] = useState({})
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('http://localhost:4000/spend/logs', {
          headers: { Authorization: 'Bearer sk-jsl-master' },
        })
        if (!r.ok) return
        const data = await r.json()
        const map = {}
        for (const entry of data) {
          if (entry.user_id) map[entry.user_id] = (map[entry.user_id] || 0) + (entry.spend || 0)
        }
        setSpend(map)
      } catch (_) {}
    }
    fetch_()
    const t = setInterval(fetch_, 60000)
    return () => clearInterval(t)
  }, [])
  return spend
}

function useLangfuseTraces() {
  const [traces, setTraces] = useState([])
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('http://localhost:3002/api/public/traces?limit=5', {
          headers: { Authorization: 'Basic ' + btoa('pk-lf-placeholder:sk-lf-placeholder') },
        })
        if (!r.ok) return
        const d = await r.json()
        setTraces(d?.data || [])
      } catch (_) {}
    }
    fetch_()
    const t = setInterval(fetch_, 60000)
    return () => clearInterval(t)
  }, [])
  return traces
}

export default function Observability() {
  const spend  = useLiteLLMSpend()
  const traces = useLangfuseTraces()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Observability</h1>
          <p className="text-sm text-gray-500">Token budgets · LLM traces · Infrastructure metrics</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LaunchButton href="http://localhost:3002" label="Langfuse" />
          <LaunchButton href="http://localhost:3001" label="Grafana" />
          <LaunchButton href="http://localhost:9090" label="Prometheus" />
          <LaunchButton href="http://localhost:4000/ui" label="LiteLLM UI" />
        </div>
      </div>

      {/* Token budgets */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Department Token Budgets — This Month
        </div>
        {DEPT_BUDGETS.map(d => {
          const used = spend[d.key] || 0
          const pct  = Math.min(100, (used / d.budget) * 100)
          return (
            <div key={d.key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">{d.label}</span>
                <span className="text-gray-400 font-mono">
                  ₹{Math.round(used).toLocaleString('en-IN')}
                  <span className="text-gray-600"> / ₹{d.budget.toLocaleString('en-IN')}</span>
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${d.color} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent traces */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Recent LLM Traces
        </div>
        {traces.length === 0 ? (
          <p className="text-xs text-gray-600">
            No traces yet — or Langfuse API key not set in frontend env.{' '}
            <a href="http://localhost:3002" target="_blank" rel="noreferrer"
               className="text-jsl-steel hover:text-white">View in Langfuse ↗</a>
          </p>
        ) : (
          <div className="space-y-2">
            {traces.map(t => (
              <div key={t.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800 last:border-0">
                <span className="text-gray-300 truncate flex-1">{t.name || t.id?.slice(0, 12)}</span>
                <span className="text-gray-500 mx-3">{t.model || '—'}</span>
                <span className="text-gray-600 mx-3">{t.latency ? `${t.latency}ms` : '—'}</span>
                <span className={`font-medium ${t.level === 'ERROR' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {t.level || 'OK'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
