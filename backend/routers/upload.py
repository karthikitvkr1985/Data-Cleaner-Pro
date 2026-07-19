"""File upload router — POST /api/upload"""
from __future__ import annotations

import io
from typing import TYPE_CHECKING

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from backend.models.schemas import UploadResult

if TYPE_CHECKING:
    from backend.main import SessionStore

router = APIRouter(prefix="/api", tags=["upload"])

ALLOWED_EXTENSIONS = {".xlsx", ".xls", ".csv", ".tsv"}


def _get_store(request: Request) -> "SessionStore":
    return request.app.state.store


@router.post("/upload", response_model=UploadResult)
async def upload_file(request: Request, file: UploadFile = File(...)) -> UploadResult:
    from backend.config import MAX_FILE_SIZE_BYTES

    filename = file.filename or "upload"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum size of {MAX_FILE_SIZE_BYTES // (1024*1024)} MB",
        )

    sheets = _detect_sheets(content, ext)
    store = _get_store(request)
    session_id = store.new_session(filename, content, ext, sheets)
    return UploadResult(session_id=session_id, sheets=sheets, original_filename=filename)


def _detect_sheets(content: bytes, ext: str) -> list[str]:
    """Return list of sheet names for Excel, or ['Sheet1'] for CSV."""
    if ext in (".csv", ".tsv"):
        return ["Sheet1"]
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        sheets = wb.sheetnames
        wb.close()
        return sheets
    except Exception:
        # Fallback: pandas
        try:
            xf = pd.ExcelFile(io.BytesIO(content))
            return xf.sheet_names
        except Exception:
            return ["Sheet1"]
