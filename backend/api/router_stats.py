import logging
from collections import defaultdict
from datetime import datetime
from fastapi import APIRouter, Query
from .. import db
from .. import metrics

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def api_stats(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    journal = db.list_journal()
    return metrics.aggregate_stats(trades, journal)


@router.get("/overview")
def api_stats_overview(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    if not trades:
        return {
            "total_trades": 0,
            "total_pnl": 0.0,
            "win_rate": 0.0,
            "positive_trades": 0,
            "negative_trades": 0,
            "zero_trades": 0,
            "avg_gain": 0.0,
            "avg_loss": 0.0,
            "payoff": 0.0,
            "profit_factor": 0.0,
            "risk_return_ratio": 0.0,
            "avg_risk": 0.0,
            "max_gain": 0.0,
            "max_loss": 0.0,
        }

    total_trades = len(trades)
    total_pnl = sum(t["result"] for t in trades)
    
    pos_trades = [t for t in trades if t["result"] > 0]
    neg_trades = [t for t in trades if t["result"] < 0]
    zero_trades = [t for t in trades if t["result"] == 0]

    positive_count = len(pos_trades)
    negative_count = len(neg_trades)
    zero_count = len(zero_trades)

    win_rate = round((positive_count / total_trades) * 100, 2) if total_trades > 0 else 0.0

    gross_profit = sum(t["result"] for t in pos_trades)
    gross_loss = abs(sum(t["result"] for t in neg_trades))

    avg_gain = round(gross_profit / positive_count, 2) if positive_count > 0 else 0.0
    avg_loss = round(gross_loss / negative_count, 2) if negative_count > 0 else 0.0

    payoff = round(avg_gain / avg_loss, 2) if avg_loss > 0 else (avg_gain if avg_gain > 0 else 0.0)
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)

    risks = [t["risk_amount"] for t in trades if t.get("risk_amount") and t["risk_amount"] > 0]
    avg_risk = round(sum(risks) / len(risks), 2) if risks else 0.0

    risk_return_ratio = round(avg_gain / avg_risk, 2) if avg_risk > 0 else 0.0

    max_gain = max([t["result"] for t in trades], default=0.0)
    max_loss = min([t["result"] for t in trades], default=0.0)

    return {
        "total_trades": total_trades,
        "total_pnl": round(total_pnl, 2),
        "win_rate": win_rate,
        "positive_trades": positive_count,
        "negative_trades": negative_count,
        "zero_trades": zero_count,
        "avg_gain": avg_gain,
        "avg_loss": avg_loss,
        "payoff": payoff,
        "profit_factor": profit_factor,
        "risk_return_ratio": risk_return_ratio,
        "avg_risk": avg_risk,
        "max_gain": round(max_gain, 2),
        "max_loss": round(max_loss, 2),
    }


@router.get("/equity-curve")
def api_equity_curve(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    curve = []
    accumulated = 0.0
    for idx, t in enumerate(trades, 1):
        accumulated += t["result"]
        curve.append({
            "trade_num": idx,
            "date": t["date"],
            "time": t.get("time"),
            "asset": t["asset"],
            "result": round(t["result"], 2),
            "accumulated": round(accumulated, 2)
        })
    return curve


@router.get("/by-category")
def api_by_category(
    category: str = Query("event", description="event, context, location, asset, strategy"),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    grouped = defaultdict(list)

    name_field = f"{category}_name"
    id_field = f"{category}_id"

    for t in trades:
        key = "Desconhecido / Não informado"
        if category == "asset":
            key = t.get("asset") or key
        elif category == "strategy":
            key = t.get("strategy_name") or key
        else:
            key = t.get(name_field) or key
        grouped[key].append(t)

    result = []
    for cat_name, items in grouped.items():
        count = len(items)
        pnl = sum(i["result"] for i in items)
        wins = sum(1 for i in items if i["result"] > 0)
        losses = sum(1 for i in items if i["result"] < 0)
        win_rate = round((wins / count) * 100, 2) if count > 0 else 0.0
        avg_res = round(pnl / count, 2) if count > 0 else 0.0

        result.append({
            "category_name": cat_name,
            "total_trades": count,
            "total_pnl": round(pnl, 2),
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "avg_result": avg_res
        })

    result.sort(key=lambda x: x["total_pnl"], reverse=True)
    return result


@router.get("/by-trade-number")
def api_by_trade_number(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    by_day = defaultdict(list)
    for t in trades:
        by_day[t["date"]].append(t)

    by_num = defaultdict(list)
    for day_trades in by_day.values():
        for order_idx, t in enumerate(day_trades, 1):
            label = f"{order_idx}º Trade" if order_idx <= 10 else "10+ Trade"
            by_num[label].append(t)

    res = []
    for label, items in sorted(by_num.items(), key=lambda x: int(x[0].split('º')[0]) if 'º' in x[0] else 99):
        count = len(items)
        pnl = sum(i["result"] for i in items)
        wins = sum(1 for i in items if i["result"] > 0)
        win_rate = round((wins / count) * 100, 2) if count > 0 else 0.0

        res.append({
            "trade_order": label,
            "total_trades": count,
            "total_pnl": round(pnl, 2),
            "wins": wins,
            "win_rate": win_rate,
            "avg_result": round(pnl / count, 2) if count > 0 else 0.0
        })
    return res


@router.get("/temporal")
def api_temporal(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    
    weekday_names = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    by_weekday = defaultdict(list)
    by_hour = defaultdict(list)

    for t in trades:
        try:
            dt = datetime.strptime(t["date"], "%Y-%m-%d")
            w_name = weekday_names[dt.weekday()]
            by_weekday[w_name].append(t)
        except Exception:
            pass

        if t.get("time"):
            hour_str = t["time"].split(":")[0] + ":00"
            by_hour[hour_str].append(t)

    weekday_res = []
    for w in weekday_names:
        items = by_weekday[w]
        count = len(items)
        pnl = sum(i["result"] for i in items)
        wins = sum(1 for i in items if i["result"] > 0)
        weekday_res.append({
            "day": w,
            "total_trades": count,
            "total_pnl": round(pnl, 2),
            "win_rate": round((wins / count) * 100, 2) if count > 0 else 0.0
        })

    hour_res = []
    for h in sorted(by_hour.keys()):
        items = by_hour[h]
        count = len(items)
        pnl = sum(i["result"] for i in items)
        wins = sum(1 for i in items if i["result"] > 0)
        hour_res.append({
            "hour": h,
            "total_trades": count,
            "total_pnl": round(pnl, 2),
            "win_rate": round((wins / count) * 100, 2) if count > 0 else 0.0
        })

    return {"by_weekday": weekday_res, "by_hour": hour_res}


@router.get("/calendar")
def api_calendar(
    year: int = Query(2026),
    month: int = Query(8),
    account_id: str | None = None,
):
    month_str = f"{year:04d}-{month:02d}"
    trades = db.list_trades(from_date=f"{month_str}-01", to_date=f"{month_str}-31", account_id=account_id)

    by_day = defaultdict(list)
    for t in trades:
        by_day[t["date"]].append(t)

    daily_summary = []
    for date_str, items in by_day.items():
        pnl = sum(i["result"] for i in items)
        wins = sum(1 for i in items if i["result"] > 0)
        daily_summary.append({
            "date": date_str,
            "total_trades": len(items),
            "pnl": round(pnl, 2),
            "win_rate": round((wins / len(items)) * 100, 2)
        })

    return {
        "month": month_str,
        "total_month_pnl": round(sum(t["result"] for t in trades), 2),
        "total_month_trades": len(trades),
        "days": daily_summary
    }


@router.get("/errors")
def api_error_stats(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    account_id: str | None = None,
):
    trades = db.list_trades(from_date=from_date, to_date=to_date, account_id=account_id)
    error_map = defaultdict(lambda: {"count": 0, "total_loss": 0.0})

    for t in trades:
        errs = t.get("errors") or []
        for err in errs:
            error_map[err]["count"] += 1
            if t["result"] < 0:
                error_map[err]["total_loss"] += abs(t["result"])

    result = []
    for err_name, data in error_map.items():
        result.append({
            "error_name": err_name,
            "count": data["count"],
            "total_cost": round(data["total_loss"], 2)
        })

    result.sort(key=lambda x: x["count"], reverse=True)
    return result
