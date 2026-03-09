import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const DAGS = ['sap_ingest', 'medallion_transform', 'data_quality']
const AIRFLOW_AUTH = 'Basic ' + btoa('admin:admin')

function useAirflowDags() {
  const [dags, setDags] = useState({})
  useEffect(() => {
    const fetch_ = async () => {
      const results = {}
      for (const dag of DAGS) {
        try {
          const [dagRes, runRes] = await Promise.all([
            fetch(`http://localhost:8085/api/v1/dags/${dag}`, {
              headers: { Authorization: AIRFLOW_AUTH },
            }),
            fetch(
              `http://localhost:8085/api/v1/dags/${dag}/dagRuns?limit=1&order_by=-execution_date`,
              { headers: { Authorization: AIRFLOW_AUTH } }
            ),
          ])
          const d = await dagRes.json()
          const runData = await runRes.json()
          const lastRun = runData.dag_runs?.[0]
          results[dag] = {
            paused: d.is_paused,
            state: lastRun?.state ?? 'no runs',
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

function useMinioHealth() {
  const [status, setStatus] = useState('checking')
  useEffect(() => {
    fetch('http://localhost:9000/minio/health/live')
      .then(() => setStatus('live'))
      .catch(() => setStatus('offline'))
  }, [])
  return status
}

const stateColor = (state) => {
  if (state === 'success') return 'text-green-400'
  if (state === 'running') return 'text-yellow-400'
  if (state === 'failed')  return 'text-red-400'
  return 'text-gray-500'
}

export default function MedallionPipeline() {
  const dags  = useAirflowDags()
  const minio = useMinioHealth()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Medallion Pipeline</h1>
          <p className="text-sm text-gray-500">
            Camel extracts SAP MM data → MinIO Bronze → Airflow + dbt → Silver → Gold
          </p>
        </div>
        <div className="flex gap-2">
          <LaunchButton href="http://localhost:8085" label="Airflow UI" />
          <LaunchButton href="http://localhost:5000" label="Marquez" />
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

      {/* MinIO status */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">MinIO Object Store</span>
          <span className={`text-xs font-mono ${minio === 'live' ? 'text-green-400' : minio === 'checking' ? 'text-yellow-400' : 'text-red-400'}`}>
            {minio === 'live' ? '● live' : minio === 'checking' ? '● checking' : '● offline'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Bronze',   bucket: 'bronze-sap-mm', color: 'text-amber-400' },
            { label: 'Silver',   bucket: 'silver',        color: 'text-gray-300' },
            { label: 'Gold',     bucket: 'gold',          color: 'text-yellow-400' },
            { label: 'Platinum', bucket: 'platinum',      color: 'text-blue-400' },
          ].map(({ label, bucket, color }) => (
            <div key={bucket} className="bg-gray-800 rounded p-3 text-center">
              <div className={`text-sm font-semibold ${color}`}>{label}</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">{bucket}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Airflow DAGs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-300 mb-3">Airflow DAGs</div>
        <div className="space-y-2">
          {DAGS.map(dag => {
            const info = dags[dag] ?? {}
            return (
              <div key={dag} className="flex items-center justify-between text-sm py-1 border-b border-gray-800 last:border-0">
                <span className="font-mono text-gray-400">{dag}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-600">{info.lastRun ?? '—'}</span>
                  <span className={`text-xs font-semibold w-20 text-right ${stateColor(info.state)}`}>
                    {info.state ?? '…'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gold metrics — static demo values */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-300 mb-3">Gold Layer — Latest Run</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-yellow-400">₹5.84L</div>
            <div className="text-xs text-gray-500 mt-1">Total PO Cost (Grade 304)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">98.7%</div>
            <div className="text-xs text-gray-500 mt-1">Quality Pass Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">2,150 MT</div>
            <div className="text-xs text-gray-500 mt-1">On-Order Inventory</div>
          </div>
        </div>
      </div>
    </div>
  )
}
