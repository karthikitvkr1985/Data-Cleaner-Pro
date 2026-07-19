from __future__ import annotations
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str
    inferred_type: Literal["string", "integer", "float", "datetime", "boolean", "categorical"]
    null_count: int
    unique_count: int
    total_count: int = 0
    sample_values: list[str]
    stats: dict[str, Any] = Field(default_factory=dict)


class Suggestion(BaseModel):
    id: str
    row_index: int | None = None        # None = column-level suggestion
    column_name: str
    original_value: str | None = None
    proposed_value: str | None = None
    reason: str
    category: Literal["type_fix", "format", "duplicate", "missing_value", "validation", "structure"]
    status: Literal["pending", "accepted", "rejected", "edited"] = "pending"


class TableInfo(BaseModel):
    start_row: int
    end_row: int
    start_col: int
    end_col: int
    header_row: int | None = None
    confidence: float


class TableDetectionResult(BaseModel):
    sheet_name: str
    tables: list[TableInfo]


class RecipeStep(BaseModel):
    step_id: str
    module: Literal["structure", "type", "format", "dedup", "missing", "validation", "nl"]
    description: str
    params: dict[str, Any] = Field(default_factory=dict)


class ValidationRule(BaseModel):
    rule_id: str
    column_name: str
    rule_type: str
    description: str
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class SessionInfo(BaseModel):
    session_id: str
    original_filename: str
    sheets: list[str]
    selected_sheet: str | None = None
    columns: list[ColumnProfile]
    suggestions: list[Suggestion]
    recipe_steps: list[RecipeStep]
    created_at: datetime


class UploadResult(BaseModel):
    session_id: str
    sheets: list[str]
    original_filename: str


class StructureDetectInput(BaseModel):
    sheet_name: str
    header_row: int | None = None
    start_row: int | None = None


class SuggestionUpdateInput(BaseModel):
    status: Literal["accepted", "rejected", "edited"]
    edited_value: str | None = None


class BulkSuggestionInput(BaseModel):
    category: str | None = None
    column_name: str | None = None
    status: Literal["accepted", "rejected"]


class NLCommandInput(BaseModel):
    instruction: str


class NLCommandPreview(BaseModel):
    preview_id: str
    description: str
    intent: dict[str, Any]
    sample_before: list[dict[str, Any]]
    sample_after: list[dict[str, Any]]
    affected_count: int
    clarification_needed: str | None = None


class NLCommandConfirmInput(BaseModel):
    preview_id: str


class PagedPreview(BaseModel):
    rows: list[dict[str, Any]]
    total_rows: int
    page: int
    page_size: int
    columns: list[str]
    original_rows: list[dict[str, Any]] | None = None


class IssueItem(BaseModel):
    suggestion_id: str
    row_index: int | None = None
    column_name: str
    category: str
    original_value: str | None = None
    proposed_value: str | None = None
    description: str
    resolution: str


class IssuesReport(BaseModel):
    session_id: str
    issues: list[IssueItem]
    generated_at: datetime
    summary: dict[str, Any] = Field(default_factory=dict)


class RecipeExport(BaseModel):
    session_id: str
    steps: list[RecipeStep]
    markdown: str


class AnalysisResult(BaseModel):
    columns: list[ColumnProfile]
    suggestions: list[Suggestion]


class SuggestionList(BaseModel):
    suggestions: list[Suggestion]
    total: int


class ApplyResult(BaseModel):
    suggestion: Suggestion
    applied: bool


class BulkApplyResult(BaseModel):
    updated_count: int
    suggestions: list[Suggestion]


class NLConfirmResult(BaseModel):
    applied: bool
    recipe_step: RecipeStep


class RecipeApplyResult(BaseModel):
    new_session_id: str
    steps_applied: int
    steps_skipped: int


class ValidationRuleList(BaseModel):
    rules: list[ValidationRule]


class ValidationRuleUpdate(BaseModel):
    enabled: bool | None = None
    params: dict[str, Any] | None = None
    description: str | None = None


class DeleteResult(BaseModel):
    deleted: bool
