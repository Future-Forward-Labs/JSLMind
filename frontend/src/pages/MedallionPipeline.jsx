import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const DAGS = ['sap_ingest', 'medallion_transform', 'data_quality']
const AIRFLOW_AUTH = 'Basic ' + btoa('admin:admin')

const BUCKETS = [
  { label: 'Bronze',   bucket: 'bronze-sap-mm', color: 'text-amber-400' },
  { label: 'Silver',   bucket: 'silver',         color: 'text-gray-300' },
  { label: 'Gold',     bucket: 'gold',            color: 'text-yellow-400' },
  { label: 'Platinum', bucket: 'platinum',        color: 'text-blue-400' },
]

function useAirflowDags() {
  const [dags, setDags] = useState({})
  useEffect(() => {
    const fetch_ = async () => {
      const results = {}
      for (const dag of DAGS) {
        try {
          const [dagRes, runRes] = await Promise.all([
            fetch(`/proxy/airflow/api/v1/dags/${dag}`, { headers: { Authorization: AIRFLOW_AUTH } }),
            fetch(`/proxy/airflow/api/v1/dags/${dag}/dagRuns?limit=1&order_by=-execution_date`, { headers: { Authorization: AIRFLOW_AUTH } }),
          ])
          if (!dagRes.ok) throw new Error(dagRes.status)
          const d = await dagRes.json()
          const runData = await runRes.json()
          const lastRun = runData.dag_runs?.[0]
          results[dag] = {
            paused:  d.is_paused,
            state:   lastRun?.state ?? 'no runs',
            lastRun: lastRun?.execution_date?.slice(0, 19).replace('T', ' ') ?? '—',
          }
        } catch (_) {
          results[dag] = { paused: null, state: 'unreachable', lastRun: '—' }
        }
      }
      setDags(results)
    }
    fetch_()
    const t = setInterval(fetch_, 30000)
    return () => clearInterval(t)
  }, [])
  return dags
}

function useMinIOBuckets() {
  const [buckets, setBuckets] = useState({})
  useEffect(() => {
    const fetch_ = async () => {
      // MinIO S3-compatible ListBuckets — no auth needed for health check path
      try {
        const r = await fetch('/proxy/minio/minio/health/live')
        if (!r.ok) { setBuckets({ _offline: true }); return }
        // Bucket existence: probe each bucket's root listing
        const results = {}
        await Promise.all(BUCKETS.map(async ({ bucket }) => {
          try {
            const rb = await fetch(`/proxy/minio/${bucket}/?max-keys=1`)
            results[bucket] = rb.status !== 404
          } catch (_) { results[bucket] = false }
        }))
        setBuckets(results)
      } catch (_) { setBuckets({ _offline: true }) }
    }
    fetch_()
    const t = setInterval(fetch_, 60000)
    return () => clearInterval(t)
  }, [])
  return buckets
}

const stateColor = s => {
  if (s === 'success')     return 'text-emerald-400'
  if (s === 'running')     return 'text-yellow-400'
  if (s === 'failed')      return 'text-red-400'
  if (s === 'unreachable') return 'text-red-500'
  return 'text-gray-500'
}

function useGoldSummary() {
  const [summary, setSummary] = useState(null)
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('/proxy/minio/gold/summary.json')
        if (!r.ok) return
        setSummary(await r.json())
      } catch (_) {}
    }
    fetch_()
    const t = setInterval(fetch_, 60000)
    return () => clearInterval(t)
  }, [])
  return summary
}

function fmtInr(v) {
  if (!v) return '—'
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}

export default function MedallionPipeline() {
  const dags    = useAirflowDags()
  const buckets = useMinIOBuckets()
  const gold    = useGoldSummary()
  const minioOk = !buckets._offline

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Medallion Pipeline</h1>
          <p className="text-sm text-gray-500">
            Camel extracts SAP MM data → MinIO Bronze → Airflow + dbt → Silver → Gold
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LaunchButton href="http://localhost:8085" label="Airflow UI" />
          <LaunchButton href="http://localhost:3003" label="Marquez" />
          <LaunchButton href="http://localhost:9001" label="MinIO Console" />
        </div>
      </div>

      {/* Data flow */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        {['SAP (Camel)', 'MinIO Bronze', 'sap_ingest', 'dbt Silver', 'dbt Gold', 'DuckDB'].map((s, i, arr) => (
          <span key={s} className="flex items-center gap-2">
            <span className="bg-gray-900 border border-gray-800 px-2 py-1 rounded text-gray-300">{s}</span>
            {i < arr.length - 1 && <span className="text-gray-600">→</span>}
          </span>
        ))}
      </div>

      {/* MinIO buckets */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">MinIO Object Store</span>
          <span className={`text-xs font-mono ${minioOk ? 'text-emerald-400' : 'text-red-400'}`}>
            {minioOk ? '● live' : '● offline'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {BUCKETS.map(({ label, bucket, color }) => {
            const exists = buckets[bucket]
            return (
              <div key={bucket} className="bg-gray-800 rounded p-3 text-center">
                <div className={`text-sm font-semibold ${color}`}>{label}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">{bucket}</div>
                <div className={`text-xs mt-2 ${exists === undefined ? 'text-gray-600' : exists ? 'text-emerald-400' : 'text-red-500'}`}>
                  {exists === undefined ? '…' : exists ? '✓ exists' : '✗ missing'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Airflow DAGs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">Airflow DAGs</span>
          {Object.values(dags).every(d => d.state === 'unreachable') && (
            <span className="text-xs text-red-500">Airflow not reachable — run: docker compose up -d airflow-webserver airflow-scheduler</span>
          )}
        </div>
        <div className="space-y-2">
          {DAGS.map(dag => {
            const info = dags[dag] ?? {}
            return (
              <div key={dag} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
                <span className="font-mono text-gray-400">{dag}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-600">{info.lastRun ?? '—'}</span>
                  {info.paused === true && <span className="text-xs text-gray-600 italic">paused</span>}
                  <span className={`text-xs font-semibold w-24 text-right ${stateColor(info.state)}`}>
                    {info.state ?? '…'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gold layer */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">Gold Layer — Latest Run</span>
          <span className="text-xs text-gray-600 italic">
            {gold ? `updated ${gold.updated_at?.slice(0,16).replace('T',' ')} UTC` : 'run medallion_transform to populate'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-yellow-400">
              {gold ? fmtInr(gold.po_cost_grade_304_inr) : '₹5.84L'}
            </div>
            <div className="text-xs text-gray-500 mt-1">Total PO Cost (Grade 304)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">
              {gold ? `${gold.quality_pass_pct}%` : '98.7%'}
            </div>
            <div className="text-xs text-gray-500 mt-1">Quality Pass Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              {gold ? `${Math.round(gold.on_order_qty_mt / 1000).toLocaleString('en-IN')}K MT` : '2,150 MT'}
            </div>
            <div className="text-xs text-gray-500 mt-1">On-Order Inventory (Grade 304)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
