import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createJournal, deleteJournal, listJournal, listTrades, updateJournal } from '../api/client'
import type { JournalEntry, Trade } from '../types'
import JournalCard from '../components/JournalCard'
import StatCard from '../components/StatCard'
import { fmtBRL, fmtDateLong, pnlClass } from '../utils/format'

export default function JournalPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [j, t] = await Promise.all([listJournal({ date }), listTrades({ from: date, to: date })])
      setEntry(j.journal[0] ?? null)
      setTrades(t.trades)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const shiftDay = (delta: number) => {
    const d = new Date(`${date}T12:00:00`)
    d.setDate(d.getDate() + delta)
    setDate(d.toISOString().slice(0, 10))
  }

  const totalPnl = trades.reduce((s, t) => s + t.result, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Diário emocional</h1>
          <p className="mt-1 text-sm text-text-secondary">Registre humor, disciplina, erros e lições — por dia e por operação.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost p-2" onClick={() => shiftDay(-1)} aria-label="Dia anterior">
            <ChevronLeft size={18} />
          </button>
          <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="btn btn-ghost p-2" onClick={() => shiftDay(1)} aria-label="Próximo dia">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Dia" value={fmtDateLong(date).split(',').pop()?.trim() ?? ''} />
        <StatCard label="P&L do dia" value={fmtBRL(totalPnl)} valueClass={pnlClass(totalPnl)} />
        <StatCard label="Operações" value={String(trades.length)} />
        <StatCard label="Humor" value={entry?.mood_score != null ? `${entry.mood_score}/10` : '—'} />
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-text-secondary">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <JournalCard
            entry={entry}
            defaultDate={date}
            onSave={async (data) => {
              if (entry) await updateJournal(entry.id, data)
              else await createJournal(data)
              await load()
            }}
            onDelete={async (id) => { await deleteJournal(id); await load() }}
          />
          <div className="card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-display text-sm font-semibold text-text">Operações do dia</h3>
            </div>
            {trades.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-secondary">
                Sem operações neste dia.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {trades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <span className="font-mono text-xs text-text-secondary">{t.time ?? '—'}</span>
                      <span className="ml-2 font-medium">{t.asset}</span>
                      <span className={`badge ml-2 ${t.direction === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                        {t.direction}
                      </span>
                    </div>
                    <span className={`font-mono text-sm font-semibold ${pnlClass(t.result)}`}>
                      {fmtBRL(t.result)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
