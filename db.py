import json
import logging
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_FILE = os.path.join(DB_DIR, "trader_diary.db")

# Se DATABASE_URL estiver definida (ex: fornecida pelo Render ao conectar um
# banco Postgres), o app usa Postgres. Caso contrário, cai no SQLite local
# (comportamento original, ótimo para rodar na própria máquina).
DATABASE_URL = os.environ.get("DATABASE_URL")
IS_POSTGRES = bool(DATABASE_URL)

if IS_POSTGRES:
    import psycopg2
    import psycopg2.extras

    # Render às vezes fornece a URL com o esquema "postgres://", que o
    # psycopg2 aceita normalmente — nenhuma conversão é necessária.


class Row:
    """Wrapper de linha que suporta acesso por índice (row[0]) e por nome
    (row["campo"]), igual ao sqlite3.Row — assim o resto do código (routers,
    CRUD helpers) funciona sem mudanças em cima de SQLite ou Postgres."""

    __slots__ = ("_columns", "_values", "_map")

    def __init__(self, columns, values):
        self._columns = columns
        self._values = tuple(values)
        self._map = dict(zip(columns, values))

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._map[key]

    def get(self, key, default=None):
        return self._map.get(key, default)

    def keys(self):
        return list(self._columns)

    def __iter__(self):
        return iter(self._values)

    def __contains__(self, key):
        return key in self._map

    def __repr__(self):
        return f"Row({self._map!r})"


class _PgCursorWrapper:
    """Faz um cursor psycopg2 se comportar como o retorno de conn.execute()
    do sqlite3: .fetchone() / .fetchall() retornando Row, e .rowcount."""

    def __init__(self, cursor):
        self._cursor = cursor

    def _columns(self):
        return [d[0] for d in self._cursor.description] if self._cursor.description else []

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return Row(self._columns(), row)

    def fetchall(self):
        cols = self._columns()
        return [Row(cols, r) for r in self._cursor.fetchall()]

    @property
    def rowcount(self):
        return self._cursor.rowcount


