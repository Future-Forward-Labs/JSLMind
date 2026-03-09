import { useEffect, useState } from 'react'

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
