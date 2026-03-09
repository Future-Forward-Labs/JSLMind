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
