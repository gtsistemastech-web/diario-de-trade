interface StatCardProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
}

export default function StatCard({ label, value, sub, valueClass = 'text-text' }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`mt-2 font-mono text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-text-secondary">{sub}</div>}
    </div>
  )
}
