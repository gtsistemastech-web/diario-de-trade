"""Cálculo de métricas do diário de trader.

Funções puras: recebem listas de trades (dicts) e devolvem números/estruturas
JSON-serializáveis. Sem estado, sem IO — fáceis de testar.
"""
from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean


def equity_curve(trades):
    """P&L acumulado ordenado por data/hora. Retorna lista de {date, pnl, cumulative}."""
    ordered = sorted(trades, key=lambda t: (t.get("date", ""), t.get("time", "") or ""))
    cumulative = 0.0
    points = []
    for t in ordered:
        cumulative += t.get("result", 0)
        points.append({
            "date": t.get("date"),
            "time": t.get("time"),
            "pnl": round(t.get("result", 0), 2),
            "cumulative": round(cumulative, 2),
        })
    return points


def win_rate(trades):
    if not trades:
        return 0.0
    wins = sum(1 for t in trades if t.get("result", 0) > 0)
    return round(100.0 * wins / len(trades), 2)


def _gross(trades):
    wins = [t.get("result", 0) for t in trades if t.get("result", 0) > 0]
    losses = [t.get("result", 0) for t in trades if t.get("result", 0) < 0]
    return wins, losses


def profit_factor(trades):
    wins, losses = _gross(trades)
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    if gross_loss == 0:
        return gross_profit if gross_profit > 0 else 0.0
    return round(gross_profit / gross_loss, 3)


def payoff_ratio(trades):
    wins, losses = _gross(trades)
    if not wins or not losses:
        return 0.0
    avg_win = mean(wins)
    avg_loss = abs(mean(losses))
    if avg_loss == 0:
        return 0.0
    return round(avg_win / avg_loss, 3)


def avg_win(trades):
    wins, _ = _gross(trades)
    return round(mean(wins), 2) if wins else 0.0


def avg_loss(trades):
    _, losses = _gross(trades)
    return round(mean(losses), 2) if losses else 0.0


def expectancy(trades):
    if not trades:
        return 0.0
    return round(mean(t.get("result", 0) for t in trades), 2)


def expectancy_r(trades):
    """Expectancy em R-múltiplos (soma de r_multiple / n)."""
    vals = [t.get("r_multiple") for t in trades if t.get("r_multiple") is not None]
    if not vals:
        return None
    return round(mean(vals), 3)


def max_drawdown(trades):
    """Maior queda da curva de equity (em R$), com duração em dias úteis de trading."""
    peak = 0.0
    max_dd = 0.0
    cum = 0.0
    dd_days = 0
    max_dd_days = 0
    for t in sorted(trades, key=lambda x: (x.get("date", ""), x.get("time", "") or "")):
        cum += t.get("result", 0)
        if cum > peak:
            peak = cum
            dd_days = 0
        else:
            dd = peak - cum
            dd_days += 1
            if dd > max_dd:
                max_dd = dd
                max_dd_days = dd_days
    return {"max_drawdown": round(max_dd, 2), "max_drawdown_days": max_dd_days, "peak_equity": round(peak, 2)}


def total_pnl(trades):
    return round(sum(t.get("result", 0) for t in trades), 2)


def pnl_by_day(trades):
    grouped = defaultdict(float)
    for t in trades:
        grouped[t.get("date")] += t.get("result", 0)
    return [{"date": d, "pnl": round(v, 2)} for d, v in sorted(grouped.items())]


def pnl_by_asset(trades):
    grouped = defaultdict(float)
    counts = defaultdict(int)
    for t in trades:
        grouped[t.get("asset")] += t.get("result", 0)
        counts[t.get("asset")] += 1
    return [{"asset": a, "pnl": round(v, 2), "count": counts[a]}
            for a, v in sorted(grouped.items(), key=lambda x: -x[1])]


