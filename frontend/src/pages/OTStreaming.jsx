import { useEffect, useState } from 'react'

const BACKEND  = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'
const GRAFANA  = 'http://localhost:3001/d/jsl-ot-sensors'
const EQUIPMENT = ['CRM-1', 'APL-1', 'CCM-1']

const EQUIPMENT_META = {
  'CRM-1': 'Cold Rolling Mill #1',
  'APL-1': 'Annealing & Pickling Line #1',
  'CCM-1': 'Continuous Casting Machine #1',
}

export default function OTStreaming() {
  const [readings, setReadings]     = useState({})
  const [alerts, setAlerts]         = useState([])
  const [target, setTarget]         = useState('CRM-1')
  const [injecting, setInjecting]   = useState(false)

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/ot/latest`)
        if (res.ok) setReadings(await res.json())
      } catch (_) {}
    }, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(`${BACKEND.replace('http', 'ws')}/ot/alerts`)
    ws.onmessage = e => setAlerts(prev => [JSON.parse(e.data), ...prev].slice(0, 30))
    return () => ws.close()
  }, [])

  const injectAnomaly = async () => {
    setInjecting(true)
    try {
      await fetch(`http://localhost:8099/inject-anomaly?equipment=${target}`, { method: 'POST' })
    } catch (_) {}
    setTimeout(() => setInjecting(false), 3000)
  }

  // Group readings by equipment
  const byEquipment = {}
  Object.entries(readings).forEach(([key, r]) => {
    const eq = r.equipment_id
    if (!byEquipment[eq]) byEquipment[eq] = []
    byEquipment[eq].push({ tag: key, ...r })
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">OT / CBM Streaming</h1>
          <p className="text-sm text-gray-400 mt-1">
            MQTT → Camel → RedPanda → Kafka Streams → TimescaleDB → Temporal CBMWorkflow
          </p>
        </div>
        <a href={GRAFANA} target="_blank" rel="noreferrer"
           className="text-xs text-jsl-steel hover:underline mt-1">
          Open Grafana dashboard ↗
        </a>
      </div>

      {/* Simulate failure */}
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded px-4 py-3">
        <span className="text-sm text-gray-400">Inject anomaly on:</span>
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700"
        >
          {EQUIPMENT.map(eq => (
            <option key={eq} value={eq}>{eq} — {EQUIPMENT_META[eq]}</option>
          ))}
        </select>
        <button
          onClick={injectAnomaly}
          disabled={injecting}
          className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
        >
          {injecting ? 'Anomaly Active (30s)…' : 'Simulate Failure'}
        </button>
      </div>

      {/* Live readings per equipment */}
      {EQUIPMENT.map(eq => (
        <div key={eq} className="bg-gray-900 rounded border border-gray-800 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {eq} — {EQUIPMENT_META[eq]}
            </span>
            <span className="text-xs text-gray-600">{byEquipment[eq]?.length ?? 0} tags</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs border-b border-gray-800">
                <th className="text-left px-4 py-2">Tag</th>
                <th className="text-right px-4 py-2">Value</th>
                <th className="text-right px-4 py-2">Unit</th>
                <th className="text-right px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(byEquipment[eq] ?? []).map(r => (
                <tr key={r.tag} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-2 text-gray-300 font-mono text-xs">{r.tag}</td>
                  <td className="px-4 py-2 text-right text-white font-mono">{r.value.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-gray-500 text-xs">{r.unit}</td>
                  <td className="px-4 py-2 text-right text-gray-600 text-xs">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {!byEquipment[eq] && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-600 text-xs">Waiting for data…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {/* Anomaly alert feed */}
      <div className="bg-gray-900 rounded border border-gray-800 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Anomaly Alerts — Temporal CBMWorkflow
          </span>
        </div>
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-gray-600 text-sm text-center">
            No anomalies detected. Click "Simulate Failure" to trigger one.
          </p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {alerts.map((a, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-3">
                <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">
                    <span className="font-medium">{a.equipment_id}</span> / {a.tag}
                    {' '}— value <span className="font-mono">{Number(a.value).toFixed(2)}</span>
                    {' '}(z={Number(a.z_score).toFixed(1)}σ)
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    CBMWorkflow: <span className="font-mono text-gray-400">{a.workflow_id ?? '—'}</span>
                    {' '}· {new Date(a.detected_at).toLocaleTimeString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
