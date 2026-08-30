"""Importador de operações — Profit Pro / MetaTrader.

Fluxo:
1. POST /api/import/preview  → recebe CSV, detecta formato, mapeia colunas,
   devolve preview (amostra, total, colunas detectadas) SEM gravar. Guarda o
   parse em memória com um preview_id.
2. POST /api/import/confirm  → recebe preview_id (+ mapping opcional), persiste
   as trades.

Cada linha do CSV vira uma operação fechada. O P&L pode vir pronto (coluna de
resultado/profit) ou ser calculado (preços + quantidade + direção).
"""
import io
import logging
import time
import uuid
from datetime import datetime, date

import pandas as pd

logger = logging.getLogger(__name__)

PREVIEWS = {}
PREVIEW_TTL = 3600  # segundos

# Aliases de colunas (normalizadas: lowercase, sem espaços/acentos)
COLUMN_ALIASES = {
    "date": ["data", "date", "data_op", "openingdate", "opening_date", "datetime",
             "open_time", "close_time", "openingtime"],
    "time": ["hora", "time", "open_time", "close_time", "openingtime", "closingtime"],
    "asset": ["ativo", "symbol", "asset", "codigo", "code", "mercadoria", "instrument"],
    "direction": ["operacao", "tipo", "type", "direcao", "direction", "buy_sell", "lado",
                  "compra_venda"],
    "entry_price": ["preco_compra", "preco_entrada", "entry_price", "entryprice", "open_price",
                    "openprice", "preco_abertura", "price", "preco", "abertura", "open",
                    "preco_venda"],
    "exit_price": ["preco_venda", "preco_saida", "exit_price", "exitprice", "close_price",
                   "closeprice", "preco_fechamento", "fechamento", "close", "preco_compra"],
    "quantity": ["quantidade", "qtd", "quantity", "lots", "amount", "volume", "num_contratos",
                 "qtd_compra", "qtd_venda"],
    "result": ["lucro_liquido", "net_profit", "net_profit_usd", "resultado_final",
               "resultado_financeiro", "resultado", "result", "pnl", "p_l", "profit",
               "lucro_prejuizo", "balance", "res_operacao", "res_operacao_bruto"],
    "fees": ["comissao", "fees", "commission", "corretagem", "emolumentos", "comissoes"],
    "risk_amount": ["risco", "risk", "risk_amount", "stop_value"],
    "notes": ["observacao", "notes", "comment", "comentario", "estrategia", "strategy"],
}


def _norm_header(h):
    s = str(h).strip().lower()
    for a, b in [("ã", "a"), ("ç", "c"), ("é", "e"), ("ê", "e"), ("í", "i"),
                 ("ó", "o"), ("ô", "o"), ("ú", "u"), ("á", "a")]:
        s = s.replace(a, b)
    # Remove o sufixo "(%)" típico das colunas percentuais do Profit Pro para
    # não criar colunas duplicadas (ex: res_operacao e res_operacao_(%)).
    s = s.replace("(%)", "")
    return s.replace(" ", "_").replace("/", "_").replace("-", "_").replace(".", "")


def _detect_delimiter(text):
    """Detecta o delimitador pela 1ª linha NÃO vazia que contenha o padrão.

    Exportações de corretoras costumam ter preâmbulo (linhas de cabeçalho,
    título do relatório, etc.) antes da linha de colunas. Se a 1ª linha for
    apenas texto (1 campo) e as linhas de dados tiverem N campos, a detecção
    pela primeira linha falharia — então procura a 1ª linha com 2+ delimitadores.
    """
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        counts = {d: line.count(d) for d in [";", ",", "\t"]}
        if sum(counts.values()) >= 2:
            return max(counts, key=counts.get)
    # Fallback: qualquer delimitador presente na 1ª linha útil
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        counts = {d: line.count(d) for d in [";", ",", "\t"]}
        return max(counts, key=counts.get) if max(counts.values()) > 0 else ";"
    return ";"


def _decode(raw: bytes) -> str:
    """Decodifica o arquivo detectando a codificação real.

    O Profit Pro exporta em latin-1/Windows-1252. Tentar utf-8 primeiro falha
    silenciosamente (bytes como 0xE7 0xE3 são válidos em latin-1 e viram
    caracteres quebrados em utf-8 sem exceção). Então detecta pela presença de
    bytes acentuados que NÃO são sequências utf-8 válidas.
    """
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        pass
    # Se não é utf-8 válido, é Windows-1252/latin-1 (padrão do Profit Pro)
    return raw.decode("cp1252")


def _parse_number(s):
    if s is None:
        return None
    s = str(s).strip()
    if not s or s in ("-", "n/a", "nan", "null", "none"):
        return None
    s = s.replace("R$", "").replace("$", "").replace("€", "").replace(" ", "").strip()
    if not s:
        return None
    has_comma = "," in s
    has_dot = "." in s
    try:
        if has_comma and has_dot:
            if s.rfind(",") > s.rfind("."):
                # pt-BR: 1.234,56
                s = s.replace(".", "").replace(",", ".")
            else:
                # en: 1,234.56
                s = s.replace(",", "")
        elif has_comma and not has_dot:
            # pode ser decimal pt-BR (0,01) — assumir decimal
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        return None


