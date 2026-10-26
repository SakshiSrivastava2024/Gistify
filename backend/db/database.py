import os
import sqlite3
from contextlib import closing

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "progress.db")


def _connect():
    return sqlite3.connect(DB_PATH)


def init_db() -> None:
    with closing(_connect()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS concept_progress (
                paper_name TEXT NOT NULL,
                term TEXT NOT NULL,
                status TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (paper_name, term)
            )
            """
        )
        conn.commit()


def save_progress(paper_name: str, term: str, status: str) -> None:
    with closing(_connect()) as conn:
        conn.execute(
            """
            INSERT INTO concept_progress (paper_name, term, status)
            VALUES (?, ?, ?)
            ON CONFLICT(paper_name, term)
            DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
            """,
            (paper_name, term, status),
        )
        conn.commit()


def get_progress(paper_name: str) -> dict:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT term, status FROM concept_progress WHERE paper_name = ?",
            (paper_name,),
        ).fetchall()
    return {term: status for term, status in rows}