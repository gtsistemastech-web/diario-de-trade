import type { Account, AccountInput, CustomOption, CustomOptionInput, ImportPreview, JournalEntry, JournalResponse, RiskOverview, RiskPlan, RiskPlanInput, Stats, Strategy, StrategyInput, Trade, TradeInput, TradeSummary, TradesResponse } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: options?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = `Erro ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

// ---- Accounts ----
export const listAccounts = () => request<Account[]>('/accounts')
export const createAccount = (acc: AccountInput) => request<Account>('/accounts', { method: 'POST', body: JSON.stringify(acc) })
export const updateAccount = (id: string, acc: AccountInput) => request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(acc) })
export const activateAccount = (id: string) => request<Account>(`/accounts/${id}/activate`, { method: 'POST' })
export const deleteAccount = (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' })

// ---- Options ----
export const listOptions = (category?: string) => request<CustomOption[]>(`/options${category ? `?category=${category}` : ''}`)
export const createOption = (opt: CustomOptionInput) => request<CustomOption>('/options', { method: 'POST', body: JSON.stringify(opt) })
export const deleteOption = (id: string) => request<void>(`/options/${id}`, { method: 'DELETE' })

// ---- Trades ----
export const listTrades = (params?: { from?: string; to?: string; asset?: string; direction?: string; source?: string; strategy_id?: string; account_id?: string; event_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.asset) qs.set('asset', params.asset)
  if (params?.direction) qs.set('direction', params.direction)
  if (params?.source) qs.set('source', params.source)
  if (params?.strategy_id) qs.set('strategy_id', params.strategy_id)
  if (params?.account_id) qs.set('account_id', params.account_id)
  if (params?.event_id) qs.set('event_id', params.event_id)
  const q = qs.toString()
  return request<TradesResponse>(`/trades${q ? `?${q}` : ''}`)
}

export const createTrade = (trade: TradeInput) =>
  request<{ status: string; trade: Trade }>('/trades', { method: 'POST', body: JSON.stringify(trade) })

export const updateTrade = (id: string, trade: TradeInput) =>
  request<{ status: string; trade: Trade }>(`/trades/${id}`, { method: 'PUT', body: JSON.stringify(trade) })

export const deleteTrade = (id: string) =>
  request<{ status: string }>(`/trades/${id}`, { method: 'DELETE' })

export const getSummary = (params?: { from?: string; to?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  const q = qs.toString()
  return request<TradeSummary>(`/trades/summary${q ? `?${q}` : ''}`)
}

// ---- Stats Avançadas ----
export const getStats = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<Stats>(`/stats${q ? `?${q}` : ''}`)
}

export const getStatsOverview = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<any>(`/stats/overview${q ? `?${q}` : ''}`)
}

export const getEquityCurve = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<any[]>(`/stats/equity-curve${q ? `?${q}` : ''}`)
}

export const getStatsByCategory = (category: string, params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  qs.set('category', category)
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  return request<any[]>(`/stats/by-category?${qs.toString()}`)
}

export const getStatsByTradeNumber = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<any[]>(`/stats/by-trade-number${q ? `?${q}` : ''}`)
}

export const getTemporalStats = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<{ by_weekday: any[]; by_hour: any[] }>(`/stats/temporal${q ? `?${q}` : ''}`)
}

export const getCalendarStats = (year: number, month: number, account_id?: string) => {
  const qs = new URLSearchParams({ year: year.toString(), month: month.toString() })
  if (account_id) qs.set('account_id', account_id)
  return request<any>(`/stats/calendar?${qs.toString()}`)
}

export const getErrorStats = (params?: { from?: string; to?: string; account_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.account_id) qs.set('account_id', params.account_id)
  const q = qs.toString()
  return request<any[]>(`/stats/errors${q ? `?${q}` : ''}`)
}

// ---- Journal ----
export const listJournal = (params?: { date?: string; trade_id?: string }) => {
  const qs = new URLSearchParams()
  if (params?.date) qs.set('date', params.date)
  if (params?.trade_id) qs.set('trade_id', params.trade_id)
  const q = qs.toString()
  return request<JournalResponse>(`/journal${q ? `?${q}` : ''}`)
}

export const createJournal = (entry: Partial<JournalEntry>) =>
  request<{ status: string; entry: JournalEntry }>('/journal', { method: 'POST', body: JSON.stringify(entry) })

export const updateJournal = (id: string, entry: Partial<JournalEntry>) =>
  request<{ status: string; entry: JournalEntry }>(`/journal/${id}`, { method: 'PUT', body: JSON.stringify(entry) })

export const deleteJournal = (id: string) =>
  request<{ status: string }>(`/journal/${id}`, { method: 'DELETE' })

// ---- Strategies ----
export const listStrategies = () =>
  request<{ strategies: Strategy[]; count: number }>('/strategies')

export const createStrategy = (strategy: StrategyInput) =>
  request<{ status: string; strategy: Strategy }>('/strategies', { method: 'POST', body: JSON.stringify(strategy) })

export const updateStrategy = (id: string, strategy: StrategyInput) =>
  request<{ status: string; strategy: Strategy }>(`/strategies/${id}`, { method: 'PUT', body: JSON.stringify(strategy) })

export const deleteStrategy = (id: string, force = false) =>
  request<{ status: string }>(`/strategies/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })

// ---- Gestão de Risco (GR) ----
export const listRiskPlans = () =>
  request<{ risk_plans: RiskPlan[]; count: number }>('/risk-plans')

export const createRiskPlan = (plan: RiskPlanInput) =>
  request<{ status: string; risk_plan: RiskPlan }>('/risk-plans', { method: 'POST', body: JSON.stringify(plan) })

export const updateRiskPlan = (id: string, plan: RiskPlanInput) =>
  request<{ status: string; risk_plan: RiskPlan }>(`/risk-plans/${id}`, { method: 'PUT', body: JSON.stringify(plan) })

export const deleteRiskPlan = (id: string, force = false) =>
  request<{ status: string }>(`/risk-plans/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' })

export const setActiveRiskPlan = (id: string) =>
  request<{ status: string; risk_plan: RiskPlan }>(`/risk-plans/${id}/active`, { method: 'PUT' })

export const bindRiskPlan = (date: string, risk_plan_id: string | null) =>
  request<{ status: string; day_plan: unknown }>('/risk/days/' + date, {
    method: 'PUT',
    body: JSON.stringify({ date, risk_plan_id }),
  })

export const getRiskOverview = (params?: { from?: string; to?: string }) => {
  const qs = new URLSearchParams()
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  const q = qs.toString()
  return request<RiskOverview>(`/risk/overview${q ? `?${q}` : ''}`)
}

// ---- Import ----
export const importPreview = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<{ status: string; preview: ImportPreview }>('/import/preview', { method: 'POST', body: form })
}

export const importConfirm = (preview_id: string) =>
  request<{ status: string; created: number }>('/import/confirm', { method: 'POST', body: JSON.stringify({ preview_id }) })
