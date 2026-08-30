import { useCallback, useEffect, useState } from 'react'
import { Plus, Shield, Upload } from 'lucide-react'
import { bindRiskPlan, createJournal, createTrade, deleteJournal, deleteTrade, getRiskOverview, listJournal, listRiskPlans, listTrades, updateJournal, updateTrade } from '../api/client'
import type { DailyCompliance, JournalEntry, RiskPlan, Trade, TradeInput } from '../types'
import TradeForm from '../components/TradeForm'
import TradeTable from '../components/TradeTable'
import ImportModal from '../components/ImportModal'
import JournalCard from '../components/JournalCard'
import StatCard from '../components/StatCard'
import { fmtBRL, fmtDate, pnlClass, todayISO } from '../utils/format'

export default function TodayPage() {
  const today = todayISO()
  const [trades, setTrades] = useState<Trade[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)
  const [loading, setLoading] = useState(true)

  // Gestão de Risco do dia
  const [riskPlans, setRiskPlans] = useState<RiskPlan[]>([])
  const [todayBind, setTodayBind] = useState('')
  const [todayStatus, setTodayStatus] = useState<DailyCompliance | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, j, plans, ov] = await Promise.all([
        listTrades({ from: today, to: today }),
        listJournal({ date: today }),
        listRiskPlans(),
        getRiskOverview(),
      ])
      setTrades(t.trades)
      setJournal(j.journal)
      setRiskPlans(plans.risk_plans)
      const todayEntry = ov.days.find((d) => d.date === today)
      setTodayStatus(todayEntry ?? null)
      setTodayBind(
        todayEntry?.risk_plan_name
          ? (plans.risk_plans.find((p) => p.name === todayEntry.risk_plan_name)?.id ?? '')
          : (plans.risk_plans.find((p) => p.is_active)?.id ?? '')
      )
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  const handleBindToday = async (planId: string) => {
    setTodayBind(planId)
    if (!planId) return
    try {
      await bindRiskPlan(today, planId)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao vincular GR do dia.')
    }
  }

  const wins = trades.filter((t) => t.result > 0).length
  const losses = trades.filter((t) => t.result < 0).length
  const total = trades.reduce((s, t) => s + t.result, 0)

  const handleSave = async (data: TradeInput) => {
    if (editing) await updateTrade(editing.id, data)
    else await createTrade(data)
    setEditing(null)
    await load()
  }

  const handleDelete = async (t: Trade) => {
    if (confirm(`Excluir a operação de ${t.asset} (${fmtBRL(t.result)})?`)) {
      await deleteTrade(t.id)
      await load()
    }
  }

  const handleJournalSave = async (data: Partial<JournalEntry>) => {
    const existing = journal[0]
    if (existing) await updateJournal(existing.id, data)
    else await createJournal(data)
    await load()
  }

  const handleJournalDelete = async (id: string) => {
    await deleteJournal(id)
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do dia */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Hoje · {fmtDate(today)}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {trades.length === 0
              ? 'Nenhuma operação ainda hoje.'
              : `${trades.length} operação(ões), ${wins} verdes e ${losses} vermelhas.`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Importar
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={16} /> Nova operação
          </button>
        </div>
      </div>

      {/* Gestão de Risco do dia */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-accent" />
            <h2 className="font-display text-sm font-semibold text-text">Gestão de Risco do dia</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="input max-w-[220px]"
              value={todayBind}
              onChange={(e) => handleBindToday(e.target.value)}
              aria-label="GR do dia"
            >
              <option value="">— Sem GR —</option>
              {riskPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {todayStatus && todayStatus.status !== 'sem_trades' && (
              <span className={`badge ${todayStatus.status === 'conformidade' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                {todayStatus.status === 'conformidade' ? 'Conformidade' : 'Violação'}
              </span>
            )}
          </div>
        </div>

        {/* Banner de disciplina ao vivo */}
        {todayBind && (() => {
          const plan = riskPlans.find((p) => p.id === todayBind)
          if (!plan) return null
          const stop = plan.daily_stop_loss ?? null
          const maxTrades = plan.max_trades_per_day ?? null
          const stopped = stop != null && total <= -stop
          const tradedOut = maxTrades != null && trades.length >= maxTrades
          const riskedOver = plan.max_risk_per_trade != null &&
            trades.some((t) => Math.max(t.risk_amount ?? 0, Math.abs(t.result)) > (plan.max_risk_per_trade ?? 0))
          return (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-surface-2/50 p-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">Stop diário</div>
                {stop != null
                  ? <span className={`font-mono font-semibold ${stopped ? 'text-down' : 'text-text'}`}>
                      {fmtBRL(-stop)} · agora {fmtBRL(total)}{stopped && ' · ESTOUROU'}
                    </span>
                  : <span className="text-text-secondary">não definido</span>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">Operações</div>
                {maxTrades != null
                  ? <span className={`font-mono font-semibold ${tradedOut ? 'text-down' : 'text-text'}`}>
                      {trades.length}/{maxTrades}{tradedOut && ' · LIMITE'}
                    </span>
                  : <span className="text-text-secondary">não definido</span>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-secondary">Risco por operação</div>
                {plan.max_risk_per_trade != null
                  ? <span className={`font-mono font-semibold ${riskedOver ? 'text-down' : 'text-text'}`}>
                      até {fmtBRL(plan.max_risk_per_trade)} {riskedOver && '· VIOLADO'}
                    </span>
                  : <span className="text-text-secondary">não definido</span>}
              </div>
            </div>
          )
        })()}

        {/* Violações do dia (detalhe) */}
        {todayStatus && todayStatus.status === 'violacao' && (
          <ul className="mt-3 space-y-1">
            {todayStatus.violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-down">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
                {v.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resumo do dia */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="P&L do dia" value={fmtBRL(total)} valueClass={`font-display text-2xl ${pnlClass(total)}`} />
        <StatCard label="Operações" value={String(trades.length)} />
        <StatCard label="Acerto" value={trades.length ? `${((wins / trades.length) * 100).toFixed(1)}%` : '—'} />
        <StatCard label="Maior operação" value={trades.length ? fmtBRL(Math.max(...trades.map((t) => t.result))) : '—'} />
      </div>

      {/* Trades do dia */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-text">Operações do dia</h2>
          <span className="text-xs text-text-secondary">{trades.length} registradas</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-text-secondary">Carregando...</div>
        ) : trades.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setFormOpen(true) }} onImport={() => setImportOpen(true)} />
        ) : (
          <TradeTable trades={trades} onEdit={(t) => { setEditing(t); setFormOpen(true) }} onDelete={handleDelete} numbered />
        )}
      </div>

      {/* Review do dia */}
      <div>
        <h2 className="mb-2 font-display text-sm font-semibold text-text">Review emocional do dia</h2>
        <JournalCard
          entry={journal[0] ?? null}
          defaultDate={today}
          onSave={handleJournalSave}
          onDelete={handleJournalDelete}
        />
      </div>

      <TradeForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} editing={editing} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
    </div>
  )
}

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Plus size={26} />
      </div>
      <h3 className="font-display text-base font-semibold text-text">Nenhuma operação registrada</h3>
      <p className="mt-1 max-w-sm text-sm text-text-secondary">
        Registre sua primeira operação do dia ou importe de um arquivo do Profit Pro / MetaTrader.
      </p>
      <div className="mt-5 flex gap-2">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Nova operação</button>
        <button className="btn btn-ghost" onClick={onImport}><Upload size={16} /> Importar CSV</button>
      </div>
    </div>
  )
}
