from datetime import date
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, model_validator

Direction = Literal["LONG", "SHORT"]
TradeSource = Literal["manual", "profitpro", "metatrader"]


class AccountIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency: str = "USD"
    initial_balance: float = Field(default=0.0, ge=0)
    current_balance: Optional[float] = None
    is_active: bool = False


class AccountOut(BaseModel):
    id: str
    name: str
    currency: str
    initial_balance: float
    current_balance: float
    is_active: bool
    created_at: str
    updated_at: str


class CustomOptionIn(BaseModel):
    category: str  # event, context, location, entry_type, error_type, asset
    code: Optional[str] = None
    name: str = Field(min_length=1, max_length=100)


class CustomOptionOut(BaseModel):
    id: str
    category: str
    code: Optional[str] = None
    name: str
    created_at: str


class TradeIn(BaseModel):
    date: date
    time: Optional[str] = None
    asset: str = Field(min_length=1, max_length=40)
    direction: Direction
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    quantity: Optional[float] = None
    result: Optional[float] = None
    fees: float = 0
    risk_amount: Optional[float] = None
    emotions: Optional[List[str]] = None
    notes: Optional[str] = None
    strategy_id: Optional[str] = None
    source: TradeSource = "manual"
    added_lots: Optional[int] = Field(default=None, ge=0)
    candle_size: Optional[str] = None
    account_id: Optional[str] = None
    currency: str = "USD"
    event_id: Optional[str] = None
    context_id: Optional[str] = None
    location_id: Optional[str] = None
    clean_left: bool = False
    first_bar: bool = False
    entry_type: Optional[str] = None
    has_addition: bool = False
    outcome_type: Optional[Literal["GAIN", "LOSS", "ZERO"]] = None
    errors: Optional[List[str]] = None

    @model_validator(mode="after")
    def _validate_prices(self):
        if self.candle_size is not None and self.candle_size not in ("Pequeno", "Médio", "Grande"):
            raise ValueError("candle_size deve ser 'Pequeno', 'Médio' ou 'Grande'")
        if self.entry_price is not None and self.entry_price == 0:
            raise ValueError("entry_price não pode ser 0")
        if self.quantity is not None and self.quantity <= 0:
            raise ValueError("quantity deve ser maior que 0")
        if self.fees < 0:
            raise ValueError("fees não pode ser negativa")
        return self


class TradeUpdate(BaseModel):
    date: Optional[date] = None
    time: Optional[str] = None
    asset: Optional[str] = None
    direction: Optional[Direction] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    quantity: Optional[float] = None
    result: Optional[float] = None
    fees: Optional[float] = None
    risk_amount: Optional[float] = None
    emotions: Optional[List[str]] = None
    notes: Optional[str] = None
    strategy_id: Optional[str] = None
    source: Optional[TradeSource] = None
    added_lots: Optional[int] = Field(default=None, ge=0)
    candle_size: Optional[str] = None
    account_id: Optional[str] = None
    currency: Optional[str] = None
    event_id: Optional[str] = None
    context_id: Optional[str] = None
    location_id: Optional[str] = None
    clean_left: Optional[bool] = None
    first_bar: Optional[bool] = None
    entry_type: Optional[str] = None
    has_addition: Optional[bool] = None
    outcome_type: Optional[Literal["GAIN", "LOSS", "ZERO"]] = None
    errors: Optional[List[str]] = None


class TradeOut(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    asset: str
    direction: str
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    quantity: Optional[float] = None
    result: float
    fees: float = 0
    r_multiple: Optional[float] = None
    risk_amount: Optional[float] = None
    emotions: List[str] = []
    notes: Optional[str] = None
    strategy_id: Optional[str] = None
    strategy_name: Optional[str] = None
    source: str = "manual"
    added_lots: Optional[int] = 0
    candle_size: Optional[str] = None
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    currency: str = "USD"
    event_id: Optional[str] = None
    event_name: Optional[str] = None
    context_id: Optional[str] = None
    context_name: Optional[str] = None
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    clean_left: bool = False
    first_bar: bool = False
    entry_type: Optional[str] = None
    has_addition: bool = False
    outcome_type: Optional[str] = None
    errors: List[str] = []
    created_at: str
    updated_at: str


class JournalIn(BaseModel):
    trade_id: Optional[str] = None
    date: date
    mood_score: Optional[int] = Field(default=None, ge=1, le=10)
    emotions: Optional[List[str]] = None
    discipline_rating: Optional[int] = Field(default=None, ge=1, le=10)
    errors: Optional[List[str]] = None
    lessons: Optional[str] = None


class JournalOut(BaseModel):
    id: str
    trade_id: Optional[str] = None
    date: str
    mood_score: Optional[int] = None
    emotions: List[str] = []
    discipline_rating: Optional[int] = None
    errors: List[str] = []
    lessons: Optional[str] = None
    created_at: str
    updated_at: str


class DayPlanIn(BaseModel):
    date: date
    scenarios: Optional[List[dict]] = None
    goals: Optional[List[dict]] = None
    levels: Optional[List[dict]] = None
    review: Optional[dict] = None
    risk_plan_id: Optional[str] = None


class DayPlanOut(BaseModel):
    id: str
    date: str
    scenarios: Optional[list] = None
    goals: Optional[list] = None
    levels: Optional[list] = None
    review: Optional[dict] = None
    risk_plan_id: Optional[str] = None
    created_at: str
    updated_at: str


class StrategyIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None
    setup: Optional[str] = None
    notes: Optional[str] = None


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    setup: Optional[str] = None
    notes: Optional[str] = None


class StrategyOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    setup: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class RiskPlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None
    daily_stop_loss: Optional[float] = Field(default=None, ge=0)
    max_trades_per_day: Optional[int] = Field(default=None, ge=0)
    max_risk_per_trade: Optional[float] = Field(default=None, ge=0)
    is_active: bool = False


class RiskPlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    daily_stop_loss: Optional[float] = Field(default=None, ge=0)
    max_trades_per_day: Optional[int] = Field(default=None, ge=0)
    max_risk_per_trade: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class RiskPlanOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    daily_stop_loss: Optional[float] = None
    max_trades_per_day: Optional[int] = None
    max_risk_per_trade: Optional[float] = None
    is_active: bool = False
    created_at: str
    updated_at: str


class RiskBindIn(BaseModel):
    date: date
    risk_plan_id: Optional[str] = None


class ImportMapping(BaseModel):
    """Mapeamento opcional para re-mapear colunas do CSV durante o import."""
    date: str
    time: Optional[str] = None
    asset: str
    direction: Optional[str] = None
    entry_price: Optional[str] = None
    exit_price: Optional[str] = None
    quantity: Optional[str] = None
    result: Optional[str] = None
    fees: Optional[str] = None
    risk_amount: Optional[str] = None
    strategy_id: Optional[str] = None
    notes: Optional[str] = None
