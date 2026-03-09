# Demo Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Vite + React + Tailwind single-page app served by nginx on port 3000 that acts as a single pane of glass for the JSLMind client demo.

**Architecture:** Static React SPA built by Vite, served by nginx:alpine. No backend — all live data fetched directly from existing service APIs (LiteLLM, Backstage, Qdrant, Langfuse, RAG service, Camel). Four active pillar pages (Overview, RAG, Catalog, Observability) + three greyed Coming Soon entries for future phases.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, React Router 6, recharts (for future Phase 5 charts, added now), nginx:alpine, Docker multi-stage build.

---

## Task 1: Scaffold Vite + React + Tailwind project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css`

**Step 1: Create `frontend/package.json`**

```json
{
  "name": "jslmind-demo-shell",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.1"
  }
}
```

**Step 2: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
```

**Step 3: Create `frontend/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        jsl: {
          blue: '#1a3a5c',
          steel: '#4a7fa5',
          light: '#e8f0f7',
        },
      },
    },
  },
  plugins: [],
}
```

**Step 4: Create `frontend/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 5: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JSLMind — Enterprise AI Platform</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**Step 6: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-950 text-gray-100 font-sans;
}
```

**Step 7: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
```

**Step 8: Install dependencies and verify dev server starts**

```bash
cd frontend
npm install
npm run dev
# Expected: Vite dev server on http://localhost:5173 — blank page, no errors
```

**Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite + React + Tailwind for demo shell"
```

---

## Task 2: Layout shell — App, TopBar, Sidebar

**Files:**
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/components/TopBar.jsx`
- Create: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/components/LaunchButton.jsx`

**Step 1: Create `frontend/src/components/LaunchButton.jsx`**

```jsx
export default function LaunchButton({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                 bg-jsl-blue hover:bg-jsl-steel text-white rounded transition-colors"
    >
      ↗ {label}
    </a>
  )
}
```

**Step 2: Create `frontend/src/components/TopBar.jsx`**

```jsx
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
          headers: { Authorization: 'Bearer sk-jsl-master' },
        })
        if (!r.ok) return
        const data = await r.json()
        // data is array of {user_id, spend}; sum per virtual key tag
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

  // pulse animation toggle
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
```

**Step 3: Create `frontend/src/components/Sidebar.jsx`**

```jsx
import { NavLink } from 'react-router-dom'

const ACTIVE_PILLARS = [
  { to: '/',         label: 'Overview',      icon: '⬡' },
  { to: '/rag',      label: 'Hybrid RAG',    icon: '◈' },
  { to: '/catalog',  label: 'Agent Catalog', icon: '◉' },
  { to: '/observe',  label: 'Observability', icon: '◎' },
]

const COMING_SOON = [
  { label: 'Medallion Pipeline', phase: 4 },
  { label: 'OT / CBM Streaming', phase: 5 },
  { label: 'Agent Builder',      phase: 7 },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
    isActive
      ? 'bg-jsl-steel text-white font-medium'
      : 'text-gray-400 hover:text-white hover:bg-gray-800'
  }`

export default function Sidebar() {
  return (
    <nav className="w-44 bg-gray-900 flex flex-col py-4 shrink-0 border-r border-gray-800">
      <div className="px-3 mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Demo Pillars</span>
      </div>
      {ACTIVE_PILLARS.map(p => (
        <NavLink key={p.to} to={p.to} end={p.to === '/'} className={linkClass}>
          <span className="text-jsl-steel">{p.icon}</span>
          {p.label}
        </NavLink>
      ))}

      <div className="px-3 mt-6 mb-3">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Coming Soon</span>
      </div>
      {COMING_SOON.map(p => (
        <div key={p.label} className="flex items-center justify-between px-3 py-2 text-sm text-gray-600 cursor-default">
          <span>{p.label}</span>
          <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">P{p.phase}</span>
        </div>
      ))}
    </nav>
  )
}
```