def pnl_by_strategy(trades):
    """P&L, nº de operações, win rate e R-múltiplo médio por estratégia."""
    grouped = defaultdict(float)
    counts = defaultdict(int)
    wins = defaultdict(int)
    r_values = defaultdict(list)
    for t in trades:
        name = t.get("strategy_name")
        if not name:
            continue
        grouped[name] += t.get("result", 0)
        counts[name] += 1
        if t.get("result", 0) > 0:
            wins[name] += 1
        if t.get("r_multiple") is not None:
            r_values[name].append(t.get("r_multiple"))
    return [{
        "name": name,
        "pnl": round(grouped[name], 2),
        "count": counts[name],
        "win_rate": round(100.0 * wins[name] / counts[name], 2),
        "avg_r": round(mean(r_values[name]), 3) if r_values[name] else None,
    } for name in sorted(grouped, key=lambda n: -grouped[n])]


def pnl_by_direction(trades):
    grouped = defaultdict(float)
    counts = defaultdict(int)
    for t in trades:
        grouped[t.get("direction")] += t.get("result", 0)
        counts[t.get("direction")] += 1
    return [{"direction": d, "pnl": round(v, 2), "count": counts[d]}
            for d, v in grouped.items()]


def pnl_by_hour(trades):
    """P&L por hora do dia (usa 'time' se presente)."""
    grouped = defaultdict(float)
    counts = defaultdict(int)
    for t in trades:
        hour = "?"
        if t.get("time"):
            try:
                hour = t["time"].split(":")[0] + "h"
            except Exception:
                hour = "?"
        grouped[hour] += t.get("result", 0)
        counts[hour] += 1
    return [{"hour": h, "pnl": round(v, 2), "count": counts[h]}
            for h, v in sorted(grouped.items())]


WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


def pnl_by_weekday(trades):
    """P&L, nº de operações e win rate por dia da semana (Segunda–Sexta)."""
    grouped = defaultdict(float)
    counts = defaultdict(int)
    wins = defaultdict(int)
    for t in trades:
        d = t.get("date", "")
        try:
            idx = datetime.strptime(d, "%Y-%m-%d").weekday()
        except Exception:
            continue
        if idx >= 5:
            continue
        wd = WEEKDAYS[idx]
        grouped[wd] += t.get("result", 0)
        counts[wd] += 1
        if t.get("result", 0) > 0:
            wins[wd] += 1
    return [{
        "weekday": wd,
        "pnl": round(grouped[wd], 2),
        "count": counts[wd],
        "win_rate": round(100.0 * wins[wd] / counts[wd], 2) if counts[wd] else 0.0,
    } for wd in WEEKDAYS if counts[wd]]


def pnl_by_asset_direction(trades):
    """Por ativo, P&L e win rate separados entre LONG e SHORT.

    'best' = lado com maior P&L em módulo (compra vs venda por ação).
    """
    longs = defaultdict(lambda: [0.0, 0, 0])
    shorts = defaultdict(lambda: [0.0, 0, 0])
    for t in trades:
        asset = t.get("asset")
        result = t.get("result", 0)
        if t.get("direction") == "LONG":
            bucket = longs[asset]
        else:
            bucket = shorts[asset]
        bucket[0] += result
        bucket[1] += 1
        if result > 0:
            bucket[2] += 1
    result = []
    for asset in sorted(set(longs) | set(shorts)):
        lp, lc, lw = longs[asset]
        sp, sc, sw = shorts[asset]
        best = "LONG" if abs(lp) >= abs(sp) else "SHORT"
        result.append({
            "asset": asset,
            "long_pnl": round(lp, 2),
            "long_count": lc,
            "long_win_rate": round(100.0 * lw / lc, 2) if lc else 0.0,
            "short_pnl": round(sp, 2),
            "short_count": sc,
            "short_win_rate": round(100.0 * sw / sc, 2) if sc else 0.0,
            "best": best,
            "best_pnl": round(lp if best == "LONG" else sp, 2),
        })
    return sorted(result, key=lambda r: -(abs(r["long_pnl"]) + abs(r["short_pnl"])))


