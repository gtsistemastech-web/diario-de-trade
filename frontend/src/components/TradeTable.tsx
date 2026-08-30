import { useMemo, useState } from 'react'
import { ArrowDownUp, Pencil, Trash2 } from 'lucide-react'
import type { Trade } from '../types'
import { fmtBRL, fmtDate, pnlClass } from '../utils/format'

type SortKey = 'date' | 'asset' | 'direction' | 'result' | 'r_multiple' | 'strategy'

interface Props {
  trades: Trade[]
  onEdit?: (t: Trade) => void
  onDelete?: (t: Trade) => void
  numbered?: boolean
  compact?: boolean
}

export default function TradeTable({ trades, onEdit, onDelete, numbered, compact }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sorted = useMemo(() => {
    const list = [...trades]
    list.sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortKey === 'date') va = `${a.date}${a.time ?? ''}`
      else if (sortKey === 'asset') va = a.asset
      else if (sortKey === 'direction') va = a.direction
      else if (sortKey === 'r_multiple') va = a.r_multiple ?? -Infinity
      else if (sortKey === 'strategy') va = a.strategy_name ?? ''
      else va = a.result
      vb = sortKey === 'date' ? `${b.date}${b.time ?? ''}`
        : sortKey === 'asset' ? b.asset
        : sortKey === 'direction' ? b.direction
        : sortKey === 'r_multiple' ? (b.r_multiple ?? -Infinity)
        : sortKey === 'strategy' ? (b.strategy_name ?? '')
        : b.result
      if (va === vb) return 0
      const cmp = va > vb ? 1 : -1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [trades, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'date' ? 'asc' : 'desc')
    }
  }

  const Sortable = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`cursor-pointer select-none px-3 py-2 ${className}`} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1 hover:text-text">
        {label}
        <ArrowDownUp size={11} className={sortKey === k ? 'text-accent' : 'opacity-40'} />
      </span>
    </th>
  )

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-left text-sm ${compact ? 'text-[13px]' : ''}`}>
        <thead>
          <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wider text-text-secondary">
            {numbered && <th className="px-3 py-2 text-center">#</th>}
            <Sortable k="date" label="Data" />
            {!compact && <th className="px-3 py-2">Hora</th>}
            <Sortable k="asset" label="Ativo" />
            <Sortable k="direction" label="Dir." />
            {!compact && <th className="px-3 py-2 text-right">Entrada</th>}
            {!compact && <th className="px-3 py-2 text-right">Saída</th>}
            {!compact && <th className="px-3 py-2 text-right">Qtd</th>}
            <Sortable k="result" label="Resultado" className="text-right" />
            {!compact && <Sortable k="r_multiple" label="R" className="text-right" />}
            {!compact && <Sortable k="strategy" label="Estratégia" />}
            {!compact && <th className="px-3 py-2">Lote+</th>}
            {!compact && <th className="px-3 py-2">Candle</th>}
            {!compact && <th className="px-3 py-2">Emoções</th>}
            {(onEdit || onDelete) && <th className="px-3 py-2 text-right">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
              {numbered && (
                <td className="px-3 py-2 text-center font-mono text-xs text-text-secondary">
                  {String(i + 1).padStart(2, '0')}
                </td>
              )}
              <td className="px-3 py-2 font-mono text-xs">{fmtDate(t.date)}</td>
              {!compact && <td className="px-3 py-2 font-mono text-xs text-text-secondary">{t.time ?? '—'}</td>}
              <td className="px-3 py-2 font-medium">{t.asset}</td>
              <td className="px-3 py-2">
                <span className={`badge ${t.direction === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                  {t.direction}
                </span>
              </td>
              {!compact && <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{t.entry_price?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}</td>}
              {!compact && <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{t.exit_price?.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) ?? '—'}</td>}
              {!compact && <td className="px-3 py-2 text-right font-mono text-xs text-text-secondary">{t.quantity ?? '—'}</td>}
              <td className={`px-3 py-2 text-right font-mono text-xs font-semibold ${pnlClass(t.result)}`}>
                {fmtBRL(t.result)}
              </td>
              {!compact && (
                <td className="px-3 py-2 text-right">
                  {t.r_multiple != null ? (
                    <span className={`badge ${t.r_multiple >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                      {t.r_multiple >= 0 ? '+' : ''}{t.r_multiple.toFixed(2)}R
                    </span>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
              )}
              {!compact && (
                <td className="px-3 py-2">
                  {t.strategy_name ? (
                    <span className="badge bg-accent/10 text-accent/90">{t.strategy_name}</span>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
              )}
              {!compact && (
                <td className="px-3 py-2">
                  {(t.added_lots ?? 0) > 0 ? (
                    <span className="badge bg-accent/10 text-accent">+{t.added_lots}</span>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
              )}
              {!compact && (
                <td className="px-3 py-2">
                  {t.candle_size ? (
                    <span className={`badge ${
                      t.candle_size === 'Grande' ? 'bg-up/10 text-up' : t.candle_size === 'Pequeno' ? 'bg-down/10 text-down' : 'bg-accent/10 text-accent'
                    }`}>
                      {t.candle_size}
                    </span>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
              )}
              {!compact && (
                <td className="px-3 py-2">
                  {t.emotions.length > 0 ? (
                    <div className="flex max-w-[140px] flex-wrap gap-0.5">
                      {t.emotions.slice(0, 3).map((e) => (
                        <span key={e} className="badge bg-accent/10 text-accent/90">{e}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
              )}
              {(onEdit || onDelete) && (
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {onEdit && (
                      <button onClick={() => onEdit(t)} className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text" aria-label={`Editar ${t.asset}`}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(t)} className="rounded-md p-1.5 text-text-secondary hover:bg-down/10 hover:text-down" aria-label={`Excluir ${t.asset}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