class _PgConnWrapper:
    """Faz uma conexão psycopg2 se comportar como uma conexão sqlite3:
    conn.execute(sql, params) em vez de conn.cursor().execute(...)."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, query, params=None):
        pg_query = _sqlite_to_pg(query)
        cur = self._conn.cursor()
        if params:
            cur.execute(pg_query, tuple(params))
        else:
            cur.execute(pg_query)
        return _PgCursorWrapper(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


_PLACEHOLDER_RE = re.compile(r"\?")


def _sqlite_to_pg(query: str) -> str:
    """Converte placeholders '?' (estilo sqlite3) para '%s' (estilo psycopg2).
    Nenhuma query deste projeto usa '?' como texto literal, então a troca
    direta é segura."""
    return _PLACEHOLDER_RE.sub("%s", query)


# Alias de exceção de integridade (nome único/violação de constraint),
# usado nos blocos try/except deste módulo — aponta pra classe certa
# dependendo do backend em uso.
if IS_POSTGRES:
    IntegrityError = psycopg2.errors.IntegrityError
else:
    IntegrityError = sqlite3.IntegrityError


def get_db_connection():
    if IS_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        return _PgConnWrapper(conn)
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def init_db():
    conn = get_db_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                currency TEXT DEFAULT 'USD',
                initial_balance REAL DEFAULT 0.0,
                current_balance REAL DEFAULT 0.0,
                is_active INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS custom_options (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                code TEXT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS strategies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                setup TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                time TEXT,
                asset TEXT NOT NULL,
                direction TEXT NOT NULL,            -- LONG | SHORT
                entry_price REAL,
                exit_price REAL,
                quantity REAL,
                result REAL NOT NULL,               -- P&L em USD/R$ (calculado ou manual)
                fees REAL DEFAULT 0,
                r_multiple REAL,
                risk_amount REAL,                   -- usado para derivar r_multiple
                emotions TEXT,                      -- JSON list
                notes TEXT,
                strategy_id TEXT,                   -- FK -> strategies.id (nullable)
                source TEXT DEFAULT 'manual',       -- manual | profitpro | metatrader
                added_lots INTEGER DEFAULT 0,       -- lotes adicionados durante a operação
                candle_size TEXT,                   -- Pequeno | Médio | Grande (nullable)
                account_id TEXT,
                currency TEXT DEFAULT 'USD',
                event_id TEXT,
                context_id TEXT,
                location_id TEXT,
                clean_left INTEGER DEFAULT 0,       -- 0=Não, 1=Sim
                first_bar INTEGER DEFAULT 0,        -- 0=Não, 1=Sim
                entry_type TEXT,
                has_addition INTEGER DEFAULT 0,     -- 0=Não, 1=Sim
                outcome_type TEXT,                  -- 'GAIN' | 'LOSS' | 'ZERO'
                errors TEXT,                        -- JSON list de erros cometidos na operação
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id) ON DELETE SET NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
            )
        """)
        # Migrações idempotentes para tabelas existentes
        new_cols = [
            ("strategy_id", "TEXT"),
            ("added_lots", "INTEGER DEFAULT 0"),
            ("candle_size", "TEXT"),
            ("account_id", "TEXT"),
            ("currency", "TEXT DEFAULT 'USD'"),
            ("event_id", "TEXT"),
            ("context_id", "TEXT"),
            ("location_id", "TEXT"),
            ("clean_left", "INTEGER DEFAULT 0"),
            ("first_bar", "INTEGER DEFAULT 0"),
            ("entry_type", "TEXT"),
            ("has_addition", "INTEGER DEFAULT 0"),
            ("outcome_type", "TEXT"),
            ("errors", "TEXT")
        ]
        for col_name, col_def in new_cols:
            if IS_POSTGRES:
                # IF NOT EXISTS evita erro (e evita abortar a transação
                # inteira, que é o comportamento do Postgres em caso de
                # exceção não tratada dentro de uma transação).
                conn.execute(f"ALTER TABLE trades ADD COLUMN IF NOT EXISTS {col_name} {col_def}")
            else:
                try:
                    conn.execute(f"ALTER TABLE trades ADD COLUMN {col_name} {col_def}")
                except Exception:
                    pass

        conn.execute("""
            CREATE TABLE IF NOT EXISTS risk_plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                daily_stop_loss REAL,           -- stop diário de perda em R$/USD (positivo)
                max_trades_per_day INTEGER,
                max_risk_per_trade REAL,        -- risco máximo por operação em R$/USD (positivo)
                is_active INTEGER DEFAULT 0,    -- GR padrão (vale p/ dias sem vínculo)
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS journal (
                id TEXT PRIMARY KEY,
                trade_id TEXT,
                date TEXT NOT NULL,
                mood_score INTEGER,                 -- 1..10
                emotions TEXT,                      -- JSON list
                discipline_rating INTEGER,          -- 1..10
                errors TEXT,                        -- JSON list
                lessons TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS day_plan (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL,
                scenarios TEXT,                     -- JSON list
                goals TEXT,                         -- JSON list
                levels TEXT,                        -- JSON list
                review TEXT,                        -- JSON object
                risk_plan_id TEXT,                  -- FK -> risk_plans.id (GR do dia)
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (risk_plan_id) REFERENCES risk_plans(id) ON DELETE SET NULL
            )
        """)
        if IS_POSTGRES:
            conn.execute("ALTER TABLE day_plan ADD COLUMN IF NOT EXISTS risk_plan_id TEXT")
        else:
            try:
                conn.execute("ALTER TABLE day_plan ADD COLUMN risk_plan_id TEXT")
            except Exception:
                pass

        # Inserir conta padrão se não existir
        cur = conn.execute("SELECT COUNT(*) FROM accounts")
        if cur.fetchone()[0] == 0:
            now = _now_iso()
            default_acc_id = str(uuid.uuid4())
            conn.execute(
                "INSERT INTO accounts (id, name, currency, initial_balance, current_balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                (default_acc_id, "Conta Principal (USD)", "USD", 10000.0, 10000.0, now, now)
            )

        # Inserir opções padrão de eventos se não existirem
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'event'")
        if cur.fetchone()[0] == 0:
            default_events = [
                ("BF", "Barras Fortes / Sólidas"),
                ("BP", "Barra com Pavio Superior/Inferior"),
                ("G2", "Giro 2 / Segunda Tentativa"),
                ("RP", "Rompimento"),
                ("PB", "Pullback na Média"),
            ]
            now = _now_iso()
            for code, name in default_events:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'event', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        # Inserir opções padrão de contextos
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'context'")
        if cur.fetchone()[0] == 0:
            default_contexts = [
                ("TEND", "Tendência de Alta / Baixa"),
                ("CONS", "Consolidação / Lateral"),
                ("REVT", "Reversão de Tendência"),
            ]
            now = _now_iso()
            for code, name in default_contexts:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'context', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        # Inserir opções padrão de localização
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'location'")
        if cur.fetchone()[0] == 0:
            default_locs = [
                ("VWAP", "Na VWAP"),
                ("M20", "Média Móvel de 20"),
                ("M200", "Média Móvel de 200"),
                ("SUP_RES", "Suporte / Resistência Importante"),
                ("AJUSTE", "Linha de Ajuste / Fechamento"),
            ]
            now = _now_iso()
            for code, name in default_locs:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'location', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        # Inserir opções padrão de como entrei
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'entry_type'")
        if cur.fetchone()[0] == 0:
            default_entries = [
                ("LIMIT", "Ordem Limite no Fechamento"),
                ("MARKET", "A Mercado"),
                ("STOP_LIMIT", "Ordem Stop na Violação"),
            ]
            now = _now_iso()
            for code, name in default_entries:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'entry_type', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        # Inserir opções padrão de erros
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'error_type'")
        if cur.fetchone()[0] == 0:
            default_errors = [
                ("OVER", "Overtrading / Excesso de Operações"),
                ("FOMO", "Entrada por FOMO / Impulso"),
                ("HESIT", "Hesitação / Entrada Atrasada"),
                ("STOP_MOVE", "Mover Stop Loss / Fazer PM"),
                ("NO_PLAN", "Fora do Plano / Sem Setup"),
            ]
            now = _now_iso()
            for code, name in default_errors:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'error_type', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        # Inserir opções padrão de ativos
        cur = conn.execute("SELECT COUNT(*) FROM custom_options WHERE category = 'asset'")
        if cur.fetchone()[0] == 0:
            default_assets = [
                ("EURUSD", "EUR/USD"),
                ("GBPUSD", "GBP/USD"),
                ("BTCUSD", "Bitcoin / USD"),
                ("WIN", "Mini Índice B3"),
                ("WDO", "Mini Dólar B3"),
                ("SP500", "S&P 500"),
            ]
            now = _now_iso()
            for code, name in default_assets:
                conn.execute(
                    "INSERT INTO custom_options (id, category, code, name, created_at) VALUES (?, 'asset', ?, ?, ?)",
                    (str(uuid.uuid4()), code, name, now)
                )

        conn.commit()
        if IS_POSTGRES:
            logger.info("Banco Postgres inicializado com sucesso.")
        else:
            logger.info("Banco SQLite inicializado com sucesso: %s", DB_FILE)
    finally:
        conn.close()


