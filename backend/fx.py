"""Cotação de câmbio USD/BRL, usada para converter operações digitadas em
reais para dólar (moeda padrão de armazenamento do sistema).

Usa a API pública e gratuita Frankfurter (dados do Banco Central Europeu,
sem necessidade de chave de API). O resultado fica em cache em memória por
algumas horas para evitar bater na API externa a cada requisição — e para
não travar o cadastro de uma operação caso a API externa esteja fora do ar
(nesse caso, cai para o último valor em cache, ou para uma cotação de
reserva conservadora, como último recurso).
"""

import json
import logging
import time
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

_FX_URL = "https://api.frankfurter.dev/v1/latest"
_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 horas

# Cotação de reserva usada apenas se a API estiver fora do ar E ainda não
# houver nenhum valor em cache. É só uma rede de segurança para nunca
# bloquear o cadastro de uma operação — o valor real é sempre preferido.
_FALLBACK_RATE = 5.30

_cache = {"rate": None, "fetched_at": 0.0, "date": None}


def get_usd_brl_rate() -> dict:
    """Retorna a cotação atual USD/BRL (quantos reais valem 1 dólar).

    Formato do retorno: {"rate": float, "date": str|None, "cached": bool,
    "stale": bool (opcional), "fallback": bool (opcional)}
    """
    now = time.time()
    if _cache["rate"] and (now - _cache["fetched_at"]) < _CACHE_TTL_SECONDS:
        return {"rate": _cache["rate"], "date": _cache["date"], "cached": True}

    try:
        req = urllib.request.Request(_FX_URL, headers={"User-Agent": "diario-de-trade/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        rates = payload.get("rates", {})
        usd = rates.get("USD")
        brl = rates.get("BRL")
        if not usd or not brl:
            raise ValueError("Resposta da API de câmbio sem cotação de USD ou BRL.")
        rate = round(brl / usd, 4)
        _cache["rate"] = rate
        _cache["fetched_at"] = now
        _cache["date"] = payload.get("date")
        return {"rate": rate, "date": payload.get("date"), "cached": False}
    except Exception as e:
        logger.warning("Falha ao buscar cotação USD/BRL: %s", e)
        if _cache["rate"]:
            return {"rate": _cache["rate"], "date": _cache["date"], "cached": True, "stale": True}
        return {"rate": _FALLBACK_RATE, "date": None, "cached": False, "fallback": True}


def brl_to_usd(amount: float, rate: float) -> float:
    """Converte um valor em reais para dólar, usando a cotação informada
    (quantos reais valem 1 dólar)."""
    if not rate:
        return amount
    return round(amount / rate, 2)
