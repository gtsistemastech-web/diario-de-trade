export function fmtBRL(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value < 0 ? `-R$ ${formatted}` : `R$ ${formatted}`
}

export function fmtUSD(value: number): string {
  const abs = Math.abs(value)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value < 0 ? `-$${formatted}` : `$${formatted}`
}

export function fmtNum(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function fmtDateLong(iso: string): string {
  if (!iso) return '—'
  const dt = new Date(`${iso}T12:00:00`)
  if (isNaN(dt.getTime())) return iso
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export function todayISO(): string {
  const dt = new Date()
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function pnlClass(value: number): string {
  if (value > 0) return 'text-up'
  if (value < 0) return 'text-down'
  return 'text-text-secondary'
}

export function pnlBgClass(value: number): string {
  if (value > 0) return 'bg-up/10 text-up'
  if (value < 0) return 'bg-down/10 text-down'
  return 'bg-surface-2 text-text-secondary'
}