init_db()


# ---- Helpers de (de)serialização ----

def _sanitize_for_json(obj):
    """Recursively walk obj, converting non-native types to JSON-safe values."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_sanitize_for_json(item) for item in obj]
    if isinstance(obj, (int, float, str, bool)) or obj is None:
        return obj
    return str(obj)


def _dumps_json(obj):
    if obj is None:
        return None
    return json.dumps(_sanitize_for_json(obj), ensure_ascii=False)


def _loads_json(raw):
    if raw is None or raw == "":
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


# ---- CRUD: trades ----

_TRADE_SELECT = (
    "SELECT t.*, "
    "s.name AS strategy_name, "
    "a.name AS account_name, "
    "ev.name AS event_name, "
    "ctx.name AS context_name, "
    "loc.name AS location_name "
    "FROM trades t "
    "LEFT JOIN strategies s ON s.id = t.strategy_id "
    "LEFT JOIN accounts a ON a.id = t.account_id "
    "LEFT JOIN custom_options ev ON ev.id = t.event_id "
    "LEFT JOIN custom_options ctx ON ctx.id = t.context_id "
    "LEFT JOIN custom_options loc ON loc.id = t.location_id"
)


def create_trade(data: dict) -> dict:
    conn = get_db_connection()
    try:
        now = _now_iso()
        trade_id = data.get("id") or str(uuid.uuid4())
        
        # Se account_id não for fornecido, pega a conta ativa padrão
        account_id = data.get("account_id")
        currency = data.get("currency", "USD")
        if not account_id:
            active_acc = conn.execute("SELECT id, currency FROM accounts WHERE is_active = 1 LIMIT 1").fetchone()
            if active_acc:
                account_id = active_acc["id"]
                currency = active_acc["currency"]

        conn.execute("""
            INSERT INTO trades (id, date, time, asset, direction, entry_price, exit_price,
                                quantity, result, fees, r_multiple, risk_amount, emotions,
                                notes, strategy_id, source, added_lots, candle_size,
                                account_id, currency, event_id, context_id, location_id,
                                clean_left, first_bar, entry_type, has_addition, outcome_type, errors,
                                created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            trade_id,
            data["date"],
            data.get("time"),
            data["asset"],
            data["direction"],
            data.get("entry_price"),
            data.get("exit_price"),
            data.get("quantity"),
            data["result"],
            data.get("fees", 0),
            data.get("r_multiple"),
            data.get("risk_amount"),
            _dumps_json(data.get("emotions")),
            data.get("notes"),
            data.get("strategy_id"),
            data.get("source", "manual"),
            data.get("added_lots", 0),
            data.get("candle_size"),
            account_id,
            currency,
            data.get("event_id"),
            data.get("context_id"),
            data.get("location_id"),
            1 if data.get("clean_left") else 0,
            1 if data.get("first_bar") else 0,
            data.get("entry_type"),
            1 if data.get("has_addition") else 0,
            data.get("outcome_type"),
            _dumps_json(data.get("errors")),
            now,
            now,
        ))

        # Atualizar saldo da conta caso haja account_id
        if account_id:
            conn.execute(
                "UPDATE accounts SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?",
                (data["result"], now, account_id)
            )

        conn.commit()
        return get_trade(trade_id)
    finally:
        conn.close()


