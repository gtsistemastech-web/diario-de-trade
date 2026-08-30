import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getRiskOverview, getStats } from '../api/client'
import type { RiskOverview, Stats } from '../types'
import StatCard from '../components/StatCard'
import EquityChart from '../components/EquityChart'
import { fmtBRL, fmtDate, fmtNum, fmtPct, pnlClass } from '../utils/format'

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [riskOv, setRiskOv] = useState<RiskOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar estatísticas.'))
    getRiskOverview()
      .then(setRiskOv)
      .catch(() => setRiskOv(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-10 text-center text-sm text-text-secondary">Carregando estatísticas...</div>
  if (error) return <div className="rounded-lg bg-down/10 p-4 text-sm text-down">{error}</div>
  if (!stats || stats.total_trades === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-text">Ainda sem dados</p>
        <p className="mt-1 text-sm text-text-secondary">Registre operações para ver suas estatísticas.</p>
      </div>
    )
  }

  const t = stats

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">Estatísticas</h1>
        <p className="mt-1 text-sm text-text-secondary">{t.total_trades} operações no período.</p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="P&L total" value={fmtBRL(t.total_pnl)} valueClass={`font-display text-2xl ${pnlClass(t.total_pnl)}`} />
        <StatCard label="Acerto" value={fmtPct(t.win_rate)} sub={`${t.total_wins}W / ${t.total_losses}L`} />
        <StatCard label="Profit factor" value={fmtNum(t.profit_factor)} sub={`média win ${fmtBRL(t.avg_win)}`} />
        <StatCard label="Expectancy" value={fmtBRL(t.expectancy)} valueClass={pnlClass(t.expectancy)} sub={t.expectancy_r != null ? `${t.expectancy_r}R por trade` : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Payoff" value={fmtNum(t.payoff_ratio)} sub={`média loss ${fmtBRL(t.avg_loss)}`} />
        <StatCard label="Max drawdown" value={fmtBRL(-t.max_drawdown)} valueClass="text-down" sub={`${t.max_drawdown_days} trades de duração`} />
        <StatCard label="Sequência verde" value={String(t.streaks.max_win_streak)} />
        <StatCard label="Sequência vermelha" value={String(t.streaks.max_loss_streak)} valueClass="text-down" />
      </div>

      {/* Conformidade ao GR */}
      {riskOv && riskOv.days_tracked > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-text">Conformidade ao GR</h2>
            <span className="text-xs text-text-secondary">{riskOv.days_tracked} dias avaliados</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Taxa de conformidade" value={riskOv.compliance_rate != null ? `${riskOv.compliance_rate.toFixed(1)}%` : '—'} />
            <StatCard label="Dias conformes" value={String(riskOv.days_compliant)} valueClass="text-up" />
            <StatCard label="Dias em violação" value={String(riskOv.days_violating)} valueClass="text-down" />
            <StatCard label="Dias sem GR" value={String(riskOv.days_without_gr)} />
          </div>
          {riskOv.violations_by_type.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {riskOv.violations_by_type.map((v) => (
                <span key={v.type} className="badge bg-down/10 text-down">
                  {v.title} · {v.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Equity curve */}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-text">Curva de equity</h2>
          <span className={`font-mono text-sm ${pnlClass(t.total_pnl)}`}>{fmtBRL(t.total_pnl)}</span>
        </div>
        <EquityChart data={t.equity_curve} height={280} />
      </div>

      {/* P&L por dia + por hora */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">P&L por dia</h2>
          <BarChartBy data={t.pnl_by_day.map((d) => ({ name: fmtDate(d.date), ...d }))} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">P&L por hora do dia</h2>
          {(() => {
            const best = [...t.pnl_by_hour].sort((a, b) => b.pnl - a.pnl)[0]
            return best ? (
              <div className="mb-2 text-xs text-text-secondary">
                Melhor horário: <span className="font-mono font-semibold text-up">{best.hour} · {fmtBRL(best.pnl)}</span>
              </div>
            ) : null
          })()}
          <BarChartBy data={t.pnl_by_hour.map((h) => ({ name: h.hour ?? '—', pnl: h.pnl, count: h.count }))} />
        </div>
      </div>

      {/* Análises de contexto: melhor dia da semana + lote adicionado */}
      {t.pnl_by_weekday && t.pnl_by_weekday.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-text">Melhor dia da semana</h2>
            <div className="space-y-2">
              {[...t.pnl_by_weekday].sort((a, b) => b.pnl - a.pnl).map((d, i) => (
                <div key={d.weekday} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.weekday}</span>
                    {i === 0 && <span className="badge bg-up/10 text-up">melhor</span>}
                  </div>
                  <span className="text-xs text-text-secondary">{d.count} op. · {d.win_rate}%</span>
                  <span className={`font-mono ${pnlClass(d.pnl)}`}>{fmtBRL(d.pnl)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
              Melhor dia: <span className="font-semibold text-text">
                {[...t.pnl_by_weekday].sort((a, b) => b.pnl - a.pnl)[0].weekday}
              </span>
            </p>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-text">Lote adicionado</h2>
            <div className="grid grid-cols-2 gap-3">
              <LotsBucketCard
                title="Sem lote extra"
                bucket={t.added_lots.without_lots}
                className="text-up"
              />
              <LotsBucketCard
                title="Com lote extra"
                bucket={t.added_lots.with_lots}
                className="text-down"
              />
            </div>
            {t.added_lots.distribution.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {t.added_lots.distribution.map((d) => (
                  <span key={d.lots} className="badge bg-surface-2 text-text-secondary">
                    {d.lots === 0 ? '0 (sem)' : `+${d.lots}`} · {d.count}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compra × Venda por ativo */}
      {t.pnl_by_asset_direction && t.pnl_by_asset_direction.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">Compra × Venda por ativo</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="px-2 py-2">Ativo</th>
                  <th className="px-2 py-2 text-right">Compra (LONG)</th>
                  <th className="px-2 py-2 text-right">Venda (SHORT)</th>
                  <th className="px-2 py-2 text-right">Melhor</th>
                </tr>
              </thead>
              <tbody>
                {t.pnl_by_asset_direction.map((a) => (
                  <tr key={a.asset} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-2 font-medium">{a.asset}</td>
                    <td className="px-2 py-2 text-right font-mono text-xs">
                      <span className={pnlClass(a.long_pnl)}>{fmtBRL(a.long_pnl)}</span>
                      <span className="ml-1 text-[10px] text-text-secondary">{a.long_count} op.</span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-xs">
                      <span className={pnlClass(a.short_pnl)}>{fmtBRL(a.short_pnl)}</span>
                      <span className="ml-1 text-[10px] text-text-secondary">{a.short_count} op.</span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={`badge ${a.best === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                        {a.best}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Por direção + tamanho do candle */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">P&L por direção</h2>
          <div className="space-y-2">
            {t.pnl_by_direction.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className={`badge ${d.name === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>{d.name}</span>
                <span className="text-xs text-text-secondary">{d.count} op.</span>
                <span className={`font-mono ${pnlClass(d.pnl)}`}>{fmtBRL(d.pnl)}</span>
              </div>
            ))}
          </div>
        </div>

        {t.candle_size && t.candle_size.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-text">Tamanho do candle</h2>
            <div className="space-y-2">
              {t.candle_size.map((c) => (
                <div key={c.candle_size} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.candle_size}</span>
                    <span className="text-xs text-text-secondary">{c.count} op. · {c.win_rate}%</span>
                  </div>
                  <span className={`font-mono ${pnlClass(c.total_pnl)}`}>{fmtBRL(c.total_pnl)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Por estratégia */}
      {t.pnl_by_strategy && t.pnl_by_strategy.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">P&L por estratégia</h2>
          <div className="space-y-2">
            {t.pnl_by_strategy.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-2 text-xs text-text-secondary">{s.count} op. · acerto {s.win_rate}% · {s.avg_r != null ? `${s.avg_r}R médio` : '—'}</span>
                </div>
                <span className={`shrink-0 font-mono ${pnlClass(s.pnl)}`}>{fmtBRL(s.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R-múltiplos */}
      {t.r_multiple_distribution.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">Distribuição de R-múltiplos</h2>
          <div className="flex h-32 items-end gap-1">
            {t.r_multiple_distribution.map((b) => (
              <div key={b.r} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${b.r >= 0 ? 'bg-up/60' : 'bg-down/60'}`}
                  style={{ height: `${Math.max(4, (b.count / Math.max(...t.r_multiple_distribution.map((x) => x.count))) * 120)}px` }}
                  title={`${b.r}R: ${b.count}`}
                />
                <span className="font-mono text-[10px] text-text-secondary">{b.r}R</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emoções */}
      {t.emotion_frequency && t.emotion_frequency.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 font-display text-sm font-semibold text-text">Emoções mais registradas</h2>
          <div className="flex flex-wrap gap-2">
            {t.emotion_frequency.map((e) => (
              <span key={e.emotion} className="badge bg-accent/15 px-3 py-1.5 text-accent">
                {e.emotion} · {e.count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LotsBucketCard({ title, bucket, className = '' }: { title: string; bucket: { count: number; total_pnl: number; avg_pnl: number; win_rate: number }; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{title}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${className || 'text-text'}`}>{fmtBRL(bucket.total_pnl)}</div>
      <div className="mt-1 text-xs text-text-secondary">
        {bucket.count} op. · {bucket.win_rate}% · média {fmtBRL(bucket.avg_pnl)}
      </div>
    </div>
  )
}

function BarChartBy({ data }: { data: { name: string; pnl: number; count?: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="name" stroke="#8b949e" fontSize={10} tickLine={false} axisLine={{ stroke: '#21262d' }} interval={0} angle={-35} height={50} textAnchor="end" />
        <YAxis stroke="#8b949e" fontSize={10} tickLine={false} axisLine={false} width={55} tickFormatter={(v: number) => `${Math.round(v)}`} />
        <Tooltip
          contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 8, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#e6edf3' }}
          formatter={(value: number | string, name: string) => {
            const v = Number(value)
            return name === 'count' ? [v, 'Qtd'] : [fmtBRL(v), 'P&L']
          }}
        />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pnl >= 0 ? '#3fb950' : '#f85149'} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
