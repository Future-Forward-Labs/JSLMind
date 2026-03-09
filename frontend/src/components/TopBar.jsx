import { useEffect, useState } from 'react'

const DEPT_BUDGETS = [
  { name: 'Ops', key: 'operations-team', color: 'text-emerald-400' },
  { name: 'Fin', key: 'finance-team',    color: 'text-blue-400' },
  { name: 'Qual', key: 'quality-team',   color: 'text-purple-400' },
]

export default function TopBar() {
  const [spend, setSpend] = useState({})
  const [pulse, setPulse] = useState(true)

  useEffect(() => {
    const fetchSpend = async () => {
      try {
        const r = await fetch('http://localhost:4000/spend/logs', {
          headers: { Authorization: `Bearer ${import.meta.env.VITE_LITELLM_KEY ?? 'sk-jsl-master'}` },
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
    fetchSpend()
    const t = setInterval(fetchSpend, 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 1500)
    return () => clearInterval(t)
  }, [])

  const fmt = (val) => val ? `₹${Math.round(val).toLocaleString('en-IN')}` : '—'

  return (
    <header className="h-12 bg-jsl-blue flex items-center justify-between px-4 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="font-bold text-white tracking-wide text-sm">JSLMind</span>
        <span className="text-xs text-gray-400">Enterprise AI Platform</span>
        <span className={`w-2 h-2 rounded-full ${pulse ? 'bg-emerald-400' : 'bg-emerald-600'} transition-colors`} title="Live" />
      </div>
      <div className="flex items-center gap-4 text-xs">
        {DEPT_BUDGETS.map(d => (
          <span key={d.key} className="flex items-center gap-1">
            <span className="text-gray-400">{d.name}</span>
            <span className={`font-mono font-medium ${d.color}`}>{fmt(spend[d.key])}</span>
          </span>
        ))}
        <span className="text-gray-500 text-xs">inference this month</span>
      </div>
    </header>
  )
}