def get_trade(trade_id: str):
    conn = get_db_connection()
    try:
        row = conn.execute(
            _TRADE_SELECT + " WHERE t.id = ?",
            (trade_id,),
        ).fetchone()
        return _row_to_trade(row) if row else None
    finally:
        conn.close()


def list_trades(from_date=None, to_date=None, asset=None, direction=None, source=None, strategy_id=None, account_id=None, event_id=None) -> list:
    query = _TRADE_SELECT + " WHERE 1=1"
    params = []
    if from_date:
        query += " AND t.date >= ?"
        params.append(from_date)
    if to_date:
        query += " AND t.date <= ?"
        params.append(to_date)
    if asset:
        query += " AND t.asset = ?"
        params.append(asset)
    if direction:
        query += " AND t.direction = ?"
        params.append(direction)
    if source:
        query += " AND t.source = ?"
        params.append(source)
    if strategy_id:
        query += " AND t.strategy_id = ?"
        params.append(strategy_id)
    if account_id:
        query += " AND t.account_id = ?"
        params.append(account_id)
    if event_id:
        query += " AND t.event_id = ?"
        params.append(event_id)

    query += " ORDER BY t.date ASC, t.time ASC, t.created_at ASC"
    conn = get_db_connection()
    try:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_trade(r) for r in rows]
    finally:
        conn.close()


