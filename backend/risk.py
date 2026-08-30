"""Motor de conformidade ao GR (Gestão de Risco).

Funções puras: recebem trades (dicts) e um plano de risco (dict) e devolvem
estruturas JSON-serializáveis. Sem estado, sem IO — fáceis de testar,
no mesmo estilo de `metrics.py`.

Limites avaliados por dia:
- max_risk_per_trade   : risco efetivo por operação (máx entre risk_amount e |result|)
- max_trades_per_day   : quantidade máxima de operações no dia
- daily_stop_loss      : se o P&L acumulado do dia chega em ≤ -limite, o stop foi
                         estourado; operar depois disso é violação de disciplina.
"""
from collections import defaultdict

VIOLATION_TITLES = {
    "max_risk_per_trade": "Risco por operação excedido",
    "max_trades_per_day": "Máximo de operações excedido",
    "daily_stop_breach": "Stop diário estourado",
    "stop_kept_trading": "Continuou operando após o stop",
}


def evaluate_day(trades, plan):
    """Avalia um dia de trades contra um GR.

    `plan` pode ser None (nenhum GR aplicável). Limites ausentes/None no plan
    significam "não configurado" e não são avaliados.

    Retorna {status, violations, limits, pnl, trades}.
    status: conformidade | violacao | sem_gr | sem_trades
    """
    ordered = sorted(trades, key=lambda t: (t.get("time") or ""))
    if not ordered:
        return {"status": "sem_trades", "violations": [], "limits": None,
                "pnl": 0.0, "trades": 0}
    if not plan:
        pnl = round(sum(t.get("result", 0) for t in ordered), 2)
        return {"status": "sem_gr", "violations": [], "limits": None,
                "pnl": pnl, "trades": len(ordered)}

    violations = []
    limits = {
        "daily_stop_loss": plan.get("daily_stop_loss"),
        "max_trades_per_day": plan.get("max_trades_per_day"),
        "max_risk_per_trade": plan.get("max_risk_per_trade"),
    }

    # 1. Risco máximo por operação — risco efetivo inclui corretagem/perda realizada.
    max_risk = plan.get("max_risk_per_trade")
    if max_risk:
        for i, t in enumerate(ordered):
            eff = max(t.get("risk_amount") or 0, abs(t.get("result") or 0))
            if eff > max_risk:
                violations.append({
                    "type": "max_risk_per_trade",
                    "title": VIOLATION_TITLES["max_risk_per_trade"],
                    "message": f"Operação arriscou R$ {eff:,.2f} — limite R$ {max_risk:,.2f}",
                    "trade_index": i,
                })

    # 2. Máximo de operações por dia.
    max_trades = plan.get("max_trades_per_day")
    if max_trades is not None and len(ordered) > max_trades:
        violations.append({
            "type": "max_trades_per_day",
            "title": VIOLATION_TITLES["max_trades_per_day"],
            "message": f"{len(ordered)} operações no dia — limite {max_trades}",
        })

    # 3. Stop diário de perda — P&L acumulado na ordem de execução.
    stop = plan.get("daily_stop_loss")
    if stop:
        cum = 0.0
        breach_index = None
        for i, t in enumerate(ordered):
            cum += t.get("result", 0)
            if cum <= -stop:
                breach_index = i
                break
        if breach_index is not None:
            violations.append({
                "type": "daily_stop_breach",
                "title": VIOLATION_TITLES["daily_stop_breach"],
                "message": f"P&L do dia chegou a R$ {cum:,.2f} — stop era R$ -{stop:,.2f}",
                "trade_index": breach_index,
            })
            # Continuou operando depois de estourar o stop → agravante de disciplina.
            if breach_index < len(ordered) - 1:
                violations.append({
                    "type": "stop_kept_trading",
                    "title": VIOLATION_TITLES["stop_kept_trading"],
                    "message": "Continuou operando depois de estourar o stop diário",
                })

    pnl = round(sum(t.get("result", 0) for t in ordered), 2)
    status = "violacao" if violations else "conformidade"
    return {"status": status, "violations": violations, "limits": limits,
            "pnl": pnl, "trades": len(ordered)}


def risk_overview(days):
    """Agrega a conformidade de vários dias.

    `days`: lista de {date, trades, plan} — `plan` pode ser None (dia sem GR).
    Retorna agregados + lista `days` (um por dia) + counts de violação por tipo.
    """
    results = []
    by_type = defaultdict(int)
    n_tracked = n_compliant = n_violating = n_without_gr = 0
    for day in days:
        res = evaluate_day(day.get("trades", []), day.get("plan"))
        res["date"] = day["date"]
        res["risk_plan_name"] = (day.get("plan") or {}).get("name") if day.get("plan") else None
        results.append(res)
        status = res["status"]
        if status == "conformidade":
            n_tracked += 1
            n_compliant += 1
        elif status == "violacao":
            n_tracked += 1
            n_violating += 1
        elif status == "sem_gr":
            n_without_gr += 1
        for v in res["violations"]:
            by_type[v["type"]] += 1

    compliance_rate = round(100.0 * n_compliant / n_tracked, 2) if n_tracked else None
    return {
        "days_tracked": n_tracked,
        "days_compliant": n_compliant,
        "days_violating": n_violating,
        "days_without_gr": n_without_gr,
        "compliance_rate": compliance_rate,
        "violations_by_type": [
            {"type": t, "title": VIOLATION_TITLES.get(t, t), "count": c}
            for t, c in sorted(by_type.items(), key=lambda x: -x[1])
        ],
        "days": results,
    }
