import logging

from fastapi import APIRouter, HTTPException

from .. import db
from ..models import JournalIn

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/journal")
def api_list_journal(date: str | None = None, trade_id: str | None = None):
    entries = db.list_journal(date=date, trade_id=trade_id)
    return {"journal": entries, "count": len(entries)}


@router.post("/journal")
def api_create_journal(payload: JournalIn):
    try:
        entry = db.create_journal(payload.model_dump(mode="json"))
        return {"status": "ok", "entry": entry}
    except Exception as e:
        logger.exception("Erro ao criar entrada de diário")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/journal/{entry_id}")
def api_update_journal(entry_id: str, payload: JournalIn):
    try:
        existing = db.get_journal(entry_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Entrada de diário não encontrada.")
        data = payload.model_dump(mode="json")
        entry = db.update_journal(entry_id, data)
        return {"status": "ok", "entry": entry}
    except Exception as e:
        logger.exception("Erro ao atualizar entrada de diário")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/journal/{entry_id}")
def api_delete_journal(entry_id: str):
    try:
        ok = db.delete_journal(entry_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Entrada de diário não encontrada.")
        return {"status": "ok"}
    except Exception as e:
        logger.exception("Erro ao deletar entrada de diário")
        raise HTTPException(status_code=500, detail=str(e))