def added_lots_stats(trades):
    """Compara operações com vs sem lote adicionado + distribuição de quantidades."""
    groups = {"with": [], "without": []}
    dist = Counter()
    for t in trades:
        lots = t.get("added_lots") or 0
        groups["with" if lots > 0 else "without"].append(t.get("result", 0))
        dist[lots] += 1

    def _agg(results):
        n = len(results)
        if n == 0:
            return {"count": 0, "total_pnl": 0.0, "avg_pnl": 0.0, "win_rate": 0.0}
        wins = sum(1 for r in results if r > 0)
        return {
            "count": n,
            "total_pnl": round(sum(results), 2),
            "avg_pnl": round(mean(results), 2),
            "win_rate": round(100.0 * wins / n, 2),
        }

    return {
        "with_lots": _agg(groups["with"]),
        "without_lots": _agg(groups["without"]),
        "distribution": [{"lots": k, "count": v} for k, v in sorted(dist.items())],
    }


def candle_size_stats(trades):
    """P&L, count e win rate por tamanho de candle informado."""
    grouped = defaultdict(list)
    for t in trades:
        size = t.get("candle_size")
        if size:
            grouped[size].append(t.get("result", 0))
    out = []
    for size in ("Pequeno", "Médio", "Grande"):
        results = grouped.get(size, [])
        n = len(results)
        if n == 0:
            continue
        wins = sum(1 for r in results if r > 0)
        out.append({
            "candle_size": size,
            "count": n,
            "total_pnl": round(sum(results), 2),
            "avg_pnl": round(mean(results), 2),
            "win_rate": round(100.0 * wins / n, 2),
        })
    return out


def consecutive_streaks(trades):
    """Sequência máxima de wins e de losses."""
    max_wins = max_losses = 0
    cur_wins = cur_losses = 0
    for t in sorted(trades, key=lambda x: (x.get("date", ""), x.get("time", "") or "")):
        if t.get("result", 0) > 0:
            cur_wins += 1
            cur_losses = 0
            max_wins = max(max_wins, cur_wins)
        elif t.get("result", 0) < 0:
            cur_losses += 1
            cur_wins = 0
            max_losses = max(max_losses, cur_losses)
        else:
            cur_wins = cur_losses = 0
    return {"max_win_streak": max_wins, "max_loss_streak": max_losses}


def r_multiple_distribution(trades):
    """Histograma leve de R-múltiplos (bins inteiros) para o frontend."""
    vals = [t.get("r_multiple") for t in trades if t.get("r_multiple") is not None]
    if not vals:
        return []
    bins = Counter()
    for v in vals:
        b = int(round(v))
        bins[b] += 1
    return [{"r": k, "count": v} for k, v in sorted(bins.items())]


def emotion_frequency(journal_entries):
    """Frequência de emoções registradas no diário."""
    counter = Counter()
    for j in journal_entries:
        for e in j.get("emotions", []):
            counter[e] += 1
    return [{"emotion": e, "count": c} for e, c in counter.most_common()]


def aggregate_stats(trades, journal_entries=None):
    dd = max_drawdown(trades)
    wins, losses = _gross(trades)
    n = len(trades)
    n_wins = len(wins)
    n_losses = len(losses)
    result = {
        "total_trades": n,
        "total_wins": n_wins,
        "total_losses": n_losses,
        "total_pnl": total_pnl(trades),
        "win_rate": win_rate(trades),
        "profit_factor": profit_factor(trades),
        "payoff_ratio": payoff_ratio(trades),
        "avg_win": avg_win(trades),
        "avg_loss": avg_loss(trades),
        "expectancy": expectancy(trades),
        "expectancy_r": expectancy_r(trades),
        "max_drawdown": dd["max_drawdown"],
        "max_drawdown_days": dd["max_drawdown_days"],
        "streaks": consecutive_streaks(trades),
        "equity_curve": equity_curve(trades),
        "pnl_by_day": pnl_by_day(trades),
        "pnl_by_asset": pnl_by_asset(trades),
        "pnl_by_direction": pnl_by_direction(trades),
        "pnl_by_strategy": pnl_by_strategy(trades),
        "pnl_by_hour": pnl_by_hour(trades),
        "pnl_by_weekday": pnl_by_weekday(trades),
        "pnl_by_asset_direction": pnl_by_asset_direction(trades),
        "added_lots": added_lots_stats(trades),
        "candle_size": candle_size_stats(trades),
        "r_multiple_distribution": r_multiple_distribution(trades),
    }
    if journal_entries is not None:
        result["emotion_frequency"] = emotion_frequency(journal_entries)
    return result
