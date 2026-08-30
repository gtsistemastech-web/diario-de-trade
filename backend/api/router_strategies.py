import logging

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import StrategyIn, StrategyUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/strategies")
def api_list_strategies():
    try:
        strategies = db.list_strategies()
        return {"strategies": strategies, "count": len(strategies)}
    except Exception as e:
        logger.exception("Erro ao listar estratégias")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/strategies")
def api_create_strategy(payload: StrategyIn):
    try:
        strategy = db.create_strategy(payload.model_dump())
        return {"status": "ok", "strategy": strategy}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Erro ao criar estratégia")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/strategies/{strategy_id}")
def api_get_strategy(strategy_id: str):
    try:
        strategy = db.get_strategy(strategy_id)
        if not strategy:
            raise HTTPException(status_code=404, detail="Estratégia não encontrada.")
        return {"status": "ok", "strategy": strategy}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao buscar estratégia")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/strategies/{strategy_id}")
def api_update_strategy(strategy_id: str, payload: StrategyUpdate):
    try:
        existing = db.get_strategy(strategy_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Estratégia não encontrada.")
        merged = {**existing, **payload.model_dump(exclude_unset=True)}
        strategy = db.update_strategy(strategy_id, merged)
        return {"status": "ok", "strategy": strategy}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao atualizar estratégia")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/strategies/{strategy_id}")
def api_delete_strategy(strategy_id: str, force: bool = False):
    try:
        existing = db.get_strategy(strategy_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Estratégia não encontrada.")
        in_use = db.strategy_usage(strategy_id)
        if in_use and not force:
            # Frontend pergunta se quer desvincular e reenvia com force=true.
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Estratégia em uso por {in_use} operação(ões). "
                    "Confirme para desvincular das operações e excluir."
                ),
            )
        # FK ON DELETE SET NULL desvincula as trades automaticamente
        db.delete_strategy(strategy_id)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao deletar estratégia")
        raise HTTPException(status_code=500, detail=str(e))