def _parse_direction(val):
    if val is None:
        return None
    v = str(val).strip().lower()
    if v in ("c", "compra", "buy", "long", "comprado", "b", "l"):
        return "LONG"
    if v in ("v", "venda", "sell", "short", "vendido", "s"):
        return "SHORT"
    return None


# Formatos de data (e data+hora) aceitos, do mais específico ao mais genérico
DATE_TIME_FORMATS = [
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y.%m.%d",
    "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M",
]


def _parse_datetime_components(val) -> tuple[str | None, str | None]:
    """Devolve (date_iso, time_hhmm) a partir de um campo que pode ter só data,
    data+hora ou hora com data separada."""
    if val is None:
        return (None, None)
    v = str(val).strip()
    if not v:
        return (None, None)

    # 1. data+hora juntas, e só hora
    for fmt in DATE_TIME_FORMATS:
        try:
            dt = datetime.strptime(v, fmt)
            return (dt.date().isoformat(), dt.strftime("%H:%M"))
        except Exception:
            continue
    try:
        # ISO completo (ex: 2026-06-10T09:35:00)
        dt = datetime.fromisoformat(v)
        return (dt.date().isoformat(), dt.strftime("%H:%M"))
    except Exception:
        pass

    # 2. só hora
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            dt = datetime.strptime(v, fmt)
            return (None, dt.strftime("%H:%M"))
        except Exception:
            continue

    return (None, None)


def _parse_date(val) -> str | None:
    d, _ = _parse_datetime_components(val)
    return d


def _parse_time(val) -> str | None:
    _, t = _parse_datetime_components(val)
    return t


def detect_format(columns):
    """Detecta Profit Pro vs MetaTrader com base nas colunas normalizadas."""
    cols = set(columns)
    mt_markers = {"profit", "lots", "symbol", "open_price", "close_price",
                  "open_time", "close_time", "ticket", "order"}
    pp_markers = {"ativo", "data", "operacao", "quantidade", "preco",
                  "abertura", "fechamento", "res_operacao", "qtd_compra", "lado"}
    mt_hits = len(cols & mt_markers)
    pp_hits = len(cols & pp_markers)
    if mt_hits > pp_hits:
        return "metatrader"
    if pp_hits > 0:
        return "profitpro"
    return "generic"


def build_mapping(columns):
    """Mapa campo -> coluna normalizada.

    Entre várias colunas do CSV que casam com o mesmo campo, escolhe a de maior
    prioridade (primeira da lista de aliases). Ex: o Profit Pro exporta
    "Resultado" (bruto) e "Lucro Liquido" — preferimos o líquido.
    """
    mapping = {}
    for field, aliases in COLUMN_ALIASES.items():
        best = None
        best_rank = len(aliases)
        for col in columns:
            if col in aliases:
                rank = aliases.index(col)
                if rank < best_rank:
                    best_rank = rank
                    best = col
        if best is not None:
            mapping[field] = best

    # Profit Pro (export "Todos os lançamentos"): não há coluna Data/Hora —
    # Abertura e Fechamento carregam data+hora. Abertura = entrada (data+hora).
    if "date" not in mapping and "abertura" in columns:
        mapping["date"] = "abertura"
    if "time" not in mapping and "abertura" in columns:
        mapping["time"] = "abertura"

    # Quantidade: o Profit Pro tem Qtd Compra e Qtd Venda (uma delas é 0).
    # Prefere a que não for zero na hora de ler a linha.
    qcols = [c for c in columns if c in ("qtd_compra", "qtd_venda")]
    if "quantity" not in mapping and qcols:
        mapping["quantity"] = qcols[0]

    return mapping


