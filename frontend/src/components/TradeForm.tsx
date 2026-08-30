import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { listAccounts, listOptions, listStrategies } from '../api/client'
import type { Account, CustomOption, Strategy, Trade, TradeInput } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (trade: TradeInput) => Promise<void>
  editing?: Trade | null
}

const emptyForm = (): TradeInput => ({
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  asset: 'EURUSD',
  direction: 'LONG',
  entry_price: null,
  exit_price: null,
  quantity: null,
  result: null,
  fees: 0,
  risk_amount: null,
  emotions: [],
  notes: '',
  strategy_id: null,
  added_lots: null,
  candle_size: null,
  account_id: null,
  currency: 'USD',
  event_id: null,
  context_id: null,
  location_id: null,
  clean_left: false,
  first_bar: false,
  entry_type: null,
  has_addition: false,
  outcome_type: 'GAIN',
  errors: [],
})

export default function TradeForm({ open, onClose, onSave, editing }: Props) {
  const [form, setForm] = useState<TradeInput>(emptyForm())
  const [usePrices, setUsePrices] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [events, setEvents] = useState<CustomOption[]>([])
  const [contexts, setContexts] = useState<CustomOption[]>([])
  const [locations, setLocations] = useState<CustomOption[]>([])
  const [entryTypes, setEntryTypes] = useState<CustomOption[]>([])
  const [errorTypes, setErrorTypes] = useState<CustomOption[]>([])
  const [assetOptions, setAssetOptions] = useState<CustomOption[]>([])

  useEffect(() => {
    if (open) {
      Promise.all([
        listAccounts(),
        listStrategies(),
        listOptions('event'),
        listOptions('context'),
        listOptions('location'),
        listOptions('entry_type'),
        listOptions('error_type'),
        listOptions('asset'),
      ]).then(([accs, strats, evs, ctxs, locs, ent, errs, asts]) => {
        setAccounts(accs)
        setStrategies(strats.strategies)
        setEvents(evs)
        setContexts(ctxs)
        setLocations(locs)
        setEntryTypes(ent)
        setErrorTypes(errs)
        setAssetOptions(asts)

        if (editing) {
          setForm({
            date: editing.date,
            time: editing.time ?? '',
            asset: editing.asset,
            direction: editing.direction as any,
            entry_price: editing.entry_price,
            exit_price: editing.exit_price,
            quantity: editing.quantity,
            result: editing.result,
            fees: editing.fees,
            risk_amount: editing.risk_amount,
            emotions: editing.emotions,
            notes: editing.notes ?? '',
            strategy_id: editing.strategy_id ?? null,
            added_lots: editing.added_lots ?? null,
            candle_size: editing.candle_size ?? null,
            account_id: editing.account_id ?? null,
            currency: editing.currency ?? 'USD',
            event_id: editing.event_id ?? null,
            context_id: editing.context_id ?? null,
            location_id: editing.location_id ?? null,
            clean_left: editing.clean_left ?? false,
            first_bar: editing.first_bar ?? false,
            entry_type: editing.entry_type ?? null,
            has_addition: editing.has_addition ?? false,
            outcome_type: (editing.outcome_type as any) ?? (editing.result > 0 ? 'GAIN' : editing.result < 0 ? 'LOSS' : 'ZERO'),
            errors: editing.errors ?? [],
          })
          setUsePrices(Boolean(editing.entry_price && editing.exit_price && editing.quantity))
        } else {
          const activeAcc = accs.find((a) => a.is_active)
          setForm({
            ...emptyForm(),
            account_id: activeAcc?.id ?? null,
            currency: activeAcc?.currency ?? 'USD',
            asset: asts.length > 0 ? asts[0].code || asts[0].name : 'EURUSD',
          })
          setUsePrices(true)
        }
      }).catch(console.error)
      setError('')
    }
  }, [open, editing])

  if (!open) return null

  const set = (key: keyof TradeInput, value: unknown) => setForm((f) => ({ ...f, [key]: value }))

  const toggleError = (errName: string) => {
    const list = form.errors ?? []
    set('errors', list.includes(errName) ? list.filter((x) => x !== errName) : [...list, errName])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.date || !form.asset.trim() || !form.direction) {
      setError('Preencha data, ativo e direção.')
      return
    }

    const payload: TradeInput = {
      ...form,
      asset: form.asset.trim().toUpperCase(),
      entry_price: usePrices ? form.entry_price : null,
      exit_price: usePrices ? form.exit_price : null,
      quantity: form.quantity,
      result: usePrices ? null : form.result,
      fees: form.fees ?? 0,
    }

    setSaving(true)
    try {
      await onSave(payload)
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
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h2 className="font-display text-base font-semibold text-text">
            {editing ? 'Editar Operação' : 'Nova Operação (Registro Analítico)'}
          </h2>
          <button onClick={onClose} className="p-1 text-text-secondary hover:text-text" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Conta de Corretora</label>
              <select
                className="input"
                value={form.account_id ?? ''}
                onChange={(e) => {
                  const acc = accounts.find((a) => a.id === e.target.value)
                  set('account_id', e.target.value || null)
                  if (acc) set('currency', acc.currency)
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Ativo Operado</label>
              <select className="input font-mono" value={form.asset} onChange={(e) => set('asset', e.target.value)}>
                {assetOptions.map((ast) => (
                  <option key={ast.id} value={ast.code || ast.name}>{ast.code ? `${ast.code} - ${ast.name}` : ast.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" className="input" value={form.time ?? ''} onChange={(e) => set('time', e.target.value)} />
            </div>
            <div>
              <label className="label">Direção</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                {(['LONG', 'SHORT'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('direction', d)}
                    className={`rounded-md py-1 text-xs font-semibold transition-colors ${
                      form.direction === d
                        ? d === 'LONG' ? 'bg-up/20 text-up' : 'bg-down/20 text-down'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Evento de Entrada</label>
              <select className="input" value={form.event_id ?? ''} onChange={(e) => set('event_id', e.target.value || null)}>
                <option value="">Selecione...</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.code ? `[${ev.code}] ${ev.name}` : ev.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Contexto</label>
              <select className="input" value={form.context_id ?? ''} onChange={(e) => set('context_id', e.target.value || null)}>
                <option value="">Selecione...</option>
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Localização</label>
              <select className="input" value={form.location_id ?? ''} onChange={(e) => set('location_id', e.target.value || null)}>
                <option value="">Selecione...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            <div>
              <label className="label">Como entrei?</label>
              <select className="input" value={form.entry_type ?? ''} onChange={(e) => set('entry_type', e.target.value || null)}>
                <option value="">Selecione...</option>
                {entryTypes.map((ent) => (
                  <option key={ent.id} value={ent.name}>{ent.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text">
                <input
                  type="checkbox"
                  checked={form.clean_left}
                  onChange={(e) => set('clean_left', e.target.checked)}
                  className="rounded border-border bg-surface-2 text-accent focus:ring-0"
                />
                Esq. Limpa?
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-text">
                <input
                  type="checkbox"
                  checked={form.first_bar}
                  onChange={(e) => set('first_bar', e.target.checked)}
                  className="rounded border-border bg-surface-2 text-accent focus:ring-0"
                />
                1ª Barra?
              </label>
            </div>
            <div>
              <label className="label">Resultado Operação</label>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
                {(['GAIN', 'LOSS', 'ZERO'] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => set('outcome_type', o)}
                    className={`rounded-md py-1 text-xs font-semibold transition-colors ${
                      form.outcome_type === o
                        ? o === 'GAIN' ? 'bg-up/20 text-up' : o === 'LOSS' ? 'bg-down/20 text-down' : 'bg-accent/20 text-accent'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Qtd Lotes Entrados</label>
              <input
                type="number"
                step="any"
                className="input font-mono"
                value={form.quantity ?? ''}
                onChange={(e) => set('quantity', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="Ex: 1.0 ou 2"
                required
              />
            </div>
            <div>
              <label className="label">Teve Adição de Lotes?</label>
              <div className="flex items-center gap-3 mt-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-text">
                  <input
                    type="checkbox"
                    checked={form.has_addition}
                    onChange={(e) => set('has_addition', e.target.checked)}
                    className="rounded border-border bg-surface-2 text-accent focus:ring-0"
                  />
                  Sim
                </label>
                {form.has_addition && (
                  <input
                    type="number"
                    min="1"
                    className="input py-1 text-xs w-24 font-mono"
                    placeholder="+ Qtd Lotes"
                    value={form.added_lots ?? ''}
                    onChange={(e) => set('added_lots', e.target.value === '' ? null : Number(e.target.value))}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="label">Risco da Operação ({form.currency})</label>
              <input
                type="number"
                step="any"
                className="input font-mono"
                value={form.risk_amount ?? ''}
                onChange={(e) => set('risk_amount', e.target.value === '' ? null : Number(e.target.value))}
                placeholder="Ex: 150"
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <label className="label">Resultado Financeiro P&L ({form.currency})</label>
              <button
                type="button"
                onClick={() => setUsePrices(!usePrices)}
                className="text-xs text-accent hover:underline"
              >
                {usePrices ? 'Digitar R$ / $ resultado direto' : 'Calcular a partir dos preços'}
              </button>
            </div>

            {usePrices ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary">Preço Entrada</label>
                  <input type="number" step="any" className="input font-mono" value={form.entry_price ?? ''}
                    onChange={(e) => set('entry_price', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-text-secondary">Preço Saída</label>
                  <input type="number" step="any" className="input font-mono" value={form.exit_price ?? ''}
                    onChange={(e) => set('exit_price', e.target.value === '' ? null : Number(e.target.value))} />
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  step="any"
                  className="input font-mono font-bold"
                  value={form.result ?? ''}
                  onChange={(e) => set('result', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="Ex: 350.00 ou -150.00"
                  required
                />
              </div>
            )}
          </div>

          {/* Estratégia */}
          <div>
            <label className="label">Estratégia Operacional</label>
            <select className="input text-xs" value={form.strategy_id ?? ''} onChange={(e) => set('strategy_id', e.target.value || null)}>
              <option value="">Nenhuma / Fora do Setup</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Registro de Erros da Operação */}
          <div>
            <label className="label text-loss font-semibold">Registro de Erros da Operação (Se houver)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {errorTypes.map((err) => {
                const active = (form.errors ?? []).includes(err.name)
                return (
                  <button
                    key={err.id}
                    type="button"
                    onClick={() => toggleError(err.name)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-loss bg-loss/15 text-loss font-bold'
                        : 'border-border text-text-secondary hover:border-loss/50'
                    }`}
                  >
                    {err.code ? `[${err.code}] ${err.name}` : err.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Observações / Notas</label>
            <textarea className="input min-h-[50px] resize-y text-xs" value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)} placeholder="Detalhes adicionais da operação..." />
          </div>

          {error && <div className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar Alterações' : 'Registrar Operação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
