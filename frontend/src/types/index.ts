export type Direction = 'LONG' | 'SHORT'
export type TradeSource = 'manual' | 'profitpro' | 'metatrader'

export interface Strategy {
  id: string
  name: string
  description?: string | null
  setup?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface StrategyInput {
  name: string
  description?: string | null
  setup?: string | null
  notes?: string | null
}

export interface Account {
  id: string
  name: string
  currency: string
  initial_balance: number
  current_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AccountInput {
  name: string
  currency?: string
  initial_balance?: number
  current_balance?: number
  is_active?: boolean
}

export interface CustomOption {
  id: string
  category: string
  code?: string | null
  name: string
  created_at: string
}

export interface CustomOptionInput {
  category: string
  code?: string | null
  name: string
}

export interface Trade {
  id: string
  date: string // YYYY-MM-DD
  time?: string | null // HH:MM
  asset: string
  direction: Direction
  entry_price?: number | null
  exit_price?: number | null
  quantity?: number | null
  result: number
  fees: number
  r_multiple?: number | null
  risk_amount?: number | null
  emotions: string[]
  notes?: string | null
  strategy_id?: string | null
  strategy_name?: string | null
  source: TradeSource
  added_lots?: number | null
  candle_size?: string | null
  account_id?: string | null
  account_name?: string | null
  currency: string
  original_currency?: string | null
  fx_rate_used?: number | null
  event_id?: string | null
  event_name?: string | null
  context_id?: string | null
  context_name?: string | null
  location_id?: string | null
  location_name?: string | null
  clean_left: boolean
  first_bar: boolean
  entry_type?: string | null
  has_addition: boolean
  outcome_type?: 'GAIN' | 'LOSS' | 'ZERO' | null
  errors: string[]
  created_at: string
  updated_at: string
}

export interface TradeInput {
  date: string
  time?: string | null
  asset: string
  direction: Direction
  entry_price?: number | null
  exit_price?: number | null
  quantity?: number | null
  result?: number | null
  fees?: number
  risk_amount?: number | null
  emotions?: string[]
  notes?: string | null
  strategy_id?: string | null
  added_lots?: number | null
  candle_size?: string | null
  account_id?: string | null
  currency?: string
  event_id?: string | null
  context_id?: string | null
  location_id?: string | null
  clean_left?: boolean
  first_bar?: boolean
  entry_type?: string | null
  has_addition?: boolean
  outcome_type?: 'GAIN' | 'LOSS' | 'ZERO' | null
  errors?: string[]
}

export interface JournalEntry {
  id: string
  trade_id?: string | null
  date: string
  mood_score?: number | null
  emotions: string[]
  discipline_rating?: number | null
  errors: string[]
  lessons?: string | null
  created_at: string
  updated_at: string
}

export interface EquityPoint {
  date: string
  time?: string | null
  pnl: number
  cumulative: number
}

export interface PnlByDay {
  date: string
  pnl: number
}

export interface GroupedPnl {
  name: string
  pnl: number
  count: number
  hour?: string
}

export interface StrategyPnl {
  name: string
  pnl: number
  count: number
  win_rate: number
  avg_r: number | null
}

// ---- Gestão de Risco (GR) ----

export interface RiskPlan {
  id: string
  name: string
  description?: string | null
  daily_stop_loss?: number | null
  max_trades_per_day?: number | null
  max_risk_per_trade?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RiskPlanInput {
  name: string
  description?: string | null
  daily_stop_loss?: number | null
  max_trades_per_day?: number | null
  max_risk_per_trade?: number | null
  is_active?: boolean
}

export interface RiskViolation {
  type: string
  title: string
  message: string
  trade_index?: number
}

export interface RiskLimits {
  daily_stop_loss?: number | null
  max_trades_per_day?: number | null
  max_risk_per_trade?: number | null
}

export type ComplianceStatus = 'conformidade' | 'violacao' | 'sem_gr' | 'sem_trades'

export interface DailyCompliance {
  date: string
  risk_plan_name?: string | null
  status: ComplianceStatus
  violations: RiskViolation[]
  limits?: RiskLimits | null
  pnl: number
  trades: number
}

export interface RiskOverview {
  days_tracked: number
  days_compliant: number
  days_violating: number
  days_without_gr: number
  compliance_rate: number | null
  violations_by_type: { type: string; title: string; count: number }[]
  days: DailyCompliance[]
  plans: RiskPlan[]
}

export interface Stats {
  total_trades: number
  total_wins: number
  total_losses: number
  total_pnl: number
  win_rate: number
  profit_factor: number
  payoff_ratio: number
  avg_win: number
  avg_loss: number
  expectancy: number
  expectancy_r: number | null
  max_drawdown: number
  max_drawdown_days: number
  streaks: { max_win_streak: number; max_loss_streak: number }
  equity_curve: EquityPoint[]
  pnl_by_day: PnlByDay[]
  pnl_by_asset: GroupedPnl[]
  pnl_by_direction: GroupedPnl[]
  pnl_by_strategy: StrategyPnl[]
  pnl_by_hour: GroupedPnl[]
  pnl_by_weekday: WeekdayPnl[]
  pnl_by_asset_direction: AssetDirectionPnl[]
  added_lots: AddedLotsStats
  candle_size: CandleSizePnl[]
  r_multiple_distribution: { r: number; count: number }[]
  emotion_frequency?: { emotion: string; count: number }[]
}

export interface WeekdayPnl {
  weekday: string
  pnl: number
  count: number
  win_rate: number
}

export interface AssetDirectionPnl {
  asset: string
  long_pnl: number
  long_count: number
  long_win_rate: number
  short_pnl: number
  short_count: number
  short_win_rate: number
  best: 'LONG' | 'SHORT'
  best_pnl: number
}

export interface LotsBucket {
  count: number
  total_pnl: number
  avg_pnl: number
  win_rate: number
}

export interface AddedLotsStats {
  with_lots: LotsBucket
  without_lots: LotsBucket
  distribution: { lots: number; count: number }[]
}

export interface CandleSizePnl {
  candle_size: string
  count: number
  total_pnl: number
  avg_pnl: number
  win_rate: number
}

export interface TradesResponse {
  trades: Trade[]
  count: number
}

export interface TradeSummary {
  count: number
  total_pnl: number
  wins: number
  losses: number
  win_rate: number
  avg_result: number
}

export interface JournalResponse {
  journal: JournalEntry[]
  count: number
}

export interface ImportPreview {
  preview_id: string
  filename: string
  format: string
  columns_detected: string[]
  mapping: Record<string, string>
  total_rows: number
  total_trades: number
  skipped: number
  sample: Partial<Trade>[]
  total_pnl_preview: number
}