**Step 4: Create `frontend/src/App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom'
import TopBar from './components/TopBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import HybridRAG from './pages/HybridRAG.jsx'
import AgentCatalog from './pages/AgentCatalog.jsx'
import Observability from './pages/Observability.jsx'

// Placeholder for pages not yet created
const ComingSoon = ({ name }) => (
  <div className="flex items-center justify-center h-full text-gray-500 text-lg">{name} — coming soon</div>
)

export default function App() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-gray-950 p-6">
          <Routes>
            <Route path="/"        element={<Overview />} />
            <Route path="/rag"     element={<HybridRAG />} />
            <Route path="/catalog" element={<AgentCatalog />} />
            <Route path="/observe" element={<Observability />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
```

**Step 5: Verify layout renders in dev server**

```bash
npm run dev
# Open http://localhost:5173
# Expected: dark layout, top bar with JSLMind, sidebar with 4 nav items + 3 coming-soon
# No console errors
```

**Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: add demo shell layout — TopBar, Sidebar, App router"
```

---

## Task 3: Overview page

**Files:**
- Create: `frontend/src/pages/Overview.jsx`
- Create: `frontend/src/components/ServiceCard.jsx`

**Step 1: Create `frontend/src/components/ServiceCard.jsx`**

```jsx
export default function ServiceCard({ name, url, port, healthUrl }) {
  const [status, setStatus] = useState('checking')
  const [latency, setLatency] = useState(null)

  useEffect(() => {
    const check = async () => {
      const t0 = Date.now()
      try {
        await fetch(healthUrl, { signal: AbortSignal.timeout(3000) })
        setStatus('up')
        setLatency(Date.now() - t0)
      } catch (_) {
        setStatus('down')
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [healthUrl])

  const dot = { up: 'bg-emerald-400', down: 'bg-red-500', checking: 'bg-yellow-400 animate-pulse' }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-white">{name}</span>
        <span className={`w-2.5 h-2.5 rounded-full ${dot[status]}`} />
      </div>
      <div className="text-xs text-gray-500">:{port}</div>
      {latency && <div className="text-xs text-gray-600">{latency}ms</div>}
      <a href={url} target="_blank" rel="noreferrer"
         className="text-xs text-jsl-steel hover:text-white transition-colors mt-1">
        Open ↗
      </a>
    </div>
  )
}
```

**Step 2: Add missing import to ServiceCard.jsx**

Add at top of file:
```jsx
import { useEffect, useState } from 'react'
```

**Step 3: Create `frontend/src/pages/Overview.jsx`**

```jsx
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
  const [stats, setStats] = useState({ vectors: '—', agents: '—', traces: '—' })

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [vRes, aRes] = await Promise.allSettled([
          fetch('http://localhost:6333/collections/jsl_docs'),
          fetch('http://localhost:7007/api/catalog/entities'),
        ])
        const next = { ...stats }
        if (vRes.status === 'fulfilled') {
          const d = await vRes.value.json()
          next.vectors = d?.result?.points_count ?? '—'
        }
        if (aRes.status === 'fulfilled') {
          const d = await aRes.value.json()
          next.agents = d?.length ?? '—'
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
```

**Step 4: Verify Overview page in dev server**

```bash
# Open http://localhost:5173/
# Expected: 3 stat cards at top, grid of service health cards with green/red dots
```

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Overview page with service health grid and quick stats"
```

---

## Task 4: Hybrid RAG page

**Files:**
- Create: `frontend/src/pages/HybridRAG.jsx`

**Step 1: Create `frontend/src/pages/HybridRAG.jsx`**

```jsx
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
```

**Step 2: Verify in dev server**

```bash
# Open http://localhost:5173/rag
# Expected: stats bar, query input, suggested query chips
# Click a chip → it populates the input
# Click Ask → answer + citations appear
```

**Step 3: Commit**

```bash
git add frontend/src/pages/HybridRAG.jsx
git commit -m "feat: add Hybrid RAG page with live query widget and citations"
```

---

## Task 5: Agent Catalog page

**Files:**
- Create: `frontend/src/pages/AgentCatalog.jsx`

**Step 1: Create `frontend/src/pages/AgentCatalog.jsx`**

```jsx
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
```

**Step 2: Verify in dev server**

```bash
# Open http://localhost:5173/catalog
# Expected: grid of entity cards, click one → side drawer opens with metadata
```

**Step 3: Commit**

```bash
git add frontend/src/pages/AgentCatalog.jsx
git commit -m "feat: add Agent Catalog page with live Backstage entities and side drawer"
```

---

## Task 6: Observability page

**Files:**
- Create: `frontend/src/pages/Observability.jsx`

**Step 1: Create `frontend/src/pages/Observability.jsx`**

```jsx
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
```

**Step 2: Verify in dev server**

```bash
# Open http://localhost:5173/observe
# Expected: dept budget bars, recent traces section, 4 launch buttons
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Observability.jsx
git commit -m "feat: add Observability page with token budgets and LLM traces"
```

---

## Task 7: Dockerfile + nginx + docker-compose

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `frontend/.dockerignore`
- Modify: `docker-compose.yml` — add `frontend` service

**Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|svg|ico)$ {
        expires 1d;
        add_header Cache-Control "public";
    }
}
```

**Step 2: Create `frontend/Dockerfile`**

```dockerfile
# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2: serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Step 3: Create `frontend/.dockerignore`**

```
node_modules/
dist/
.git/
```

**Step 4: Verify Docker build**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind/frontend
docker build -t jslmind-frontend:local .
# Expected: BUILD successful, image created
```

**Step 5: Add frontend service to `docker-compose.yml`**

Find the `# ─── Phase 8` section (or add before the networks block) and add:

```yaml
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    networks: [jslmind]
    restart: unless-stopped
```

**Step 6: Verify compose config**

```bash
docker compose config --quiet && echo "compose config OK"
```

**Step 7: Start container and verify**

```bash
docker compose up -d frontend
# Open http://localhost:3000
# Expected: full demo shell — layout, all 4 pages functional
```

**Step 8: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf frontend/.dockerignore docker-compose.yml
git commit -m "feat: add frontend Dockerfile + nginx, wire into docker-compose on port 3000"
```

---

## Task 8: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add frontend to Phase 8 credentials table**

In the `### Phase 8 — Unified UI` section, the table should include:
```
| **JSLMind Demo Shell** | http://localhost:3000 | — | — (open) |
```

**Step 2: Add frontend to Starting Services section**

The Phase 8 line becomes:
```bash
# ── Phase 8 — Unified UI ──────────────────────────────────────────────────────
docker compose up -d frontend
# Open http://localhost:3000 — demo shell active
```

**Step 3: Add Phase Update Protocol note**

After the Phase 6 first-time setup section, add:

```markdown
### Demo Shell — Adding a New Phase

When a phase is completed, update the demo shell:
1. Create `frontend/src/pages/<PhaseName>.jsx`
2. Flip sidebar entry from "coming soon" to active in `frontend/src/components/Sidebar.jsx`
3. Rebuild: `docker compose up -d --build frontend`
```

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add demo shell setup and phase update protocol to README"
```

---

## Verification

```bash
# All 4 pages load without console errors
open http://localhost:3000          # Overview — health cards
open http://localhost:3000/rag      # Hybrid RAG — query widget
open http://localhost:3000/catalog  # Agent Catalog — entity cards
open http://localhost:3000/observe  # Observability — budgets + traces

# Live query test
# Go to /rag, type "pickling line acid bath temperature", click Ask
# Expected: answer with source citations from JSL documents

# Docker container runs cleanly
docker compose ps frontend
# Expected: Up, port 3000->80
```
