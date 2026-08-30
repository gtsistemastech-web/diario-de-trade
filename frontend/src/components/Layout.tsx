import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, CalendarDays, Menu, NotebookPen, Shield, Target, TrendingUp, X, PieChart, Settings } from 'lucide-react'
import { getSummary } from '../api/client'
import type { TradeSummary } from '../types'
import { fmtBRL, pnlClass } from '../utils/format'

const NAV = [
  { to: '/', label: 'Hoje', icon: CalendarDays, end: true },
  { to: '/trades', label: 'Operações', icon: TrendingUp },
  { to: '/analysis', label: 'Análise Geral', icon: PieChart },
  { to: '/journal', label: 'Diário', icon: NotebookPen },
  { to: '/strategies', label: 'Estratégias', icon: Target },
  { to: '/risk', label: 'Risco', icon: Shield },
  { to: '/stats', label: 'Estatísticas', icon: BarChart3 },
  { to: '/settings', label: 'Configurações', icon: Settings },
  { to: '/plan', label: 'Planejamento', icon: BookOpen },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [summary, setSummary] = useState<TradeSummary | null>(null)
  const location = useLocation()

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    getSummary({ from: today, to: today })
      .then(setSummary)
      .catch(() => setSummary(null))
  }, [location.pathname])

  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <SidebarContent summary={summary} todayLabel={todayLabel} onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Sidebar (mobile drawer) */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-border bg-surface">
            <SidebarContent summary={summary} todayLabel={todayLabel} onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden btn btn-ghost p-2"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="font-display text-sm font-semibold text-text capitalize">{todayLabel}</div>
              <div className="text-xs text-text-secondary">Diário de Trader</div>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <SummaryChip label="Operações" value={summary ? String(summary.count) : '—'} />
            <SummaryChip
              label="P&L hoje"
              value={summary ? fmtBRL(summary.total_pnl) : '—'}
              className={summary ? pnlClass(summary.total_pnl) : ''}
            />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ summary, todayLabel, onClose }: {
  summary: TradeSummary | null
  todayLabel: string
  onClose: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <TrendingUp size={20} />
        </div>
        <div>
          <div className="font-display text-base font-bold text-text">Diário de Trader</div>
          <div className="text-[11px] text-text-secondary">evolução & disciplina</div>
        </div>
        <button className="lg:hidden ml-auto p-1 text-text-secondary hover:text-text" onClick={onClose} aria-label="Fechar menu">
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-2 hover:text-text'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-4 pb-5">
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-secondary capitalize">{todayLabel}</div>
          <div className="mt-3 space-y-2">
            <Row label="P&L" value={summary ? fmtBRL(summary.total_pnl) : '—'} valueClass={summary ? pnlClass(summary.total_pnl) : ''} />
            <Row label="Operações" value={summary ? String(summary.count) : '—'} />
            <Row label="Acerto" value={summary ? `${summary.win_rate}%` : '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-mono font-medium ${valueClass || 'text-text'}`}>{value}</span>
    </div>
  )
}

function SummaryChip({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      <div className={`font-mono text-sm font-semibold ${className || 'text-text'}`}>{value}</div>
    </div>
  )
}
