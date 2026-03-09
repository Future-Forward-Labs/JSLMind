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
