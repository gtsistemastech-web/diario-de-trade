"""Carrega dados fictícios (demo) no banco do Diário de Trader.

Uso:
    python backend/seed_demo.py            # só se o banco estiver vazio
    python backend/seed_demo.py --force    # apaga e recarrega
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import db  # noqa: E402

ASSETS = ["WIN", "WDO", "PETR4", "IBOV", "DOLFUT"]
EMOTIONS = ["Focado", "Calmo", "Ansioso", "Confiante", "Frustrado", "Disciplinado"]
ERRORS = ["Entrou sem setup", "Não respeitou o stop", "Aumentou o lote no prejuízo",
          "Entrou cedo demais", "Vingança após perda"]
LESSONS = [
    "Respeitei o stop e a perda foi pequena.",
    "Entrei sem setup e paguei o preço.",
    "A paciência valeu a pena — esperei o pullback.",
    "Não operar no início do mês.",
    "Gestão de risco salvou o dia.",
]


def _iso_date(days_ago):
    from datetime import date, timedelta
    return (date.today() - timedelta(days=days_ago)).isoformat()


def _clean_trades():
    conn = db.get_db_connection()
    try:
        conn.execute("DELETE FROM journal")
        conn.execute("DELETE FROM trades")
        conn.execute("DELETE FROM strategies")
        conn.execute("DELETE FROM day_plan")
        conn.execute("DELETE FROM risk_plans")
        conn.commit()
    finally:
        conn.close()


DEMO_STRATEGIES = [
    {
        "name": "Rompimento de máximas",
        "description": "Entrada no rompimento de uma máxima relevante com volume.",
        "setup": "Máxima de 4h rompida + candle de confirmação",
        "notes": "Preferir rompimentos perto do fechamento.",
    },
    {
        "name": "Pullback em tendência",
        "description": "Entrada no pullback dentro de uma tendência de força.",
        "setup": "Tendência definida + pullback até média/região de suporte",
        "notes": "Válido para intraday e swing.",
    },
    {
        "name": "Cruzamento de médias",
        "description": "Opera o cruzamento de médias móveis rápidas sobre lentas.",
        "setup": "MME 9 x 21 em gráfico de 5m",
        "notes": "Filtrar por tendência do gráfico maior.",
    },
    {
        "name": "Operação de abertura",
        "description": "Explora a volatilidade dos primeiros minutos de pregão.",
        "setup": "Rompimento do range da primeira vela de 5m",
        "notes": "Reduzir lote no começo do mês.",
    },
    {
        "name": "Reversão em nível",
        "description": "Opera a reversão em níveis importantes (suporte/resistência).",
        "setup": "Rejeição clara em nível + divergência",
        "notes": "Exige paciência e stop curto.",
    },
]


def _seed_strategies(rng):
    """Cria as estratégias demo e devolve um dict id -> nome."""
    ids = []
    for s in DEMO_STRATEGIES:
        created = db.create_strategy(s)
        ids.append(created["id"])
    return ids


DEMO_RISK_PLANS = [
    {
        "name": "Conservador",
        "description": "Proteção máxima do capital — poucas operações e risco baixo.",
        "daily_stop_loss": 300.0,
        "max_trades_per_day": 3,
        "max_risk_per_trade": 80.0,
        "is_active": False,
    },
    {
        "name": "Moderado",
        "description": "Equilíbrio entre risco e quantidade de operações.",
        "daily_stop_loss": 500.0,
        "max_trades_per_day": 4,
        "max_risk_per_trade": 150.0,
        "is_active": True,
    },
    {
        "name": "Agressivo",
        "description": "Busca maior retorno com tolerância a risco maior.",
        "daily_stop_loss": 800.0,
        "max_trades_per_day": 6,
        "max_risk_per_trade": 250.0,
        "is_active": False,
    },
]


def _seed_risk_plans(rng):
    """Cria os GRs demo e devolve dict id -> nome."""
    plans = []
    for p in DEMO_RISK_PLANS:
        created = db.create_risk_plan(p)
        plans.append(created)
    return plans


def seed():
    if db.list_trades() and "--force" not in sys.argv:
        print("Banco já possui trades. Use --force para recarregar. (nada feito)")
        return
    if "--force" in sys.argv:
        _clean_trades()

    rng = random.Random(42)
    demo_trades = []
    strategy_ids = _seed_strategies(rng)
    risk_plans = _seed_risk_plans(rng)
    # Mapeia nome -> plano (o Moderado é o ativo; alterna alguns dias p/ variedade)
    risk_by_name = {p["name"]: p for p in risk_plans}

    # ~45 dias úteis de trades, 1 a 4 por dia
    from datetime import date, timedelta
    start = date.today() - timedelta(days=60)
    day = start
    n = 0
    day_plan_links = []
    while n < 42 and day <= date.today():
        weekday = day.weekday()
        if weekday >= 5:  # pula fim de semana
            day += timedelta(days=1)
            continue

        # Vincula o GR do dia (maioria Moderado; alguns Conservador/Agressivo)
        gr_name = rng.choices(
            ["Moderado", "Conservador", "Agressivo"], weights=[0.6, 0.2, 0.2], k=1
        )[0]
        plan = risk_by_name[gr_name]
        day_plan_links.append((day.isoformat(), plan["id"]))

        # ~7% dos dias: série de 2 perdas seguidas que somam além do stop diário,
        # demonstrando "daily_stop_breach" + "stop_kept_trading" (continuou operando).
        # O total da série é maior que o stop do GR para garantir o cruzamento.
        if rng.random() < 0.07:
            stop_target = plan["daily_stop_loss"]
            l1 = -rng.uniform(stop_target * 0.35, stop_target * 0.5)
            l2 = -(stop_target + rng.uniform(10, 60)) - l1  # garante l1+l2 além do stop
            fees_std = 2.5
            for idx, loss in enumerate((l1, l2)):
                if n >= 42:
                    break
                direction = rng.choice(["LONG", "SHORT"])
                entry = round(rng.uniform(90000, 130000), 2)
                loss_abs = abs(loss)
                risk = round(min(max(loss_abs * 0.9, 60), 120), 2)
                hour = f"{9 + idx:02d}:{rng.randint(0, 59):02d}"
                if direction == "LONG":
                    exit_price = round(entry - (loss_abs - fees_std), 2)
                else:
                    exit_price = round(entry + (loss_abs - fees_std), 2)
                demo_trades.append({
                    "date": day.isoformat(), "time": hour,
                    "asset": rng.choice(ASSETS), "direction": direction,
                    "entry_price": entry, "exit_price": exit_price,
                    "quantity": 2, "result": round(loss, 2), "fees": fees_std,
                    "r_multiple": round(loss / risk, 2), "risk_amount": risk,
                    "emotions": [rng.choice(EMOTIONS)], "notes": rng.choice(LESSONS),
                    "strategy_id": rng.choice(strategy_ids), "source": "manual",
                    "added_lots": rng.choices([0, 1, 2], weights=[0.8, 0.15, 0.05], k=1)[0],
                    "candle_size": rng.choice(["Pequeno", "Médio", "Grande"]),
                })
                n += 1

        n_daily = rng.randint(1, 5)
        for _ in range(n_daily):
            direction = rng.choice(["LONG", "SHORT"])
            entry = round(rng.uniform(90000, 130000), 2)
            # Contexto do trade: lote adicionado (~20%) e tamanho do candle.
            add_lots = rng.choices([0, 1, 2, 3], weights=[0.80, 0.08, 0.07, 0.05], k=1)[0]
            candle = rng.choices(["Pequeno", "Médio", "Grande"], weights=[0.4, 0.35, 0.25], k=1)[0]
            # ~8% das operações são um erro grosseiro (ex.: não respeitou o stop),
            # o que ajuda a demonstrar violações de stop diário no demo.
            if rng.random() < 0.08:
                pnl_raw = -rng.uniform(200, 350)
            elif direction == "LONG":
                pnl_raw = rng.gauss(40, 150)
            else:
                pnl_raw = rng.gauss(20, 130)
            # Correlações realistas p/ as novas análises: adicionar lote tende a
            # piorar o resultado (sobe lote no prejuízo); candle grande tende a
            # resultado melhor.
            if add_lots > 0:
                pnl_raw -= add_lots * rng.uniform(15, 40)
            if candle == "Grande":
                pnl_raw += rng.uniform(20, 80)
            result = round(pnl_raw, 2)
            # Risco por operação varia — ajuda o demo a mostrar violações de
            # max_risk_per_trade e de stop diário de forma realista.
            risk = round(rng.uniform(60, 120), 2)
            r_multiple = round(result / risk, 2) if risk else None
            fees = round(rng.uniform(1, 5), 2)
            hour = f"{rng.randint(9, 17):02d}:{rng.randint(0, 59):02d}"
            asset = rng.choice(ASSETS)
            demo_trades.append({
                "date": day.isoformat(),
                "time": hour,
                "asset": asset,
                "direction": direction,
                "entry_price": entry,
                "exit_price": round(entry + (result + fees) / 2 if direction == "LONG" else entry - (result + fees) / 2, 2),
                "quantity": 2,
                "result": result,
                "fees": fees,
                "r_multiple": r_multiple,
                "risk_amount": risk,
                "emotions": [rng.choice(EMOTIONS)],
                "notes": rng.choice(LESSONS),
                "strategy_id": rng.choice(strategy_ids),
                "source": "manual",
                "added_lots": add_lots,
                "candle_size": candle,
            })
            n += 1
            if n >= 42:
                break
        day += timedelta(days=1)

    for t in demo_trades:
        db.create_trade(t)

    # Vincula o GR de cada dia (day_plan)
    for date, plan_id in day_plan_links:
        db.bind_day_risk_plan(date, plan_id)

    # Journal: uma entrada por dia de trading
    dates = sorted({t["date"] for t in demo_trades})
    for d in dates:
        db.create_journal({
            "date": d,
            "mood_score": rng.randint(4, 9),
            "emotions": [rng.choice(EMOTIONS) for _ in range(rng.randint(1, 2))],
            "discipline_rating": rng.randint(4, 10),
            "errors": [rng.choice(ERRORS)] if rng.random() < 0.4 else [],
            "lessons": rng.choice(LESSONS),
        })

    total = sum(t["result"] for t in demo_trades)
    print(f"Seed demo concluído: {len(demo_trades)} trades, {len(dates)} dias, P&L total R$ {total:,.2f}.")


if __name__ == "__main__":
    seed()