def update_trade(trade_id: str, data: dict) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
        if not existing:
            return None
        old_result = existing["result"]
        account_id = existing["account_id"]

        merged = dict(existing)
        for key in ("date", "time", "asset", "direction", "entry_price", "exit_price",
                    "quantity", "result", "fees", "r_multiple", "risk_amount",
                    "emotions", "notes", "strategy_id", "source",
                    "added_lots", "candle_size", "account_id", "currency",
                    "event_id", "context_id", "location_id", "clean_left",
                    "first_bar", "entry_type", "has_addition", "outcome_type", "errors"):
            if key in data:
                merged[key] = data[key]
        merged["updated_at"] = _now_iso()
        conn.execute("""
            UPDATE trades SET date=?, time=?, asset=?, direction=?, entry_price=?, exit_price=?,
                              quantity=?, result=?, fees=?, r_multiple=?, risk_amount=?,
                              emotions=?, notes=?, strategy_id=?, source=?,
                              added_lots=?, candle_size=?, account_id=?, currency=?,
                              event_id=?, context_id=?, location_id=?, clean_left=?,
                              first_bar=?, entry_type=?, has_addition=?, outcome_type=?, errors=?, updated_at=?
            WHERE id=?
        """, (
            merged["date"], merged.get("time"), merged["asset"], merged["direction"],
            merged.get("entry_price"), merged.get("exit_price"), merged.get("quantity"),
            merged["result"], merged.get("fees", 0), merged.get("r_multiple"),
            merged.get("risk_amount"), _dumps_json(merged.get("emotions")),
            merged.get("notes"), merged.get("strategy_id"),
            merged.get("source", "manual"),
            merged.get("added_lots", 0), merged.get("candle_size"),
            merged.get("account_id"), merged.get("currency", "USD"),
            merged.get("event_id"), merged.get("context_id"), merged.get("location_id"),
            1 if merged.get("clean_left") else 0,
            1 if merged.get("first_bar") else 0,
            merged.get("entry_type"),
            1 if merged.get("has_addition") else 0,
            merged.get("outcome_type"),
            _dumps_json(merged.get("errors")),
            merged["updated_at"],
            trade_id,
        ))

        # Ajustar saldo caso o resultado tenha mudado
        diff = merged["result"] - old_result
        if diff != 0 and account_id:
            conn.execute(
                "UPDATE accounts SET current_balance = current_balance + ?, updated_at = ? WHERE id = ?",
                (diff, _now_iso(), account_id)
            )

        conn.commit()
        return get_trade(trade_id)
    finally:
        conn.close()


def delete_trade(trade_id: str) -> bool:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT result, account_id FROM trades WHERE id = ?", (trade_id,)).fetchone()
        if not existing:
            return False
        cur = conn.execute("DELETE FROM trades WHERE id = ?", (trade_id,))
        if existing["account_id"]:
            conn.execute(
                "UPDATE accounts SET current_balance = current_balance - ?, updated_at = ? WHERE id = ?",
                (existing["result"], _now_iso(), existing["account_id"])
            )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def delete_all_trades() -> int:
    """Apaga todas as operações e zera o saldo corrente das contas."""
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM trades")
        conn.execute("UPDATE accounts SET current_balance = 0, updated_at = ?", (_now_iso(),))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def _row_to_trade(row):
    if row is None:
        return None
    d = dict(row)
    d["emotions"] = _loads_json(d.get("emotions")) or []
    d["errors"] = _loads_json(d.get("errors")) or []
    d["clean_left"] = bool(d.get("clean_left"))
    d["first_bar"] = bool(d.get("first_bar"))
    d["has_addition"] = bool(d.get("has_addition"))
    return d


# ---- CRUD: strategies ----

