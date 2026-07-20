"""DataClean FastAPI application."""
from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.config import CORS_ALLOW_ALL, CORS_ORIGINS, SESSION_TTL_MINUTES
from backend.routers import analyze, apply, export, upload

# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

class SessionStore:
    """Thread-safe in-memory session store with TTL expiry."""

    def __init__(self, ttl_minutes: int = 60) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_minutes * 60

    def get(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._store.get(session_id)
            if entry is None:
                return None
            if time.time() - entry["accessed_at"] > self._ttl:
                del self._store[session_id]
                return None
            entry["accessed_at"] = time.time()
            return entry["data"]

    def set(self, session_id: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._store[session_id] = {
                "data": data,
                "accessed_at": time.time(),
            }

    def delete(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._store:
                del self._store[session_id]
                return True
            return False

    def cleanup_expired(self) -> int:
        """Remove expired sessions. Returns count removed."""
        with self._lock:
            now = time.time()
            to_delete = [
                k for k, v in self._store.items()
                if now - v["accessed_at"] > self._ttl
            ]
            for k in to_delete:
                del self._store[k]
            return len(to_delete)

    def new_session(self, filename: str, file_bytes: bytes, file_ext: str, sheets: list[str]) -> str:
        session_id = str(uuid.uuid4())
        data: dict[str, Any] = {
            "session_id": session_id,
            "original_filename": filename,
            "file_bytes": file_bytes,
            "file_ext": file_ext,
            "sheets": sheets,
            "selected_sheet": None,
            "df": None,
            "df_original": None,
            "columns": [],
            "suggestions": {},
            "recipe_steps": [],
            "nl_previews": {},
            "validation_rules": {},
            "table_detection": None,
            "outliers": [],
            "anomalies": [],
            "consistency_issues": [],
            "quality_score": None,
            "schema_meanings": [],
            "created_at": datetime.utcnow().isoformat(),
        }
        self.set(session_id, data)
        return session_id


# Singleton store
session_store = SessionStore(ttl_minutes=SESSION_TTL_MINUTES)

# ---------------------------------------------------------------------------
# Background cleanup thread
# ---------------------------------------------------------------------------

def _cleanup_loop() -> None:
    while True:
        time.sleep(300)  # run every 5 minutes
        try:
            removed = session_store.cleanup_expired()
            if removed:
                print(f"[SessionStore] Removed {removed} expired session(s)")
        except Exception as exc:
            print(f"[SessionStore] Cleanup error: {exc}")


_cleanup_thread = threading.Thread(target=_cleanup_loop, daemon=True)
_cleanup_thread.start()

# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DataClean API",
    description="Browser-based Excel/CSV data cleaning SaaS",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ALLOW_ALL else CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inject store into routers via app.state
@app.on_event("startup")
async def startup() -> None:
    app.state.store = session_store


# Include all routers (all prefixed with /api internally)
app.include_router(upload.router)
app.include_router(analyze.router)
app.include_router(apply.router)
app.include_router(export.router)


@app.get("/api/healthz")
async def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve compiled frontend (production) — no Vite proxy needed
# ---------------------------------------------------------------------------

FRONTEND_DIST = (
    Path(__file__).resolve().parent.parent
    / "artifacts" / "data-cleaner" / "dist" / "public"
)

_index_html: str | None = None

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        global _index_html

        if full_path.startswith("api"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))

        if _index_html is None:
            idx = FRONTEND_DIST / "index.html"
            _index_html = idx.read_text(encoding="utf-8") if idx.exists() else ""

        return HTMLResponse(_index_html) if _index_html else JSONResponse({"detail": "Not Found"}, status_code=404)
