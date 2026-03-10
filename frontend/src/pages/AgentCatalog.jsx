import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const TABS = [
  { id: 'all',          label: 'All',           filter: () => true },
  { id: 'agents',       label: 'Agents',        filter: e => e.spec?.type === 'ai-agent' },
  { id: 'llms',         label: 'LLMs',          filter: e => e.spec?.type === 'foundation-llm' },
  { id: 'models',       label: 'Models',        filter: e => e.spec?.type === 'ml-model' },
  { id: 'embeddings',   label: 'Embeddings',    filter: e => e.spec?.type === 'embedding-model' },
  { id: 'integrations', label: 'Integrations',  filter: e => e.spec?.type === 'integration' },
  { id: 'data',         label: 'Data Products', filter: e => e.spec?.type === 'data-product' },
]

const TYPE_COLORS = {
  'ai-agent':        'bg-blue-900/40 text-blue-300 border-blue-800',
  'foundation-llm':  'bg-violet-900/40 text-violet-300 border-violet-800',
  'ml-model':        'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  'embedding-model': 'bg-cyan-900/40 text-cyan-300 border-cyan-800',
  'integration':     'bg-amber-900/40 text-amber-300 border-amber-800',
  'data-product':    'bg-rose-900/40 text-rose-300 border-rose-800',
  'system':          'bg-gray-800 text-gray-300 border-gray-700',
  'domain':          'bg-gray-800 text-gray-400 border-gray-700',
}

function TypeBadge({ entity }) {
  const label = entity.spec?.type || entity.kind
  const cls = TYPE_COLORS[entity.spec?.type] || TYPE_COLORS['system']
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{label}</span>
  )
}

export default function AgentCatalog() {
  const [entities, setEntities] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('/proxy/backstage/api/catalog/entities')
        setEntities(await r.json())
      } catch (_) {}
      finally { setLoading(false) }
    }
    fetch_()
  }, [])

  const tab = TABS.find(t => t.id === activeTab)
  const visible = entities.filter(tab.filter)

  return (
    <div className="flex gap-4 h-full">
      {/* Main panel */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Catalog</h1>
            <p className="text-sm text-gray-500">{entities.length} entities registered · powered by Backstage</p>
          </div>
          <LaunchButton href="http://localhost:7007" label="Open Backstage" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800 pb-0">
          {TABS.map(t => {
            const count = entities.filter(t.filter).length
            return (
              <button
                key={t.id}
                onClick={() => { setActiveTab(t.id); setSelected(null) }}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors flex items-center gap-1.5
                  ${activeTab === t.id
                    ? 'bg-gray-800 text-white border border-b-gray-800 border-gray-700 -mb-px'
                    : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.id ? 'bg-jsl-steel text-white' : 'bg-gray-800 text-gray-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Cards */}
        {loading && <p className="text-gray-500 text-sm">Loading catalog…</p>}

        {!loading && visible.length === 0 && (
          <p className="text-gray-600 text-sm">No entities in this category.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visible.map(e => (
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
                <TypeBadge entity={e} />
              </div>
              {e.metadata?.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{e.metadata.description}</p>
              )}
              {e.spec?.lifecycle && (
                <span className="text-xs text-gray-600 mt-2 block">{e.spec.lifecycle}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="w-72 bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 shrink-0 overflow-auto">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white text-sm">{selected.metadata?.name}</span>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
          </div>
          <TypeBadge entity={selected} />
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
