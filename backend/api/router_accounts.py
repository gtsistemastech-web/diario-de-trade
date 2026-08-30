import sqlite3
import uuid
from typing import List
from fastapi import APIRouter, HTTPException, status
from ..db import get_db_connection, _now_iso
from ..models import AccountIn, AccountOut

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=List[AccountOut])
def list_accounts():
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM accounts ORDER BY created_at ASC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.post("", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(data: AccountIn):
    conn = get_db_connection()
    try:
        now = _now_iso()
        acc_id = str(uuid.uuid4())
        curr_bal = data.current_balance if data.current_balance is not None else data.initial_balance

        if data.is_active:
            conn.execute("UPDATE accounts SET is_active = 0")

        conn.execute(
            """
            INSERT INTO accounts (id, name, currency, initial_balance, current_balance, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (acc_id, data.name, data.currency, data.initial_balance, curr_bal, 1 if data.is_active else 0, now, now)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (acc_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: str, data: AccountIn):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conta não encontrada")

        now = _now_iso()
        curr_bal = data.current_balance if data.current_balance is not None else data.initial_balance

        if data.is_active:
            conn.execute("UPDATE accounts SET is_active = 0")

        conn.execute(
            """
            UPDATE accounts
            SET name = ?, currency = ?, initial_balance = ?, current_balance = ?, is_active = ?, updated_at = ?
            WHERE id = ?
            """,
            (data.name, data.currency, data.initial_balance, curr_bal, 1 if data.is_active else 0, now, account_id)
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return dict(updated)
    finally:
        conn.close()


@router.post("/{account_id}/activate", response_model=AccountOut)
def activate_account(account_id: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conta não encontrada")

        conn.execute("UPDATE accounts SET is_active = 0")
        conn.execute("UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?", (_now_iso(), account_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return dict(updated)
    finally:
        conn.close()


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(account_id: str):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conta não encontrada")

        count = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        if count <= 1:
            raise HTTPException(status_code=400, detail="Não é possível excluir a única conta existente")

        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        if row["is_active"]:
            other = conn.execute("SELECT id FROM accounts LIMIT 1").fetchone()
            if other:
                conn.execute("UPDATE accounts SET is_active = 1 WHERE id = ?", (other["id"],))
        conn.commit()
    finally:
        conn.close()
