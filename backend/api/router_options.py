import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from ..db import get_db_connection, _now_iso
from ..models import CustomOptionIn, CustomOptionOut

router = APIRouter(prefix="/api/options", tags=["options"])


@router.get("", response_model=List[CustomOptionOut])
def list_options(category: Optional[str] = Query(None)):
    conn = get_db_connection()
    try:
        if category:
            rows = conn.execute(
                "SELECT * FROM custom_options WHERE category = ? ORDER BY code ASC, name ASC",
                (category,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM custom_options ORDER BY category ASC, name ASC"
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("", response_model=CustomOptionOut, status_code=status.HTTP_201_CREATED)
def create_option(data: CustomOptionIn):
    conn = get_db_connection()
    try:
        now = _now_iso()
        opt_id = str(uuid.uuid4())
        code_val = data.code.strip().upper() if data.code else None

        conn.execute(
            """
            INSERT INTO custom_options (id, category, code, name, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (opt_id, data.category, code_val, data.name, now)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM custom_options WHERE id = ?", (opt_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_option(option_id: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM custom_options WHERE id = ?", (option_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Opção não encontrada")

        conn.execute("DELETE FROM custom_options WHERE id = ?", (option_id,))
        conn.commit()
    finally:
        conn.close()
