import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import importer
from ..models import ImportMapping

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/import/preview")
async def api_import_preview(file: UploadFile = File(...)):
    """Recebe um CSV (Profit Pro / MetaTrader) e devolve preview sem gravar."""
    try:
        raw = await file.read()
        result = importer.preview_from_content(raw, filename=file.filename or "")
        return {"status": "ok", "preview": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Erro no preview de importação")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/confirm")
def api_import_confirm(payload: dict):
    """Confirma um preview e persiste as trades. preview_id obrigatório."""
    preview_id = (payload or {}).get("preview_id")
    if not preview_id:
        raise HTTPException(status_code=400, detail="preview_id é obrigatório.")
    # ImportMapping fica disponível para um mapeamento manual futuro; por ora
    # o mapeamento automático (build_mapping) é o que vale.
    if payload.get("mapping"):
        try:
            ImportMapping(**payload["mapping"])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Mapeamento inválido: {e}")
    try:
        result = importer.confirm_preview(preview_id)
        return {"status": "ok", **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Erro ao confirmar importação")
        raise HTTPException(status_code=500, detail=str(e))