def create_strategy(data: dict) -> dict:
    conn = get_db_connection()
    try:
        now = _now_iso()
        sid = data.get("id") or str(uuid.uuid4())
        conn.execute("""
            INSERT INTO strategies (id, name, description, setup, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            sid, data["name"], data.get("description"), data.get("setup"),
            data.get("notes"), now, now,
        ))
        conn.commit()
        return get_strategy(sid)
    except IntegrityError:
        raise ValueError(f"Já existe uma estratégia com o nome '{data['name']}'.")
    finally:
        conn.close()


def get_strategy(sid: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM strategies WHERE id = ?", (sid,)).fetchone()
        return _row_to_strategy(row) if row else None
    finally:
        conn.close()


def list_strategies() -> list:
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM strategies ORDER BY name ASC").fetchall()
        return [_row_to_strategy(r) for r in rows]
    finally:
        conn.close()


def strategy_usage(sid: str) -> int:
    """Quantas trades usam a estratégia."""
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT COUNT(*) AS n FROM trades WHERE strategy_id = ?", (sid,)).fetchone()
        return row["n"] if row else 0
    finally:
        conn.close()


def update_strategy(sid: str, data: dict) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM strategies WHERE id = ?", (sid,)).fetchone()
        if not existing:
            return None
        merged = dict(existing)
        for key in ("name", "description", "setup", "notes"):
            if key in data:
                merged[key] = data[key]
        merged["updated_at"] = _now_iso()
        conn.execute("""
            UPDATE strategies SET name=?, description=?, setup=?, notes=?, updated_at=?
            WHERE id=?
        """, (
            merged["name"], merged.get("description"), merged.get("setup"),
            merged.get("notes"), merged["updated_at"], sid,
        ))
        conn.commit()
        return get_strategy(sid)
    except IntegrityError:
        raise ValueError(f"Já existe uma estratégia com o nome '{data.get('name')}'.")
    finally:
        conn.close()


def delete_strategy(sid: str) -> bool:
    conn = get_db_connection()
    try:
        # Desvincula as trades explicitamente (bancos migrados não têm a FK
        # ON DELETE SET NULL, que só vale em bancos criados do zero).
        conn.execute("UPDATE trades SET strategy_id = NULL WHERE strategy_id = ?", (sid,))
        cur = conn.execute("DELETE FROM strategies WHERE id = ?", (sid,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _row_to_strategy(row):
    if row is None:
        return None
    return dict(row)


# ---- CRUD: risk_plans ----

def _risk_plan_fields(data):
    return {
        "name": data.get("name"),
        "description": data.get("description"),
        "daily_stop_loss": data.get("daily_stop_loss"),
        "max_trades_per_day": data.get("max_trades_per_day"),
        "max_risk_per_trade": data.get("max_risk_per_trade"),
        "is_active": 1 if data.get("is_active") else 0,
    }


def create_risk_plan(data: dict) -> dict:
    conn = get_db_connection()
    try:
        now = _now_iso()
        pid = data.get("id") or str(uuid.uuid4())
        f = _risk_plan_fields(data)
        conn.execute("""
            INSERT INTO risk_plans (id, name, description, daily_stop_loss, max_trades_per_day,
                                    max_risk_per_trade, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, f["name"], f["description"], f["daily_stop_loss"],
            f["max_trades_per_day"], f["max_risk_per_trade"], f["is_active"], now, now,
        ))
        if f["is_active"]:
            # Garante que só um GR seja ativo.
            conn.execute("UPDATE risk_plans SET is_active = 0 WHERE id != ?", (pid,))
        conn.commit()
        return get_risk_plan(pid)
    except IntegrityError:
        raise ValueError(f"Já existe um GR com o nome '{data.get('name')}'.")
    finally:
        conn.close()


def get_risk_plan(pid: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM risk_plans WHERE id = ?", (pid,)).fetchone()
        return _row_to_risk_plan(row) if row else None
    finally:
        conn.close()


def list_risk_plans() -> list:
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM risk_plans ORDER BY is_active DESC, name ASC"
        ).fetchall()
        return [_row_to_risk_plan(r) for r in rows]
    finally:
        conn.close()


def risk_plan_usage(pid: str) -> int:
    """Quantos dias de day_plan usam o GR."""
    conn = get_db_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM day_plan WHERE risk_plan_id = ?", (pid,)
        ).fetchone()
        return row["n"] if row else 0
    finally:
        conn.close()


