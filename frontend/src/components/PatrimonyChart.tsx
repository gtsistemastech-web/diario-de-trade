import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtUSD } from '../utils/format'

export interface PatrimonyPoint {
  date: string
  time?: string | null
  asset?: string
  result: number
  accumulated: number
}

function formatTick(pt: PatrimonyPoint) {
  // "31/08 09:49" — data curta + hora, para dar a sensação de linha do tempo
  // contínua (igual ao gráfico de referência), não um ponto por dia.
  const [, m, d] = (pt.date || '').split('-')
  const time = pt.time ? pt.time.slice(0, 5) : ''
  return `${d}/${m}${time ? ' ' + time : ''}`
}

export default function PatrimonyChart({ data, height = 320 }: { data: PatrimonyPoint[]; height?: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-text-secondary" style={{ height }}>
        Sem trades no período selecionado para exibir a curva de patrimônio.
      </div>
    )
  }

  const chartData = data.map((pt, i) => ({
    ...pt,
    _label: formatTick(pt),
    _idx: i,
  }))

  const isOverallPositive = chartData[chartData.length - 1].accumulated >= 0

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="patrimonyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isOverallPositive ? '#3fb950' : '#f85149'} stopOpacity={0.45} />
            <stop offset="100%" stopColor={isOverallPositive ? '#3fb950' : '#f85149'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#21262d" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="_label"
          stroke="#8b949e"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#21262d' }}
          minTickGap={60}
        />
        <YAxis
          stroke="#8b949e"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => fmtUSD(v)}
          width={70}
        />
        <Tooltip
          contentStyle={{
            background: '#1c2128', border: '1px solid #30363d', borderRadius: 8,
            fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#e6edf3',
          }}
          labelFormatter={(_label: string, payload: any[]) => {
            const pt: PatrimonyPoint | undefined = payload?.[0]?.payload
            if (!pt) return _label
            return `${pt.date}${pt.time ? ' ' + pt.time.slice(0, 5) : ''}${pt.asset ? ' — ' + pt.asset : ''}`
          }}
          formatter={(value: number, name: string, item: any) => {
            if (name === 'accumulated') return [fmtUSD(value), 'Patrimônio Acumulado']
            return [fmtUSD(item?.payload?.result ?? value), 'Resultado da Operação']
          }}
        />
        <Area
          type="monotone"
          dataKey="accumulated"
          stroke={isOverallPositive ? '#3fb950' : '#f85149'}
          strokeWidth={2}
          fill="url(#patrimonyGrad)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