def _row_to_trade(row, mapping, fmt):
    """Converte uma linha do CSV (dict col->valor) em um trade dict."""
    def g(field):
        col = mapping.get(field)
        return row.get(col) if col else None

    date_val = _parse_date(g("date"))
    if date_val is None:
        return None
    time_val = _parse_time(g("time"))
    asset = g("asset")
    if not asset:
        return None
    # Linhas "[R] <ativo>" são ajustes de rolagem (rollover) do Profit Pro —
    # débitos/créditos de manutenção de posição, não operações reais. Ignorar.
    if str(asset).strip().startswith("[R]"):
        return None

    direction = _parse_direction(g("direction"))
    entry = _parse_number(g("entry_price"))
    exit_ = _parse_number(g("exit_price"))
    # Quantidade: preferir a coluna que não for zero quando houver Qtd Compra/Venda.
    qty = _parse_number(g("quantity"))
    for side_col in ("qtd_compra", "qtd_venda"):
        side_val = _parse_number(row.get(side_col))
        if side_val:
            qty = side_val
            break
    result = _parse_number(g("result"))
    fees = _parse_number(g("fees")) or 0.0
    risk = _parse_number(g("risk_amount"))
    notes = g("notes")

    # P&L final: usa o resultado vindo do arquivo (broker/profit) se houver.
    # Fallback: calcula por preços quando faltar o resultado pronto.
    computed = False
    if result is None and entry is not None and exit_ is not None and qty:
        if direction == "LONG":
            gross = (exit_ - entry) * qty
        elif direction == "SHORT":
            gross = (entry - exit_) * qty
        else:
            gross = 0.0
        result = gross - fees
        computed = True
    if result is None:
        return None

    # Em operações fechadas a comissão/swap já costumam estar embutidos no
    # resultado do broker. Só subtrai fees no caso do cálculo manual.
    final_result = result - fees if computed else result

    r_multiple = None
    if risk and risk > 0 and final_result is not None:
        r_multiple = round(final_result / risk, 3)

    return {
        "date": date_val,
        "time": time_val,
        "asset": str(asset).strip(),
        "direction": direction or "LONG",
        "entry_price": entry,
        "exit_price": exit_,
        "quantity": qty,
        "result": round(final_result, 2),
        "fees": round(fees, 2),
        "r_multiple": r_multiple,
        "risk_amount": risk,
        "notes": str(notes).strip() if notes else None,
        "strategy_id": None,  # import nunca atribui estratégia
        "source": fmt,
        "_computed": computed,
    }


def _find_header_line(text: str, delim: str) -> int:
    """Índice da linha de cabeçalho (a 1ª linha que, sem o preâmbulo, tem
    vários campos separados pelo delimitador). Exportações de corretoras podem
    ter linhas de título antes das colunas."""
    for i, line in enumerate(text.split("\n")):
        line = line.strip()
        if not line:
            continue
        if line.count(delim) >= 1:
            return i
    return 0


def preview_from_content(raw: bytes, filename: str = "") -> dict:
    """Parseia o CSV e devolve um preview sem gravar nada."""
    text = _decode(raw)
    delim = _detect_delimiter(text)
    lines = text.split("\n")
    header_idx = _find_header_line(text, delim)
    body = "\n".join(lines[header_idx:])
    try:
        df = pd.read_csv(io.StringIO(body), sep=delim, dtype=str, engine="python")
    except Exception:
        # Última linha com colunas desalinhadas (resumo/rodapé) derrubaria o
        # parse estrito — tenta ignorar a primeira linha que cause o erro.
        for drop in range(1, 3):
            try:
                df = pd.read_csv(
                    io.StringIO("\n".join(lines[header_idx:-drop or None])),
                    sep=delim, dtype=str, engine="python",
                )
                break
            except Exception:
                continue
        else:
            raise ValueError(
                "Não foi possível ler o arquivo como CSV. Confira se o export "
                "tem linhas de cabeçalho com colunas separadas por ; (Profit Pro) "
                "ou , (MetaTrader)."
            )

    df.columns = [_norm_header(c) for c in df.columns]
    df = df.dropna(axis=1, how="all")
    columns = list(df.columns)
    fmt = detect_format(columns)
    mapping = build_mapping(columns)

    trades = []
    skipped = 0
    for _, row in df.iterrows():
        t = _row_to_trade(row, mapping, fmt)
        if t is None:
            skipped += 1
        else:
            trades.append(t)

    preview_id = uuid.uuid4().hex
    PREVIEWS[preview_id] = {
        "trades": trades,
        "expires": time.time() + PREVIEW_TTL,
    }

    sample = [dict((k, v) for k, v in t.items() if not k.startswith("_")) for t in trades[:10]]
    return {
        "preview_id": preview_id,
        "filename": filename,
        "format": fmt,
        "columns_detected": columns,
        "mapping": mapping,
        "total_rows": len(df),
        "total_trades": len(trades),
        "skipped": skipped,
        "sample": sample,
        "total_pnl_preview": round(sum(t["result"] for t in trades), 2),
    }


def confirm_preview(preview_id: str) -> dict:
    """Persiste as trades de um preview. Devolve quantas foram gravadas."""
    preview = PREVIEWS.get(preview_id)
    if not preview:
        raise ValueError("Preview expirou ou não existe. Faça o upload novamente.")

    from . import db
    created = 0
    for t in preview["trades"]:
        clean = dict((k, v) for k, v in t.items() if not k.startswith("_"))
        db.create_trade(clean)
        created += 1

    PREVIEWS.pop(preview_id, None)
    return {"created": created}


def _cleanup_expired():
    now = time.time()
    expired = [k for k, v in PREVIEWS.items() if v["expires"] < now]
    for k in expired:
        PREVIEWS.pop(k, None)


_cleanup_expired()
