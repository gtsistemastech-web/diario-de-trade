import { useEffect, useState } from 'react'
import {
  TrendingUp,
  Percent,
  Award,
  Calendar,
  Clock,
  AlertTriangle,
  BarChart2,
  DollarSign,
  PieChart as PieIcon,
  Filter,
} from 'lucide-react'
import {
  listAccounts,
  getStatsOverview,
  getEquityCurve,
  getStatsByCategory,
  getStatsByTradeNumber,
  getCalendarStats,
  getErrorStats,
} from '../api/client'
import type { Account } from '../types'
import { fmtUSD } from '../utils/format'
import PatrimonyChart from '../components/PatrimonyChart'

type Period = 'day' | '7d' | '30d' | 'custom'

export default function AnalysisPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAcc, setSelectedAcc] = useState<string>('')
  const [period, setPeriod] = useState<Period>('30d')
  const [customFrom, setCustomFrom] = useState<string>('')
  const [customTo, setCustomTo] = useState<string>('')

  const [overview, setOverview] = useState<any>(null)
  const [equity, setEquity] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [tradeNumbers, setTradeNumbers] = useState<any[]>([])
  const [calendar, setCalendar] = useState<any>(null)
  const [errors, setErrors] = useState<any[]>([])

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    listAccounts().then((accs) => {
      setAccounts(accs)
      const active = accs.find((a) => a.is_active)
      if (active) setSelectedAcc(active.id)
    })
  }, [])

  const loadAllStats = async () => {
    let fromDate: string | undefined
    let toDate: string | undefined
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    if (period === 'day') {
      fromDate = today
      toDate = today
    } else if (period === '7d') {
      const d = new Date()
      d.setDate(now.getDate() - 7)
      fromDate = d.toISOString().slice(0, 10)
    } else if (period === '30d') {
      const d = new Date()
      d.setDate(now.getDate() - 30)
      fromDate = d.toISOString().slice(0, 10)
    } else if (period === 'custom') {
      fromDate = customFrom || undefined
      toDate = customTo || undefined
    }

    const params = { from: fromDate, to: toDate, account_id: selectedAcc || undefined }

    try {
      const [ov, eq, ev, tn, cal, errs] = await Promise.all([
        getStatsOverview(params),
        getEquityCurve(params),
        getStatsByCategory('event', params),
        getStatsByTradeNumber(params),
        getCalendarStats(selectedYear, selectedMonth, selectedAcc || undefined),
        getErrorStats(params),
      ])

      setOverview(ov)
      setEquity(eq)
      setEvents(ev)
      setTradeNumbers(tn)
      setCalendar(cal)
      setErrors(errs)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    // No modo "Personalizado", só recarrega quando as duas datas estiverem
    // preenchidas, pra não disparar buscas com um range incompleto.
    if (period === 'custom' && (!customFrom || !customTo)) return
    loadAllStats()
  }, [selectedAcc, period, selectedMonth, selectedYear, customFrom, customTo])

  return (
    <div className="space-y-8">
      {/* Header & Filtros Globais */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">Módulo de Análise Geral</h1>
          <p className="text-sm text-text-secondary">Relatórios analíticos profissionais e métricas avançadas da sua performance.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Conta */}
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 border border-border">
            <Filter size={16} className="text-accent" />
            <select
              value={selectedAcc}
              onChange={(e) => setSelectedAcc(e.target.value)}
              className="bg-transparent text-sm font-semibold text-text focus:outline-none"
            >
              <option value="">Todas as Contas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>

          {/* Seletor de Período */}
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1 border border-border">
            {[
              { id: 'day', label: 'Diário' },
              { id: '7d', label: 'Semanal' },
              { id: '30d', label: 'Mensal' },
              { id: 'custom', label: 'Personalizado' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as Period)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  period === p.id ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Range customizado, só aparece no modo Personalizado */}
          {period === 'custom' && (
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 border border-border">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-transparent text-xs text-text focus:outline-none"
              />
              <span className="text-text-secondary text-xs">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-transparent text-xs text-text focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards em USD/R$ */}
      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Resultado Total (P&L)" value={fmtUSD(overview.total_pnl)} highlight={overview.total_pnl >= 0 ? 'up' : 'down'} icon={DollarSign} />
          <KpiCard title="Taxa de Acerto (Win Rate)" value={`${overview.win_rate}%`} subtext={`${overview.positive_trades} Gain / ${overview.negative_trades} Loss / ${overview.zero_trades} 0x0`} icon={Percent} />
          <KpiCard title="Payoff Ratio (Média G/L)" value={overview.payoff} subtext={`G: ${fmtUSD(overview.avg_gain)} | L: ${fmtUSD(overview.avg_loss)}`} icon={Award} />
          <KpiCard title="Profit Factor" value={overview.profit_factor} subtext={`Risco Médio: ${fmtUSD(overview.avg_risk)}`} icon={TrendingUp} />
        </div>
      )}

      {/* Gráfico de Curva de Patrimônio */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
            <BarChart2 className="text-accent" size={18} /> Curva de Patrimônio Acumulada
          </h2>
          <span className="text-xs text-text-secondary">{equity.length} trades analisados</span>
        </div>
        <PatrimonyChart data={equity} height={320} />
      </div>

      {/* Seção 2 Colunas: Análise por Evento & Por Ordem Cronológica */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Desempenho por Evento de Entrada */}
        <div className="card space-y-4">
          <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
            <PieIcon className="text-accent" size={18} /> Desempenho por Evento de Entrada
          </h2>
          <div className="divide-y divide-border/50">
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className="font-semibold text-text">{ev.category_name}</span>
                  <div className="text-text-secondary">{ev.total_trades} trades ({ev.win_rate}% win)</div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold ${ev.total_pnl >= 0 ? 'text-up' : 'text-down'}`}>{fmtUSD(ev.total_pnl)}</div>
                  <div className="text-[10px] text-text-secondary">Média: {fmtUSD(ev.avg_result)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Análise da Ordem Cronológica (1º, 2º, 3º trade do dia) */}
        <div className="card space-y-4">
          <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
            <Clock className="text-accent" size={18} /> Ordem Cronológica dos Trades do Dia
          </h2>
          <div className="divide-y divide-border/50">
            {tradeNumbers.map((tn, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-xs">
                <span className="font-bold text-accent">{tn.trade_order}</span>
                <div className="flex items-center gap-6">
                  <span className="text-text-secondary">{tn.total_trades} execuções ({tn.win_rate}% win)</span>
                  <span className={`font-mono font-bold ${tn.total_pnl >= 0 ? 'text-up' : 'text-down'}`}>{fmtUSD(tn.total_pnl)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Relatório de Custo de Erros Operacionais */}
      <div className="card space-y-4 border-loss/30 bg-loss/5">
        <h2 className="font-display text-base font-bold text-loss flex items-center gap-2">
          <AlertTriangle size={18} /> Relatório de Impacto Financeiro dos Erros
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {errors.map((err, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-3 space-y-1">
              <div className="font-semibold text-xs text-text">{err.error_name}</div>
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Ocorrências: <strong className="text-text">{err.count}x</strong></span>
                <span className="text-loss font-mono font-bold">Custo: -{fmtUSD(err.total_cost)}</span>
              </div>
            </div>
          ))}
          {errors.length === 0 && <div className="text-xs text-text-secondary italic">Nenhum erro registrado no período selecionado. Parabéns pela disciplina!</div>}
        </div>
      </div>

      {/* Calendário Mensal de Performance */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-text flex items-center gap-2">
            <Calendar className="text-accent" size={18} /> Calendário de Performance Mensal
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-surface-2 text-xs font-semibold px-2 py-1 rounded border border-border"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Mês {i + 1}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-surface-2 text-xs font-semibold px-2 py-1 rounded border border-border"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>

        {calendar && (
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-bold text-text border-b border-border pb-2">
              <span>Fechamento do Mês: <span className={calendar.total_month_pnl >= 0 ? 'text-up font-mono' : 'text-down font-mono'}>{fmtUSD(calendar.total_month_pnl)}</span></span>
              <span>Total de Operações: {calendar.total_month_trades}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {calendar.days.map((d: any, idx: number) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-2 text-center flex flex-col justify-between ${
                    d.pnl > 0 ? 'border-up/40 bg-up/10' : d.pnl < 0 ? 'border-down/40 bg-down/10' : 'border-border bg-surface-2'
                  }`}
                >
                  <span className="text-[10px] text-text-secondary font-mono">{d.date.slice(8)}</span>
                  <span className={`text-xs font-mono font-bold ${d.pnl >= 0 ? 'text-up' : 'text-down'}`}>{fmtUSD(d.pnl)}</span>
                  <span className="text-[9px] text-text-secondary">{d.total_trades} trade(s)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ title, value, subtext, highlight, icon: Icon }: any) {
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{title}</span>
        <Icon size={16} className="text-accent" />
      </div>
      <div className={`font-mono text-xl font-bold ${highlight === 'up' ? 'text-up' : highlight === 'down' ? 'text-down' : 'text-text'}`}>
        {value}
      </div>
      {subtext && <div className="text-[10px] text-text-secondary">{subtext}</div>}
    </div>
  )
}
