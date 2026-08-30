import logging

from fastapi import APIRouter, HTTPException, Query

from .. import db
from .. import risk
from ..models import RiskBindIn, RiskPlanIn, RiskPlanUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


# ---- CRUD: risk-plans ----

@router.get("/risk-plans")
def api_list_risk_plans():
    try:
        plans = db.list_risk_plans()
        return {"risk_plans": plans, "count": len(plans)}
    except Exception as e:
        logger.exception("Erro ao listar GRs")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/risk-plans")
def api_create_risk_plan(payload: RiskPlanIn):
    try:
        plan = db.create_risk_plan(payload.model_dump())
        return {"status": "ok", "risk_plan": plan}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Erro ao criar GR")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-plans/{plan_id}")
def api_get_risk_plan(plan_id: str):
    try:
        plan = db.get_risk_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="GR não encontrado.")
        return {"status": "ok", "risk_plan": plan}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao buscar GR")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/risk-plans/{plan_id}")
def api_update_risk_plan(plan_id: str, payload: RiskPlanUpdate):
    try:
        existing = db.get_risk_plan(plan_id)
        if not existing:
            raise HTTPException(status_code=404, detail="GR não encontrado.")
        merged = {**existing, **payload.model_dump(exclude_unset=True)}
        plan = db.update_risk_plan(plan_id, merged)
        return {"status": "ok", "risk_plan": plan}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao atualizar GR")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/risk-plans/{plan_id}")
def api_delete_risk_plan(plan_id: str, force: bool = False):
    try:
        existing = db.get_risk_plan(plan_id)
        if not existing:
            raise HTTPException(status_code=404, detail="GR não encontrado.")
        in_use = db.risk_plan_usage(plan_id)
        if in_use and not force:
            # Frontend pergunta se quer desvincular e reenvia com force=true.
            raise HTTPException(
                status_code=409,
                detail=(
                    f"GR em uso por {in_use} dia(s). "
                    "Confirme para desvincular dos dias e excluir."
                ),
            )
        db.delete_risk_plan(plan_id)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao deletar GR")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/risk-plans/{plan_id}/active")
def api_set_active_risk_plan(plan_id: str):
    try:
        plan = db.set_active_risk_plan(plan_id)
        if not plan:
            raise HTTPException(status_code=404, detail="GR não encontrado.")
        return {"status": "ok", "risk_plan": plan}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao definir GR ativo")
        raise HTTPException(status_code=500, detail=str(e))


# ---- Vínculo por dia + overview ----

@router.put("/risk/days/{day_date}")
def api_bind_day_risk_plan(day_date: str, payload: RiskBindIn):
    try:
        if day_date != str(payload.date):
            raise HTTPException(status_code=400, detail="Data inconsistente na URL e no corpo.")
        if payload.risk_plan_id:
            plan = db.get_risk_plan(payload.risk_plan_id)
            if not plan:
                raise HTTPException(status_code=404, detail="GR não encontrado.")
        day_plan = db.bind_day_risk_plan(day_date, payload.risk_plan_id)
        return {"status": "ok", "day_plan": day_plan}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao vincular GR ao dia")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk/overview")
def api_risk_overview(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
):
    try:
        trades = db.list_trades(from_date=from_date, to_date=to_date)
        plans = {p["id"]: p for p in db.list_risk_plans()}

        # Agrupa trades por dia (só dias com trades entram na avaliação).
        by_day = {}
        for t in trades:
            by_day.setdefault(t["date"], []).append(t)

        # GR de cada dia: vínculo explícito ou o ativo (default).
        days = []
        for date in sorted(by_day):
            plan = db.get_bound_risk_plan(date)
            days.append({"date": date, "trades": by_day[date], "plan": plan})

        overview = risk.risk_overview(days)
        overview["plans"] = list(plans.values())
        return overview
    except Exception as e:
        logger.exception("Erro ao calcular overview de risco")
        raise HTTPException(status_code=500, detail=str(e))
