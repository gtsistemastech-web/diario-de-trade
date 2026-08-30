import { Area, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EquityPoint } from '../types'
import { fmtBRL, fmtDate } from '../utils/format'

export default function EquityChart({ data, height = 260 }: { data: EquityPoint[]; height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-text-secondary">
        Sem trades para exibir a curva de equity.
      </div>
    )
  }

  // Acrescenta drawdown acumulado (distância do pico) para o overlay
  const withDD = (() => {
    let peak = 0
    let cum = 0
    return data.map((p) => {
      cum += p.pnl
      peak = Math.max(peak, cum)
      return { ...p, drawdown: +(peak - cum).toFixed(2) }
    })
  })()

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={withDD} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => fmtDate(v)}
          stroke="#8b949e"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#21262d' }}
          minTickGap={40}
        />
        <YAxis
          stroke="#8b949e"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`}
          width={70}
        />
        <Tooltip
          contentStyle={{
            background: '#1c2128', border: '1px solid #30363d', borderRadius: 8,
            fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#e6edf3',
          }}
          labelFormatter={(v: string) => fmtDate(v)}
          formatter={(value: number | string, name: string) => {
            const v = Number(value)
            if (name === 'drawdown') return [fmtBRL(v), 'Drawdown']
            return [fmtBRL(v), 'Equity']
          }}
        />
        <Area
          dataKey="drawdown"
          stroke="#f85149"
          strokeOpacity={0.4}
          fill="#f85149"
          fillOpacity={0.08}
          connectNulls
        />
        <Area
          dataKey="cumulative"
          stroke="#3fb950"
          strokeWidth={2}
          fill="url(#equityGrad)"
          fillOpacity={0.18}
          connectNulls
        />
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3fb950" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#3fb950" stopOpacity={0} />
          </linearGradient>
        </defs>
      </ComposedChart>
    </ResponsiveContainer>
  )
}
