import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { createTrade, deleteTrade, listStrategies, listTrades, updateTrade } from '../api/client'
import type { Strategy, Trade, TradeInput } from '../types'
import TradeForm from '../components/TradeForm'
import TradeTable from '../components/TradeTable'
import ImportModal from '../components/ImportModal'
import { fmtBRL, fmtDate, pnlClass } from '../utils/format'

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)
  const [loading, setLoading] = useState(true)

  const [assetFilter, setAssetFilter] = useState('')
  const [dirFilter, setDirFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [strategyFilter, setStrategyFilter] = useState('')

  const assets = useMemo(() => Array.from(new Set(trades.map((t) => t.asset))).sort(), [trades])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listTrades({
        asset: assetFilter || undefined,
        direction: dirFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        strategy_id: strategyFilter || undefined,
      })
      setTrades(res.trades)
    } finally {
      setLoading(false)
    }
  }, [assetFilter, dirFilter, fromFilter, toFilter, strategyFilter])

  useEffect(() => { listStrategies().then((r) => setStrategies(r.strategies)).catch(() => setStrategies([])) }, [])
  useEffect(() => { load() }, [load])

  const totalPnl = trades.reduce((s, t) => s + t.result, 0)
  const wins = trades.filter((t) => t.result > 0).length

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

  const exportCSV = () => {
    const header = ['data', 'hora', 'ativo', 'direcao', 'entrada', 'saida', 'quantidade', 'resultado', 'corretagem', 'r_multiplo', 'estrategia', 'emocoes', 'notas', 'fonte']
    const rows = trades.map((t) => [
      t.date, t.time ?? '', t.asset, t.direction,
      t.entry_price ?? '', t.exit_price ?? '', t.quantity ?? '',
      t.result, t.fees, t.r_multiple ?? '',
      t.strategy_name ?? '', t.emotions.join('|'), t.notes ?? '', t.source,
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Operações</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {trades.length} registro(s) · <span className={pnlClass(totalPnl)}>{fmtBRL(totalPnl)}</span> · acerto {trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0}%
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportCSV} disabled={!trades.length}>
            <Download size={16} /> Exportar
          </button>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Importar
          </button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus size={16} /> Nova operação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="label">Ativo</label>
          <select className="input" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}>
            <option value="">Todos</option>
            {assets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Direção</label>
          <select className="input" value={dirFilter} onChange={(e) => setDirFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
          </select>
        </div>
        <div>
          <label className="label">Estratégia</label>
          <select className="input" value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value)}>
            <option value="">Todas</option>
            {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">De</label>
          <input type="date" className="input" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        </div>
        <div>
          <label className="label">Até</label>
          <input type="date" className="input" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn btn-ghost w-full" onClick={() => {
            setAssetFilter(''); setDirFilter(''); setFromFilter(''); setToFilter(''); setStrategyFilter('')
          }}>
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-semibold text-text">Histórico</h2>
          <span className="text-xs text-text-secondary">
            {fromFilter && `desde ${fmtDate(fromFilter)}`} {toFilter && `até ${fmtDate(toFilter)}`}
          </span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-text-secondary">Carregando...</div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <p className="text-sm text-text-secondary">
              Nenhuma operação encontrada com esses filtros.
            </p>
            <button className="btn btn-primary mt-4" onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus size={16} /> Registrar primeira operação
            </button>
          </div>
        ) : (
          <TradeTable trades={trades} onEdit={(t) => { setEditing(t); setFormOpen(true) }} onDelete={handleDelete} numbered />
        )}
      </div>

      <TradeForm open={formOpen} onClose={() => setFormOpen(false)} onSave={handleSave} editing={editing} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => { setFromFilter(''); setToFilter(''); load() }} />
    </div>
  )
}
