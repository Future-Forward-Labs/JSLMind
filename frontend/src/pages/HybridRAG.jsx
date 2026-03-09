import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

function useQdrantStats() {
  const [stats, setStats] = useState({ points: '—', status: '—' })
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('http://localhost:6333/collections/jsl_docs')
        const d = await r.json()
        setStats({
          points: d?.result?.points_count ?? '—',
          status: d?.result?.status ?? '—',
        })
      } catch (_) {}
    }
    fetch_()
    const t = setInterval(fetch_, 30000)
    return () => clearInterval(t)
  }, [])
  return stats
}

export default function HybridRAG() {
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)
  const qdrant = useQdrantStats()

  const ask = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await fetch('http://localhost:8001/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), top_k: 5 }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Hybrid RAG</h1>
          <p className="text-sm text-gray-500">Dense (BGE-M3/Qdrant) + Sparse (BM25) · Reciprocal Rank Fusion</p>
        </div>
        <div className="flex gap-2">
          <LaunchButton href="http://localhost:6333/dashboard" label="Qdrant Dashboard" />
          <LaunchButton href="http://localhost:3002"           label="Langfuse Traces" />
          <LaunchButton href="http://localhost:8001/docs"      label="API Docs" />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Vectors Indexed', value: qdrant.points },
          { label: 'Collection Status', value: qdrant.status },
          { label: 'Retrieval Strategy', value: 'RRF Fusion' },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-jsl-steel">{s.value}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Query box */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        <label className="text-sm font-medium text-gray-300">Ask a question about JSL documents</label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white
                       placeholder-gray-500 focus:outline-none focus:border-jsl-steel"
            placeholder="e.g. What is the max carbon content for Grade 316L?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
          />
          <button
            onClick={ask}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-jsl-blue hover:bg-jsl-steel disabled:opacity-40
                       text-white text-sm font-medium rounded transition-colors"
          >
            {loading ? 'Asking…' : 'Ask'}
          </button>
        </div>

        {/* Suggested queries */}
        <div className="flex flex-wrap gap-2">
          {[
            'Max carbon content for Grade 316L?',
            'Pickling line acid bath temperature?',
            'Rolling mill bearing replacement schedule?',
            'Grade 304 surface finish requirements?',
          ].map(q => (
            <button
              key={q}
              onClick={() => { setQuery(q); }}
              className="text-xs text-gray-500 hover:text-gray-300 bg-gray-800 hover:bg-gray-700
                         px-2 py-1 rounded transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
          Error: {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-jsl-steel/30 rounded-lg p-4">
            <div className="text-xs font-semibold text-jsl-steel uppercase tracking-wider mb-2">Answer</div>
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{result.answer}</div>
          </div>

          {result.sources?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Sources ({result.sources.length})
              </div>
              <div className="space-y-2">
                {result.sources.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <span className="text-jsl-steel font-mono shrink-0">#{i + 1}</span>
                    <div>
                      <span className="text-gray-300 font-medium">{s.doc || 'unknown'}</span>
                      <span className="text-gray-600 mx-1">·</span>
                      <span className="text-gray-500">{s.section}</span>
                      <span className="text-gray-600 mx-1">·</span>
                      <span className="text-gray-600">score {s.score?.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.retrieval_debug && (
            <div className="text-xs text-gray-600 flex gap-4">
              <span>Dense hits: {result.retrieval_debug.dense_hits}</span>
              <span>Sparse hits: {result.retrieval_debug.sparse_hits}</span>
              <span>RRF merged: {result.retrieval_debug.rrf_merged}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
