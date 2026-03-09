import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const KIND_COLORS = {
  Component: 'bg-blue-900/40 text-blue-300 border-blue-800',
  API:        'bg-purple-900/40 text-purple-300 border-purple-800',
  System:     'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  Domain:     'bg-amber-900/40 text-amber-300 border-amber-800',
  Location:   'bg-gray-800 text-gray-400 border-gray-700',
}

function KindBadge({ kind }) {
  const cls = KIND_COLORS[kind] || KIND_COLORS.Location
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{kind}</span>
  )
}

export default function AgentCatalog() {
  const [entities, setEntities] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('http://localhost:7007/api/catalog/entities')
        setEntities(await r.json())
      } catch (_) {}
      finally { setLoading(false) }
    }
    fetch_()
  }, [])

  return (
    <div className="flex gap-4 h-full">
      {/* Entity list */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Agent Catalog</h1>
            <p className="text-sm text-gray-500">{entities.length} entities registered · powered by Backstage</p>
          </div>
          <LaunchButton href="http://localhost:7007" label="Open Backstage" />
        </div>

        {loading && <p className="text-gray-500 text-sm">Loading catalog…</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entities.map(e => (
            <button
              key={`${e.kind}-${e.metadata?.name}`}
              onClick={() => setSelected(selected?.metadata?.name === e.metadata?.name ? null : e)}
              className={`text-left bg-gray-900 border rounded-lg p-4 transition-colors
                ${selected?.metadata?.name === e.metadata?.name
                  ? 'border-jsl-steel'
                  : 'border-gray-800 hover:border-gray-700'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-medium text-sm text-white">{e.metadata?.name}</span>
                <KindBadge kind={e.kind} />
              </div>
              {e.metadata?.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{e.metadata.description}</p>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {e.spec?.type && (
                  <span className="text-xs text-gray-600">type: {e.spec.type}</span>
                )}
                {e.spec?.lifecycle && (
                  <span className="text-xs text-gray-600">· {e.spec.lifecycle}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Side drawer */}
      {selected && (
        <div className="w-72 bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 shrink-0 overflow-auto">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white text-sm">{selected.metadata?.name}</span>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
          </div>
          <KindBadge kind={selected.kind} />
          {selected.metadata?.description && (
            <p className="text-xs text-gray-400">{selected.metadata.description}</p>
          )}
          <div className="space-y-1 text-xs">
            {Object.entries(selected.spec || {}).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-gray-600 w-20 shrink-0">{k}</span>
                <span className="text-gray-400 break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
          {selected.metadata?.annotations && (
            <div className="space-y-1 text-xs">
              <div className="text-gray-600 font-medium">Annotations</div>
              {Object.entries(selected.metadata.annotations).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-600 w-20 shrink-0 truncate">{k.split('/').pop()}</span>
                  <span className="text-gray-400 break-all">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
