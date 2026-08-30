import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Shield, Star, Trash2, X } from 'lucide-react'
import {
  bindRiskPlan, createRiskPlan, deleteRiskPlan, getRiskOverview,
  listRiskPlans, setActiveRiskPlan, updateRiskPlan,
} from '../api/client'
import type { DailyCompliance, RiskOverview, RiskPlan, RiskPlanInput } from '../types'
import { fmtBRL, fmtDate, pnlClass, todayISO } from '../utils/format'

const emptyForm = (): RiskPlanInput => ({
  name: '', description: '', daily_stop_loss: null,
  max_trades_per_day: null, max_risk_per_trade: null, is_active: false,
})

const statusBadge = (s: DailyCompliance['status']) => {
  if (s === 'conformidade') return 'badge bg-up/10 text-up'
  if (s === 'violacao') return 'badge bg-down/10 text-down'
  if (s === 'sem_gr') return 'badge bg-accent/10 text-accent'
  return 'badge bg-surface-2 text-text-secondary'
}

const statusLabel = (s: DailyCompliance['status']) => {
  if (s === 'conformidade') return 'Conformidade'
  if (s === 'violacao') return 'Violação'
  if (s === 'sem_gr') return 'Sem GR'
  return 'Sem trades'
}

export default function RiskPage() {
  const [plans, setPlans] = useState<RiskPlan[]>([])
  const [overview, setOverview] = useState<RiskOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RiskPlan | null>(null)
  const [todayBind, setTodayBind] = useState<string>('')
  const [todayStatus, setTodayStatus] = useState<DailyCompliance | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const today = todayISO()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansRes, ov] = await Promise.all([listRiskPlans(), getRiskOverview()])
      setPlans(plansRes.risk_plans)
      setOverview(ov)
      const todayEntry = ov.days.find((d) => d.date === today)
      setTodayStatus(todayEntry ?? null)
      // Pré-seleciona o GR vinculado do dia, senão o ativo.
      setTodayBind(
        todayEntry?.risk_plan_name
          ? (plansRes.risk_plans.find((p) => p.name === todayEntry.risk_plan_name)?.id ?? '')
          : (plansRes.risk_plans.find((p) => p.is_active)?.id ?? '')
      )
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  const handleSave = async (data: RiskPlanInput) => {
    if (editing) await updateRiskPlan(editing.id, data)
    else await createRiskPlan(data)
    setEditing(null)
    setFormOpen(false)
    await load()
  }

  const handleDelete = async (p: RiskPlan) => {
    const inUse = overview?.days.some((d) => d.risk_plan_name === p.name) ?? false
    const msg = inUse
      ? `O GR "${p.name}" está vinculado a dias do histórico. Desvincular desses dias e excluir?`
      : `Excluir o GR "${p.name}"?`
    if (!confirm(msg)) return
    try {
      await deleteRiskPlan(p.id, inUse)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir GR.')
    }
  }

  const handleSetActive = async (p: RiskPlan) => {
    await setActiveRiskPlan(p.id)
    await load()
  }

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

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Gestão de Risco</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {overview ? `${overview.days_tracked} dias avaliados · conformidade ${overview.compliance_rate != null ? overview.compliance_rate.toFixed(0) : '—'}%` : 'Configure seus GRs e acompanhe a disciplina.'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus size={16} /> Novo GR
        </button>
      </div>

      {/* Chips de resumo */}
      {overview && overview.days_tracked > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryChip label="Dias avaliados" value={String(overview.days_tracked)} />
          <SummaryChip label="Em conformidade" value={String(overview.days_compliant)} className="text-up" />
          <SummaryChip label="Em violação" value={String(overview.days_violating)} className="text-down" />
          <SummaryChip label="Taxa de conformidade" value={overview.compliance_rate != null ? `${overview.compliance_rate.toFixed(1)}%` : '—'} />
        </div>
      )}

      {/* GR de hoje */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          <h2 className="font-display text-sm font-semibold text-text">GR do dia · {fmtDate(today)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input max-w-xs"
            value={todayBind}
            onChange={(e) => handleBindToday(e.target.value)}
          >
            <option value="">— Sem GR vinculado —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {todayStatus && (
            <span className={statusBadge(todayStatus.status)}>
              {statusLabel(todayStatus.status)}
            </span>
          )}
          <span className="text-sm text-text-secondary">
            {todayStatus ? `${todayStatus.trades} op. · ${fmtBRL(todayStatus.pnl)}` : 'Nenhuma operação hoje'}
          </span>
        </div>
        {todayStatus && todayStatus.status === 'violacao' && (
          <ul className="mt-3 space-y-1">
            {todayStatus.violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-down">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
                {v.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cards de GR */}
      {loading ? (
        <div className="p-10 text-center text-sm text-text-secondary">Carregando...</div>
      ) : plans.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Shield size={26} />
          </div>
          <h3 className="font-display text-base font-semibold text-text">Nenhum GR cadastrado</h3>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            Cadastre um plano de risco com stop diário, risco por operação e máximo de operações.
          </p>
          <button className="btn btn-primary mt-5" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={16} /> Cadastrar primeiro GR
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-display text-base font-semibold text-text">
                    {p.name}
                    {p.is_active && (
                      <span className="badge bg-accent/15 text-accent">
                        <Star size={11} className="mr-1" /> Ativo
                      </span>
                    )}
                  </h3>
                  {p.description && <p className="mt-1 text-sm text-text-secondary">{p.description}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => { setEditing(p); setFormOpen(true) }}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text"
                    aria-label={`Editar ${p.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-down/10 hover:text-down"
                    aria-label={`Excluir ${p.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <LimitBox label="Stop diário" value={p.daily_stop_loss != null ? fmtBRL(-p.daily_stop_loss) : '—'} valueClass="text-down" />
                <LimitBox label="Risco/op" value={p.max_risk_per_trade != null ? fmtBRL(p.max_risk_per_trade) : '—'} />
                <LimitBox label="Máx op./dia" value={p.max_trades_per_day != null ? String(p.max_trades_per_day) : '—'} />
              </div>

              {!p.is_active && (
                <button
                  className="btn btn-ghost mt-4 self-start"
                  onClick={() => handleSetActive(p)}
                >
                  <Star size={14} /> Definir como ativo
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabela de conformidade diária */}
      {overview && overview.days.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-text">Conformidade diária</h2>
            <span className="text-xs text-text-secondary">{overview.days.length} dia(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">GR</th>
                  <th className="px-4 py-2 text-right">Op.</th>
                  <th className="px-4 py-2 text-right">P&L</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Violações</th>
                </tr>
              </thead>
              <tbody>
                {overview.days.map((d) => {
                  const open = expanded[d.date]
                  return (
                    <DayRow
                      key={d.date}
                      day={d}
                      open={!!open}
                      onToggle={() => setExpanded((e) => ({ ...e, [d.date]: !open }))}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RiskPlanForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} editing={editing} />
    </div>
  )
}

function SummaryChip({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`font-mono text-base font-semibold ${className || 'text-text'}`}>{value}</div>
    </div>
  )
}

function LimitBox({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`font-mono text-sm font-semibold ${valueClass || 'text-text'}`}>{value}</div>
    </div>
  )
}

function DayRow({ day, open, onToggle }: { day: DailyCompliance; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-border/60 last:border-0 hover:bg-surface-2/40">
        <td className="px-4 py-2 font-mono text-xs">{fmtDate(day.date)}</td>
        <td className="px-4 py-2">{day.risk_plan_name ?? '—'}</td>
        <td className="px-4 py-2 text-right font-mono text-xs text-text-secondary">{day.trades}</td>
        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${pnlClass(day.pnl)}`}>{fmtBRL(day.pnl)}</td>
        <td className="px-4 py-2"><span className={statusBadge(day.status)}>{statusLabel(day.status)}</span></td>
        <td className="px-4 py-2">
          {day.violations.length > 0 ? (
            <button
              className="text-xs font-medium text-down hover:underline"
              onClick={onToggle}
              aria-expanded={open}
            >
              {day.violations.length} motivo(s) {open ? '▴' : '▾'}
            </button>
          ) : (
            <span className="text-xs text-text-secondary">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/60 bg-surface-2/30">
          <td colSpan={6} className="px-4 py-3">
            <ul className="space-y-1">
              {day.violations.map((v, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
                  <span><span className="font-medium text-down">{v.title}:</span> {v.message}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function RiskPlanForm({ open, onClose, onSave, editing }: {
  open: boolean
  onClose: () => void
  onSave: (p: RiskPlanInput) => Promise<void>
  editing?: RiskPlan | null
}) {
  const [form, setForm] = useState<RiskPlanInput>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        name: editing.name,
        description: editing.description ?? '',
        daily_stop_loss: editing.daily_stop_loss ?? null,
        max_trades_per_day: editing.max_trades_per_day ?? null,
        max_risk_per_trade: editing.max_risk_per_trade ?? null,
        is_active: editing.is_active,
      } : emptyForm())
      setError('')
    }
  }, [open, editing])

  if (!open) return null

  const set = <K extends keyof RiskPlanInput>(key: K, value: RiskPlanInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('O nome do GR é obrigatório.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        description: form.description || null,
        daily_stop_loss: form.daily_stop_loss ?? null,
        max_trades_per_day: form.max_trades_per_day ?? null,
        max_risk_per_trade: form.max_risk_per_trade ?? null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const num = (v: string) => v === '' ? null : Number(v)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-text">
            {editing ? 'Editar GR' : 'Novo GR'}
          </h2>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="label">Nome *</label>
            <input type="text" className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Conservador" required />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input type="text" className="input" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)}
              placeholder="Breve resumo do perfil de risco" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Stop diário (R$)</label>
              <input type="number" min="0" step="any" className="input" value={form.daily_stop_loss ?? ''}
                onChange={(e) => set('daily_stop_loss', num(e.target.value))}
                placeholder="500" />
            </div>
            <div>
              <label className="label">Risco/op (R$)</label>
              <input type="number" min="0" step="any" className="input" value={form.max_risk_per_trade ?? ''}
                onChange={(e) => set('max_risk_per_trade', num(e.target.value))}
                placeholder="150" />
            </div>
            <div>
              <label className="label">Máx op./dia</label>
              <input type="number" min="0" step="1" className="input" value={form.max_trades_per_day ?? ''}
                onChange={(e) => set('max_trades_per_day', num(e.target.value))}
                placeholder="4" />
            </div>
          </div>

          {error && <div className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar GR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
