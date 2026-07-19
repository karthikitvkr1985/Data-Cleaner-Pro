"""Export router — cleaned file, issues report, recipe."""
from __future__ import annotations

import io
from datetime import datetime
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.models.schemas import IssuesReport, IssueItem, RecipeExport

if TYPE_CHECKING:
    from backend.main import SessionStore

router = APIRouter(prefix="/api", tags=["export"])


def _get_store(request: Request) -> "SessionStore":
    return request.app.state.store


def _require_session(store: "SessionStore", session_id: str) -> dict:
    data = store.get(session_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found or expired")
    return data


@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    request: Request,
    format: str = "xlsx",
) -> StreamingResponse:
    store = _get_store(request)
    data = _require_session(store, session_id)

    import pandas as pd
    df = data.get("df")
    if df is None:
        raise HTTPException(status_code=400, detail="No data loaded. Run analyze first.")

    filename_base = data["original_filename"].rsplit(".", 1)[0]

    if format == "csv":
        content = df.to_csv(index=False).encode("utf-8")
        media_type = "text/csv"
        filename = f"{filename_base}_cleaned.csv"
        return StreamingResponse(
            io.BytesIO(content),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Cleaned Data")

            # Issues report sheet
            suggestions = list(data["suggestions"].values())
            issues_rows = []
            for s in suggestions:
                if s.status in ("accepted", "rejected", "edited"):
                    issues_rows.append({
                        "ID": s.id,
                        "Column": s.column_name,
                        "Row": s.row_index if s.row_index is not None else "—",
                        "Category": s.category,
                        "Original": s.original_value or "",
                        "Proposed": s.proposed_value or "",
                        "Reason": s.reason,
                        "Resolution": s.status,
                    })
            if issues_rows:
                issues_df = pd.DataFrame(issues_rows)
                issues_df.to_excel(writer, index=False, sheet_name="Issues Report")

        buf.seek(0)
        filename = f"{filename_base}_cleaned.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get("/sessions/{session_id}/issues-report", response_model=IssuesReport)
async def get_issues_report(session_id: str, request: Request) -> IssuesReport:
    store = _get_store(request)
    data = _require_session(store, session_id)

    suggestions = list(data["suggestions"].values())
    issues = []
    resolution_map = {
        "accepted": "Applied",
        "rejected": "Skipped",
        "edited": "Edited & Applied",
        "pending": "Pending",
    }
    for s in suggestions:
        issues.append(IssueItem(
            suggestion_id=s.id,
            row_index=s.row_index,
            column_name=s.column_name,
            category=s.category,
            original_value=s.original_value,
            proposed_value=s.proposed_value,
            description=s.reason,
            resolution=resolution_map.get(s.status, s.status),
        ))

    categories = {}
    for issue in issues:
        categories[issue.category] = categories.get(issue.category, 0) + 1
    summary = {
        "total": len(issues),
        "by_category": categories,
        "applied": sum(1 for s in suggestions if s.status == "accepted"),
        "rejected": sum(1 for s in suggestions if s.status == "rejected"),
        "pending": sum(1 for s in suggestions if s.status == "pending"),
    }

    return IssuesReport(
        session_id=session_id,
        issues=issues,
        generated_at=datetime.utcnow(),
        summary=summary,
    )


@router.get("/sessions/{session_id}/recipe", response_model=RecipeExport)
async def get_recipe(session_id: str, request: Request) -> RecipeExport:
    store = _get_store(request)
    data = _require_session(store, session_id)
    steps = data.get("recipe_steps", [])

    # Generate markdown summary
    lines = [
        f"# Cleaning Recipe — {data['original_filename']}",
        f"\nGenerated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        f"\nFile: `{data['original_filename']}`",
        f"\n## Steps ({len(steps)} total)\n",
    ]
    for i, step in enumerate(steps, 1):
        lines.append(f"{i}. **[{step.module.upper()}]** {step.description}")
    if not steps:
        lines.append("No steps recorded yet.")

    markdown = "\n".join(lines)
    return RecipeExport(session_id=session_id, steps=steps, markdown=markdown)
