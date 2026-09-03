from fastapi import APIRouter

from .. import fx

router = APIRouter()


@router.get("/fx/usd-brl")
def api_usd_brl_rate():
    """Cotação atual USD/BRL, usada para exibir o preview de conversão
    no formulário de cadastro/edição de operações."""
    return fx.get_usd_brl_rate()
