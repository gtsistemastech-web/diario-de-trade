import logging

from fastapi import APIRouter, HTTPException, Query

from .. import db, fx
from ..models import TradeIn, TradeUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


def _compute_pnl(payload: dict) -> dict:
    """Calcula result e r_multiple a partir dos dados do trade.

    Regras do formato flexível ("ambos"):
    - Se entry_price e exit_price e quantity presentes → calcula P&L pela fórmula.
    - Senão → usa o resultado manual (payload['result']) informado pelo usuário.
    - fees é sempre subtraída do resultado.
    - r_multiple = result / risk_amount quando risk_amount informado.
    """
    data = dict(payload)
    fees = data.get("fees") or 0
    result = data.get("result")

    entry = data.get("entry_price")
    exit_ = data.get("exit_price")
    qty = data.get("quantity")
    direction = data.get("direction")

    if entry is not None and exit_ is not None and qty:
        if direction == "LONG":
            gross = (exit_ - entry) * qty
        elif direction == "SHORT":
            gross = (entry - exit_) * qty
        else:
            gross = 0.0
        result = gross - fees
    elif result is None:
        raise HTTPException(status_code=400, detail=(
            "Informe preços (entry/exit/quantity) OU o resultado manual em R$."
        ))

    result = float(result) - fees

    r_multiple = None
    risk_amount = data.get("risk_amount")
    if risk_amount and risk_amount > 0:
        r_multiple = round(result / risk_amount, 3)

    data["result"] = round(result, 2)
    data["r_multiple"] = r_multiple

    # Trava de segurança: outcome_type sempre reflete o sinal real do
    # resultado (nunca é apenas um rótulo solto que pode ficar
    # dessincronizado do valor, seja qual for a origem — manual, CSV, etc.).
    if data["result"] > 0:
        data["outcome_type"] = "GAIN"
    elif data["result"] < 0:
        data["outcome_type"] = "LOSS"
    else:
        data["outcome_type"] = "ZERO"

    return data


def _apply_currency_conversion(data: dict) -> dict:
    """Se a operação foi digitada em reais (BRL), converte os valores
    monetários para dólar (moeda padrão de armazenamento do sistema),
    usando a cotação atual. Guarda a moeda original e a cotação usada
    para referência/transparência, mas o valor armazenado (currency)
    é sempre USD.

    Se já estiver em USD (ou sem moeda informada), não faz nada além de
    normalizar o campo currency para 'USD'.
    """
    currency = (data.get("currency") or "USD").upper()

    if currency != "BRL":
        data["currency"] = "USD"
        data.setdefault("original_currency", None)
        data.setdefault("fx_rate_used", None)
        return data

    fx_info = fx.get_usd_brl_rate()
    rate = fx_info["rate"]

    for field in ("result", "risk_amount", "fees"):
        val = data.get(field)
        if val is not None:
            data[field] = fx.brl_to_usd(val, rate)

    data["original_currency"] = "BRL"
    data["fx_rate_used"] = rate
    data["currency"] = "USD"
    return data


@router.get("/trades")
def api_list_trades(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    asset: str | None = None,
    direction: str | None = None,
    source: str | None = None,
    strategy_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, asset=asset,
                            direction=direction, source=source, strategy_id=strategy_id)
    return {"trades": trades, "count": len(trades)}


@router.post("/trades")
def api_create_trade(payload: TradeIn):
    try:
        data = _compute_pnl(payload.model_dump())
        data = _apply_currency_conversion(data)
        trade = db.create_trade(data)
        return {"status": "ok", "trade": trade}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao criar trade")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/trades/{trade_id}")
def api_update_trade(trade_id: str, payload: TradeUpdate):
    try:
        existing = db.get_trade(trade_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Trade não encontrado.")
        merged = {**existing, **payload.model_dump(exclude_unset=True)}
        data = _compute_pnl(merged)
        data = _apply_currency_conversion(data)
        trade = db.update_trade(trade_id, data)
        return {"status": "ok", "trade": trade}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao atualizar trade")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/trades/{trade_id}")
def api_delete_trade(trade_id: str):
    try:
        ok = db.delete_trade(trade_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Trade não encontrado.")
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao deletar trade")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/trades")
def api_delete_all_trades():
    """Apaga todas as operações cadastradas (mantém estratégias, plano e risco)."""
    try:
        n = db.delete_all_trades()
        return {"status": "ok", "deleted": n}
    except Exception as e:
        logger.exception("Erro ao limpar todos os trades")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trades/summary")
def api_trades_summary(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
):
    trades = db.list_trades(from_date=from_date, to_date=to_date)
    if not trades:
        return {
            "count": 0, "total_pnl": 0, "wins": 0, "losses": 0,
            "win_rate": 0, "avg_result": 0,
        }
    wins = sum(1 for t in trades if t["result"] > 0)
    losses = sum(1 for t in trades if t["result"] < 0)
    total = sum(t["result"] for t in trades)
    return {
        "count": len(trades),
        "total_pnl": round(total, 2),
        "wins": wins,
        "losses": losses,
        "win_rate": round(100.0 * wins / len(trades), 2),
        "avg_result": round(total / len(trades), 2),
    }
