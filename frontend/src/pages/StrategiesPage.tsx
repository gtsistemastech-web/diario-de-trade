import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { createStrategy, deleteStrategy, listStrategies, listTrades, updateStrategy } from '../api/client'
import type { Strategy, StrategyInput } from '../types'
import { fmtBRL, pnlClass } from '../utils/format'

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Strategy | null>(null)
  // P&L / contagem por estratégia (via listTrades agregado no frontend)
  const [usage, setUsage] = useState<Record<string, { count: number; pnl: number }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, tradesRes] = await Promise.all([listStrategies(), listTrades()])
      setStrategies(res.strategies)
      const map: Record<string, { count: number; pnl: number }> = {}
      for (const t of tradesRes.trades) {
        if (!t.strategy_id) continue
        const cur = map[t.strategy_id] ?? { count: 0, pnl: 0 }
        cur.count += 1
        cur.pnl += t.result
        map[t.strategy_id] = cur
      }
      setUsage(map)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async (data: StrategyInput) => {
    if (editing) await updateStrategy(editing.id, data)
    else await createStrategy(data)
    setEditing(null)
    setFormOpen(false)
    await load()
  }

  const handleDelete = async (s: Strategy) => {
    const u = usage[s.id]
    const inUse = (u?.count ?? 0) > 0
    const msg = inUse
      ? `A estratégia "${s.name}" está em uso por ${u.count} operação(ões). Desvincular dessas operações e excluir?`
      : `Excluir a estratégia "${s.name}"?`
    if (!confirm(msg)) return
    try {
      await deleteStrategy(s.id, inUse)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir estratégia.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Estratégias</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {strategies.length} estratégia(s) cadastrada(s) · use no registro de cada operação
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus size={16} /> Nova estratégia
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-text-secondary">Carregando...</div>
      ) : strategies.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Plus size={26} />
          </div>
          <h3 className="font-display text-base font-semibold text-text">Nenhuma estratégia cadastrada</h3>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            Cadastre suas estratégias para vinculá-las às operações e ver qual rende mais nas estatísticas.
          </p>
          <button className="btn btn-primary mt-5" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={16} /> Cadastrar primeira estratégia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {strategies.map((s) => {
            const u = usage[s.id]
            return (
              <div key={s.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold text-text">{s.name}</h3>
                    {s.description && <p className="mt-1 text-sm text-text-secondary">{s.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => { setEditing(s); setFormOpen(true) }}
                      className="rounded-md p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text"
                      aria-label={`Editar ${s.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="rounded-md p-1.5 text-text-secondary hover:bg-down/10 hover:text-down"
                      aria-label={`Excluir ${s.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {s.setup && (
                  <div className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-text-secondary">Setup</div>
                    <p className="mt-0.5 text-sm text-text">{s.setup}</p>
                  </div>
                )}

                {u && (
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-text-secondary">Operações</div>
                      <div className="font-mono text-sm font-semibold text-text">{u.count}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-text-secondary">P&L</div>
                      <div className={`font-mono text-sm font-semibold ${pnlClass(u.pnl)}`}>{fmtBRL(u.pnl)}</div>
                    </div>
                  </div>
                )}

                <div className="mt-auto flex justify-end pt-3">
                  {s.notes && <p className="text-xs text-text-secondary">{s.notes}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <StrategyForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} editing={editing} />
    </div>
  )
}

function StrategyForm({ open, onClose, onSave, editing }: {
  open: boolean
  onClose: () => void
  onSave: (s: StrategyInput) => Promise<void>
  editing?: Strategy | null
}) {
  const [form, setForm] = useState<Record<string, string>>({ name: '', description: '', setup: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? '',
        description: editing?.description ?? '',
        setup: editing?.setup ?? '',
        notes: editing?.notes ?? '',
      })
      setError('')
    }
  }, [open, editing])

  if (!open) return null

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('O nome da estratégia é obrigatório.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description || null,
        setup: form.setup || null,
        notes: form.notes || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-text">
            {editing ? 'Editar estratégia' : 'Nova estratégia'}
          </h2>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="label">Nome *</label>
            <input type="text" className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Pullback em tendência" required />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input type="text" className="input" value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Breve resumo da estratégia" />
          </div>
          <div>
            <label className="label">Setup (regras de entrada)</label>
            <textarea className="input min-h-[60px] resize-y" value={form.setup}
              onChange={(e) => set('setup', e.target.value)}
              placeholder="Ex: rompimento de máxima + candle de confirmação" />
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[50px] resize-y" value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Dicas, filtros, o que evitar..." />
          </div>

          {error && <div className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar estratégia'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
