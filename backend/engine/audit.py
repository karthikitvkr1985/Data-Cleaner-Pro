from __future__ import annotations

import uuid
from datetime import datetime

import pandas as pd

from backend.models.schemas import AuditEntry


def build_audit_log(
    session_id: str,
    df_before: pd.DataFrame | None,
    df_after: pd.DataFrame | None,
    suggestions: list,
    recipe_steps: list,
) -> list[AuditEntry]:
    entries: list[AuditEntry] = []

    for step in recipe_steps:
        entries.append(AuditEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow().isoformat(),
            action_type="recipe_step",
            module=getattr(step, "module", "unknown"),
            description=getattr(step, "description", ""),
            details=getattr(step, "params", {}),
            confidence=1.0,
        ))

    for suggestion in suggestions:
        status = getattr(suggestion, "status", "pending")
        if status in ("accepted", "rejected", "edited"):
            entries.append(AuditEntry(
                entry_id=str(uuid.uuid4()),
                timestamp=datetime.utcnow().isoformat(),
                action_type="suggestion",
                module="review",
                description=getattr(suggestion, "reason", ""),
                details={
                    "suggestion_id": getattr(suggestion, "id", ""),
                    "column_name": getattr(suggestion, "column_name", ""),
                    "row_index": getattr(suggestion, "row_index", None),
                    "original_value": getattr(suggestion, "original_value", None),
                    "proposed_value": getattr(suggestion, "proposed_value", None),
                    "status": status,
                    "category": getattr(suggestion, "category", ""),
                },
                confidence=1.0,
            ))

    if df_before is not None and df_after is not None:
        shape_changed = df_before.shape != df_after.shape
        nulls_before = int(df_before.isna().sum().sum())
        nulls_after = int(df_after.isna().sum().sum())
        rows_before, cols_before = df_before.shape
        rows_after, cols_after = df_after.shape

        entries.append(AuditEntry(
            entry_id=str(uuid.uuid4()),
            timestamp=datetime.utcnow().isoformat(),
            action_type="data_summary",
            module="audit",
            description="Overall dataset changes after cleaning",
            details={
                "rows_before": rows_before,
                "rows_after": rows_after,
                "columns_before": cols_before,
                "columns_after": cols_after,
                "nulls_before": nulls_before,
                "nulls_after": nulls_after,
                "shape_changed": shape_changed,
            },
            confidence=1.0,
        ))

    entries.sort(key=lambda e: e.timestamp)
    return entries
