"""Analysis router — structure detection, analyze, suggestions, validation rules."""
from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Request

from backend.models.schemas import (
    AnalysisResult,
    SessionInfo,
    SuggestionList,
    StructureDetectInput,
    TableDetectionResult,
    ValidationRuleList,
    ValidationRuleUpdate,
    ValidationRule,
    DeleteResult,
)
from datetime import datetime

if TYPE_CHECKING:
    from backend.main import SessionStore

router = APIRouter(prefix="/api", tags=["sessions"])


def _get_store(request: Request) -> "SessionStore":
    return request.app.state.store


def _require_session(store: "SessionStore", session_id: str) -> dict:
    data = store.get(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found or expired")
    return data


@router.get("/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str, request: Request) -> SessionInfo:
    store = _get_store(request)
    data = _require_session(store, session_id)
    return SessionInfo(
        session_id=data["session_id"],
        original_filename=data["original_filename"],
        sheets=data["sheets"],
        selected_sheet=data.get("selected_sheet"),
        columns=data["columns"],
        suggestions=list(data["suggestions"].values()),
        recipe_steps=data["recipe_steps"],
        created_at=datetime.fromisoformat(data["created_at"]),
    )


@router.delete("/sessions/{session_id}", response_model=DeleteResult)
async def delete_session(session_id: str, request: Request) -> DeleteResult:
    store = _get_store(request)
    deleted = store.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return DeleteResult(deleted=True)


@router.post("/sessions/{session_id}/detect-structure", response_model=TableDetectionResult)
async def detect_structure(
    session_id: str, body: StructureDetectInput, request: Request
) -> TableDetectionResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    from backend.engine.structure_detection import detect_tables
    from backend.engine.type_inference import load_dataframe

    result = detect_tables(
        data["file_bytes"],
        data["file_ext"],
        body.sheet_name,
        header_row=body.header_row,
        start_row=body.start_row,
    )

    # Load the dataframe with the detected header
    df, df_original = load_dataframe(
        data["file_bytes"],
        data["file_ext"],
        body.sheet_name,
        header_row=result.tables[0].header_row if result.tables else body.header_row,
    )
    data["df"] = df
    data["df_original"] = df_original
    data["selected_sheet"] = body.sheet_name
    data["table_detection"] = result
    store.set(session_id, data)
    return result


@router.post("/sessions/{session_id}/analyze", response_model=AnalysisResult)
async def analyze_session(session_id: str, request: Request) -> AnalysisResult:
    store = _get_store(request)
    data = _require_session(store, session_id)

    if data.get("df") is None:
        # Auto-load first sheet if not yet loaded
        from backend.engine.type_inference import load_dataframe
        sheet = data["sheets"][0] if data["sheets"] else "Sheet1"
        df, df_original = load_dataframe(
            data["file_bytes"], data["file_ext"], sheet
        )
        data["df"] = df
        data["df_original"] = df_original
        data["selected_sheet"] = sheet

    df = data["df"]
    import uuid

    from backend.engine.type_inference import infer_column_profiles
    from backend.engine.formatting import generate_formatting_suggestions
    from backend.engine.deduplication import generate_dedup_suggestions
    from backend.engine.missing_values import generate_missing_value_suggestions
    from backend.engine.validation import generate_validation_rules, run_validation

    # 1. Type inference
    columns = infer_column_profiles(df)
    data["columns"] = columns

    # 2. Generate suggestions from each module
    all_suggestions: list = []
    all_suggestions.extend(generate_formatting_suggestions(df, columns))
    all_suggestions.extend(generate_dedup_suggestions(df, columns))
    all_suggestions.extend(generate_missing_value_suggestions(df, columns))

    # 3. Validation rules + violations
    rules = generate_validation_rules(columns, df)
    data["validation_rules"] = {r.rule_id: r for r in rules}
    all_suggestions.extend(run_validation(df, rules))

    # Store suggestions as dict keyed by id
    data["suggestions"] = {s.id: s for s in all_suggestions}
    store.set(session_id, data)

    return AnalysisResult(columns=columns, suggestions=all_suggestions)


@router.get("/sessions/{session_id}/suggestions", response_model=SuggestionList)
async def get_suggestions(
    session_id: str,
    request: Request,
    status: str | None = None,
    category: str | None = None,
    column_name: str | None = None,
) -> SuggestionList:
    store = _get_store(request)
    data = _require_session(store, session_id)
    suggestions = list(data["suggestions"].values())

    if status:
        suggestions = [s for s in suggestions if s.status == status]
    if category:
        suggestions = [s for s in suggestions if s.category == category]
    if column_name:
        suggestions = [s for s in suggestions if s.column_name == column_name]

    return SuggestionList(suggestions=suggestions, total=len(suggestions))


@router.get("/sessions/{session_id}/validation-rules", response_model=ValidationRuleList)
async def get_validation_rules(session_id: str, request: Request) -> ValidationRuleList:
    store = _get_store(request)
    data = _require_session(store, session_id)
    rules = list(data.get("validation_rules", {}).values())
    return ValidationRuleList(rules=rules)


@router.patch("/sessions/{session_id}/validation-rules/{rule_id}", response_model=ValidationRule)
async def update_validation_rule(
    session_id: str, rule_id: str, body: ValidationRuleUpdate, request: Request
) -> ValidationRule:
    store = _get_store(request)
    data = _require_session(store, session_id)
    rules = data.get("validation_rules", {})
    if rule_id not in rules:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    rule = rules[rule_id]
    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.params is not None:
        rule.params.update(body.params)
    if body.description is not None:
        rule.description = body.description
    rules[rule_id] = rule
    data["validation_rules"] = rules
    store.set(session_id, data)
    return rule