def update_risk_plan(pid: str, data: dict) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM risk_plans WHERE id = ?", (pid,)).fetchone()
        if not existing:
            return None
        merged = dict(existing)
        for key in ("name", "description", "daily_stop_loss", "max_trades_per_day",
                    "max_risk_per_trade", "is_active"):
            if key in data:
                merged[key] = data[key]
        merged["is_active"] = 1 if merged.get("is_active") else 0
        merged["updated_at"] = _now_iso()
        conn.execute("""
            UPDATE risk_plans SET name=?, description=?, daily_stop_loss=?, max_trades_per_day=?,
                                  max_risk_per_trade=?, is_active=?, updated_at=?
            WHERE id=?
        """, (
            merged["name"], merged.get("description"), merged.get("daily_stop_loss"),
            merged.get("max_trades_per_day"), merged.get("max_risk_per_trade"),
            merged["is_active"], merged["updated_at"], pid,
        ))
        if merged["is_active"]:
            conn.execute("UPDATE risk_plans SET is_active = 0 WHERE id != ?", (pid,))
        conn.commit()
        return get_risk_plan(pid)
    except IntegrityError:
        raise ValueError(f"Já existe um GR com o nome '{data.get('name')}'.")
    finally:
        conn.close()


def delete_risk_plan(pid: str) -> bool:
    conn = get_db_connection()
    try:
        # Desvincula dos day_plan explicitamente (bancos migrados não têm a FK
        # ON DELETE SET NULL, que só vale em bancos criados do zero).
        conn.execute("UPDATE day_plan SET risk_plan_id = NULL WHERE risk_plan_id = ?", (pid,))
        cur = conn.execute("DELETE FROM risk_plans WHERE id = ?", (pid,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def set_active_risk_plan(pid: str) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM risk_plans WHERE id = ?", (pid,)).fetchone()
        if not existing:
            return None
        now = _now_iso()
        conn.execute("UPDATE risk_plans SET is_active = 0, updated_at = ?", (now,))
        conn.execute("UPDATE risk_plans SET is_active = 1, updated_at = ? WHERE id = ?", (now, pid))
        conn.commit()
        return get_risk_plan(pid)
    finally:
        conn.close()


def _row_to_risk_plan(row):
    if row is None:
        return None
    d = dict(row)
    d["is_active"] = bool(d.get("is_active"))
    return d


# ---- Vínculo do GR por dia (day_plan) ----

def bind_day_risk_plan(date: str, risk_plan_id: str):
    """Faz upsert do vínculo GR->dia no day_plan da data informada."""
    conn = get_db_connection()
    try:
        now = _now_iso()
        existing = conn.execute(
            "SELECT id FROM day_plan WHERE date = ? ORDER BY created_at DESC LIMIT 1", (date,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE day_plan SET risk_plan_id = ?, updated_at = ? WHERE id = ?",
                (risk_plan_id, now, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO day_plan (id, date, risk_plan_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), date, risk_plan_id, now, now),
            )
        conn.commit()
        return get_day_plan_by_date(date)
    finally:
        conn.close()


def get_bound_risk_plan(date: str):
    """GR que vale para o dia: o do vínculo em day_plan, ou o ativo (default)."""
    conn = get_db_connection()
    try:
        row = conn.execute("""
            SELECT rp.* FROM day_plan dp
            JOIN risk_plans rp ON rp.id = dp.risk_plan_id
            WHERE dp.date = ?
            ORDER BY dp.created_at DESC LIMIT 1
        """, (date,)).fetchone()
        if row:
            return _row_to_risk_plan(row)
        row = conn.execute("SELECT * FROM risk_plans WHERE is_active = 1").fetchone()
        return _row_to_risk_plan(row) if row else None
    finally:
        conn.close()


# ---- CRUD: journal ----

def create_journal(data: dict) -> dict:
    conn = get_db_connection()
    try:
        now = _now_iso()
        jid = data.get("id") or str(uuid.uuid4())
        conn.execute("""
            INSERT INTO journal (id, trade_id, date, mood_score, emotions, discipline_rating,
                                 errors, lessons, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            jid,
            data.get("trade_id"),
            data["date"],
            data.get("mood_score"),
            _dumps_json(data.get("emotions")),
            data.get("discipline_rating"),
            _dumps_json(data.get("errors")),
            data.get("lessons"),
            now,
            now,
        ))
        conn.commit()
        return get_journal(jid)
    finally:
        conn.close()


def get_journal(jid: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM journal WHERE id = ?", (jid,)).fetchone()
        return _row_to_journal(row) if row else None
    finally:
        conn.close()


def list_journal(date=None, trade_id=None) -> list:
    query = "SELECT * FROM journal WHERE 1=1"
    params = []
    if date:
        query += " AND date = ?"
        params.append(date)
    if trade_id:
        query += " AND trade_id = ?"
        params.append(trade_id)
    query += " ORDER BY date ASC, created_at ASC"
    conn = get_db_connection()
    try:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_journal(r) for r in rows]
    finally:
        conn.close()


def update_journal(jid: str, data: dict) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM journal WHERE id = ?", (jid,)).fetchone()
        if not existing:
            return None
        merged = dict(existing)
        for key in ("trade_id", "date", "mood_score", "emotions", "discipline_rating",
                    "errors", "lessons"):
            if key in data:
                merged[key] = data[key]
        merged["updated_at"] = _now_iso()
        conn.execute("""
            UPDATE journal SET trade_id=?, date=?, mood_score=?, emotions=?,
                               discipline_rating=?, errors=?, lessons=?, updated_at=?
            WHERE id=?
        """, (
            merged.get("trade_id"), merged["date"], merged.get("mood_score"),
            _dumps_json(merged.get("emotions")), merged.get("discipline_rating"),
            _dumps_json(merged.get("errors")), merged.get("lessons"), merged["updated_at"],
            jid,
        ))
        conn.commit()
        return get_journal(jid)
    finally:
        conn.close()


def delete_journal(jid: str) -> bool:
    conn = get_db_connection()
    try:
        cur = conn.execute("DELETE FROM journal WHERE id = ?", (jid,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _row_to_journal(row):
    if row is None:
        return None
    d = dict(row)
    d["emotions"] = _loads_json(d.get("emotions")) or []
    d["errors"] = _loads_json(d.get("errors")) or []
    return d


# ---- CRUD: day_plan (Fase 2) ----

def create_day_plan(data: dict) -> dict:
    conn = get_db_connection()
    try:
        now = _now_iso()
        pid = data.get("id") or str(uuid.uuid4())
        conn.execute("""
            INSERT INTO day_plan (id, date, scenarios, goals, levels, review, risk_plan_id,
                                  created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, data["date"], _dumps_json(data.get("scenarios")), _dumps_json(data.get("goals")),
            _dumps_json(data.get("levels")), _dumps_json(data.get("review")),
            data.get("risk_plan_id"), now, now,
        ))
        conn.commit()
        return get_day_plan(pid)
    finally:
        conn.close()


def get_day_plan(pid: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM day_plan WHERE id = ?", (pid,)).fetchone()
        return _row_to_day_plan(row) if row else None
    finally:
        conn.close()


def get_day_plan_by_date(date: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM day_plan WHERE date = ? ORDER BY created_at DESC LIMIT 1", (date,)).fetchone()
        return _row_to_day_plan(row) if row else None
    finally:
        conn.close()


def update_day_plan(pid: str, data: dict) -> dict:
    conn = get_db_connection()
    try:
        existing = conn.execute("SELECT * FROM day_plan WHERE id = ?", (pid,)).fetchone()
        if not existing:
            return None
        merged = dict(existing)
        for key in ("date", "scenarios", "goals", "levels", "review", "risk_plan_id"):
            if key in data:
                merged[key] = data[key]
        merged["updated_at"] = _now_iso()
        conn.execute("""
            UPDATE day_plan SET date=?, scenarios=?, goals=?, levels=?, review=?,
                                risk_plan_id=?, updated_at=?
            WHERE id=?
        """, (
            merged["date"], _dumps_json(merged.get("scenarios")), _dumps_json(merged.get("goals")),
            _dumps_json(merged.get("levels")), _dumps_json(merged.get("review")),
            merged.get("risk_plan_id"), merged["updated_at"], pid,
        ))
        conn.commit()
        return get_day_plan(pid)
    finally:
        conn.close()


def _row_to_day_plan(row):
    if row is None:
        return None
    d = dict(row)
    for key in ("scenarios", "goals", "levels", "review"):
        d[key] = _loads_json(d.get(key))
    return d
