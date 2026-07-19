"""Apply router — suggestion updates, bulk actions, NL commands, preview."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import pandas as pd
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from backend.models.schemas import (
    ApplyResult,
    BulkApplyResult,
    BulkSuggestionInput,
    NLCommandConfirmInput,
    NLCommandInput,
    NLCommandPreview,
    NLConfirmResult,
    PagedPreview,
    RecipeApplyResult,
    RecipeStep,
    Suggestion,
    SuggestionUpdateInput,
)

if TYPE_CHECKING:
    from backend.main import SessionStore

router = APIRouter(prefix="/api", tags=["suggestions"])


def _get_store(request: Request) -> "SessionStore":
    return request.app.state.store


def _require_session(store: "SessionStore", session_id: str) -> dict:
    data = store.get(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found or expired")
    return data


def _apply_suggestion_to_df(df: pd.DataFrame, suggestion: Suggestion) -> pd.DataFrame:
    """Apply an accepted or edited suggestion to the dataframe."""
    df = df.copy()
    value = suggestion.proposed_value if suggestion.status == "accepted" else suggestion.edited_value

    if suggestion.row_index is not None:
        col = suggestion.column_name
        if col in df.columns and suggestion.row_index < len(df):
            df.at[suggestion.row_index, col] = value
    else:
        # Column-level suggestions: apply to whole column
        col = suggestion.column_name
        if col not in df.columns:
            return df
        cat = suggestion.category
        if cat == "type_fix":
            df[col] = pd.to_numeric(df[col], errors="coerce") if value in ("integer", "float") else df[col]
        elif cat == "format" and value is not None:
            if value == "upper":
                df[col] = df[col].astype(str).str.upper()
            elif value == "lower":
                df[col] = df[col].astype(str).str.lower()
            elif value == "title":
                df[col] = df[col].astype(str).str.title()
            elif value == "strip":
                df[col] = df[col].astype(str).str.strip()
        elif cat == "missing_value" and value is not None:
            if value == "drop":
                df = df.dropna(subset=[col])
            else:
                df[col] = df[col].fillna(value)
        elif cat == "duplicate":
            if suggestion.row_index is None and "Drop duplicate row" in suggestion.reason:
                # handled at row level when row_index is set
                pass
    return df


@router.post("/sessions/{session_id}/suggestions/{suggestion_id}", response_model=ApplyResult)
async def update_suggestion(
    session_id: str,
    suggestion_id: str,
    body: SuggestionUpdateInput,
    request: Request,
) -> ApplyResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    suggestions: dict = data["suggestions"]
    if suggestion_id not in suggestions:
        raise HTTPException(status_code=404, detail=f"Suggestion '{suggestion_id}' not found")

    suggestion: Suggestion = suggestions[suggestion_id]

    if body.status == "edited":
        suggestion.status = "edited"
        suggestion.edited_value = body.edited_value
    else:
        suggestion.status = body.status

    applied = False
    if suggestion.status in ("accepted", "edited") and data.get("df") is not None:
        data["df"] = _apply_suggestion_to_df(data["df"], suggestion)
        # Record recipe step
        step = RecipeStep(
            step_id=str(uuid.uuid4()),
            module="format",
            description=f"{suggestion.category}: {suggestion.reason} on '{suggestion.column_name}'",
            params={
                "suggestion_id": suggestion_id,
                "category": suggestion.category,
                "column_name": suggestion.column_name,
                "row_index": suggestion.row_index,
                "value": suggestion.proposed_value if suggestion.status == "accepted" else body.edited_value,
                "status": suggestion.status,
            },
        )
        data["recipe_steps"].append(step)
        applied = True

    data["suggestions"][suggestion_id] = suggestion
    store.set(session_id, data)
    return ApplyResult(suggestion=suggestion, applied=applied)


@router.post("/sessions/{session_id}/suggestions/bulk", response_model=BulkApplyResult)
async def bulk_update_suggestions(
    session_id: str,
    body: BulkSuggestionInput,
    request: Request,
) -> BulkApplyResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    updated: list[Suggestion] = []
    df = data.get("df")

    for sid, suggestion in data["suggestions"].items():
        if suggestion.status != "pending":
            continue
        match = True
        if body.category and suggestion.category != body.category:
            match = False
        if body.column_name and suggestion.column_name != body.column_name:
            match = False
        if not match:
            continue

        suggestion.status = body.status
        if suggestion.status == "accepted" and df is not None:
            df = _apply_suggestion_to_df(df, suggestion)
        updated.append(suggestion)

    if updated:
        data["df"] = df
        step = RecipeStep(
            step_id=str(uuid.uuid4()),
            module="format",
            description=f"Bulk {body.status}: category={body.category}, column={body.column_name} ({len(updated)} items)",
            params={
                "category": body.category,
                "column_name": body.column_name,
                "status": body.status,
                "count": len(updated),
            },
        )
        data["recipe_steps"].append(step)

    store.set(session_id, data)
    return BulkApplyResult(updated_count=len(updated), suggestions=updated)


@router.get("/sessions/{session_id}/preview", response_model=PagedPreview)
async def get_preview(
    session_id: str,
    request: Request,
    page: int = 0,
    page_size: int = 100,
    show_original: bool = False,
) -> PagedPreview:
    store = _get_store(request)
    data = _require_session(store, session_id)

    df = data.get("df")
    df_original = data.get("df_original")

    if df is None:
        return PagedPreview(rows=[], total_rows=0, page=page, page_size=page_size, columns=[])

    page_size = min(page_size, 1000)
    start = page * page_size
    end = start + page_size
    slice_df = df.iloc[start:end]
    columns = list(df.columns)

    def _safe_rows(frame: pd.DataFrame) -> list[dict]:
        rows = []
        for _, row in frame.iterrows():
            r = {}
            for c in frame.columns:
                val = row[c]
                if pd.isna(val) if not isinstance(val, str) else False:
                    r[c] = None
                else:
                    r[c] = str(val) if not isinstance(val, (int, float, bool, type(None))) else val
            rows.append(r)
        return rows

    rows = _safe_rows(slice_df)
    original_rows = None
    if show_original and df_original is not None:
        orig_slice = df_original.iloc[start:end]
        original_rows = _safe_rows(orig_slice)

    return PagedPreview(
        rows=rows,
        total_rows=len(df),
        page=page,
        page_size=page_size,
        columns=columns,
        original_rows=original_rows,
    )


@router.post("/sessions/{session_id}/nl-command", response_model=NLCommandPreview)
async def submit_nl_command(
    session_id: str,
    body: NLCommandInput,
    request: Request,
) -> NLCommandPreview:
    store = _get_store(request)
    data = _require_session(store, session_id)

    df = data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No data loaded. Run detect-structure first.")

    from backend.ai.suggestion_engine import get_nl_preview

    columns = data.get("columns", [])
    preview = get_nl_preview(body.instruction, df, columns)
    data["nl_previews"][preview.preview_id] = preview
    store.set(session_id, data)
    return preview


@router.post("/sessions/{session_id}/nl-command/confirm", response_model=NLConfirmResult)
async def confirm_nl_command(
    session_id: str,
    body: NLCommandConfirmInput,
    request: Request,
) -> NLConfirmResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    preview = data.get("nl_previews", {}).get(body.preview_id)
    if preview is None:
        raise HTTPException(status_code=404, detail=f"Preview '{body.preview_id}' not found")

    df = data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No data loaded.")

    from backend.ai.suggestion_engine import apply_nl_intent

    intent = preview.intent
    df = apply_nl_intent(df, intent)
    data["df"] = df

    step = RecipeStep(
        step_id=str(uuid.uuid4()),
        module="nl",
        description=preview.description,
        params={"preview_id": body.preview_id, "intent": intent},
    )
    data["recipe_steps"].append(step)
    store.set(session_id, data)
    return NLConfirmResult(applied=True, recipe_step=step)


@router.post("/sessions/{session_id}/recipe/apply-to-new-file", response_model=RecipeApplyResult)
async def apply_recipe_to_new_file(
    session_id: str,
    request: Request,
    file: UploadFile = File(...),
) -> RecipeApplyResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    recipe_steps = data.get("recipe_steps", [])
    content = await file.read()
    filename = file.filename or "upload"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    from backend.routers.upload import _detect_sheets
    from backend.engine.type_inference import load_dataframe
    from backend.engine.recipe import apply_recipe

    sheets = _detect_sheets(content, ext)
    sheet = sheets[0] if sheets else "Sheet1"
    df, df_original = load_dataframe(content, ext, sheet)

    new_df, steps_applied, steps_skipped = apply_recipe(df, recipe_steps)

    new_session_id = store.new_session(filename, content, ext, sheets)
    new_data = store.get(new_session_id)
    if new_data is not None:
        new_data["df"] = new_df
        new_data["df_original"] = df_original
        new_data["selected_sheet"] = sheet
        new_data["recipe_steps"] = recipe_steps[:steps_applied]
        store.set(new_session_id, new_data)

    return RecipeApplyResult(
        new_session_id=new_session_id,
        steps_applied=steps_applied,
        steps_skipped=steps_skipped,
    )
