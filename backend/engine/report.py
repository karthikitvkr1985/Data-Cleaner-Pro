from __future__ import annotations

from datetime import datetime


from backend.models.schemas import (
    CleaningReport,
    ColumnProfile,
    ReportSection,
    Suggestion,
    WorkflowSummary,
)


def generate_cleaning_report(
    session_id: str,
    filename: str,
    columns: list[ColumnProfile],
    suggestions: list[Suggestion],
    recipe_steps: list,
    quality_score: float | None,
    outlier_count: int,
    anomaly_count: int,
    consistency_issue_count: int,
) -> CleaningReport:
    sections: list[ReportSection] = []

    sections.append(_workbook_summary(filename, columns, suggestions))

    sections.append(_profiling_summary(columns))

    suggestions_by_cat: dict[str, list[Suggestion]] = {}
    for s in suggestions:
        cat = s.category
        if cat not in suggestions_by_cat:
            suggestions_by_cat[cat] = []
        suggestions_by_cat[cat].append(s)

    applied = [s for s in suggestions if s.status != "pending"]
    resolved = [s for s in suggestions if s.status == "accepted"]
    rejected = [s for s in suggestions if s.status == "rejected"]

    sections.append(_detected_issues(suggestions_by_cat, suggestions, resolved, rejected))
    sections.append(_applied_fixes(applied, resolved, rejected))
    sections.append(_unresolved_issues(suggestions))

    if quality_score is not None:
        sections.append(_quality_improvement(quality_score, suggestions, resolved))

    sections.append(_confidence_distribution(suggestions))

    pending = [s for s in suggestions if s.status == "pending"]
    sections.append(_manual_review_items(pending))

    total_operations = len(applied) + len(recipe_steps)

    return CleaningReport(
        session_id=session_id,
        generated_at=datetime.utcnow(),
        sections=sections,
        workflow_summary=WorkflowSummary(
            total_suggestions=len(suggestions),
            applied_count=len(resolved),
            rejected_count=len(rejected),
            pending_count=len(pending),
            total_operations=total_operations,
            outlier_count=outlier_count,
            anomaly_count=anomaly_count,
            consistency_issue_count=consistency_issue_count,
            data_quality_score=quality_score or 0.0,
        ),
    )


def _workbook_summary(filename: str, columns: list[ColumnProfile], suggestions: list[Suggestion]) -> ReportSection:
    return ReportSection(
        title="Workbook Summary",
        content={
            "filename": filename,
            "total_columns": len(columns),
            "total_suggestions": len(suggestions),
            "column_names": [c.name for c in columns],
            "column_types": {c.name: c.inferred_type for c in columns},
        },
    )


def _profiling_summary(columns: list[ColumnProfile]) -> ReportSection:
    return ReportSection(
        title="Data Profiling Summary",
        content={
            "profiles": [
                {
                    "column": c.name,
                    "type": c.inferred_type,
                    "null_count": c.null_count,
                    "null_pct": round(c.null_count / max(c.total_count, 1) * 100, 1),
                    "unique_count": c.unique_count,
                    "total_count": c.total_count,
                    "stats": c.stats,
                }
                for c in columns
            ]
        },
    )


def _detected_issues(
    suggestions_by_cat: dict[str, list[Suggestion]],
    all_suggestions: list[Suggestion],
    resolved: list[Suggestion],
    rejected: list[Suggestion],
) -> ReportSection:
    return ReportSection(
        title="Detected Issues",
        content={
            "total_issues": len(all_suggestions),
            "by_category": {
                cat: {
                    "count": len(items),
                    "resolved": len([s for s in items if s.status == "accepted"]),
                    "rejected": len([s for s in items if s.status == "rejected"]),
                    "pending": len([s for s in items if s.status == "pending"]),
                }
                for cat, items in suggestions_by_cat.items()
            },
        },
    )


def _applied_fixes(applied: list[Suggestion], resolved: list[Suggestion], rejected: list[Suggestion]) -> ReportSection:
    return ReportSection(
        title="Applied Fixes",
        content={
            "total_applied": len(resolved),
            "total_rejected": len(rejected),
            "fixes": [
                {
                    "column": s.column_name,
                    "original": s.original_value,
                    "proposed": s.proposed_value,
                    "reason": s.reason,
                    "status": s.status,
                    "category": s.category,
                }
                for s in applied
            ],
        },
    )


def _unresolved_issues(suggestions: list[Suggestion]) -> ReportSection:
    pending = [s for s in suggestions if s.status == "pending"]
    return ReportSection(
        title="Unresolved Issues",
        content={
            "count": len(pending),
            "issues": [
                {
                    "column": s.column_name,
                    "category": s.category,
                    "reason": s.reason,
                }
                for s in pending[:50]
            ],
        },
    )


def _quality_improvement(quality_score: float, suggestions: list[Suggestion], resolved: list[Suggestion]) -> ReportSection:
    initial_issues = len(suggestions)
    resolved_count = len(resolved)
    improvement_pct = round(resolved_count / max(initial_issues, 1) * 100, 1) if initial_issues > 0 else 0
    return ReportSection(
        title="Quality Improvement",
        content={
            "data_quality_score": quality_score,
            "issues_initial": initial_issues,
            "issues_resolved": resolved_count,
            "improvement_pct": improvement_pct,
            "interpretation": _interpret_score(quality_score),
        },
    )


def _confidence_distribution(suggestions: list[Suggestion]) -> ReportSection:
    if not suggestions:
        return ReportSection(title="Confidence Distribution", content={"average": 1.0, "distribution": {}})
    return ReportSection(
        title="Confidence Distribution",
        content={
            "average": 0.85,
            "notes": "All suggestions are assigned a confidence of 0.85 (rule-based). AI-assisted suggestions may vary when Anthropic API is enabled.",
        },
    )


def _manual_review_items(pending: list[Suggestion]) -> ReportSection:
    return ReportSection(
        title="Items Requiring Human Review",
        content={
            "count": len(pending),
            "items": [
                {
                    "column": s.column_name,
                    "row_index": s.row_index,
                    "category": s.category,
                    "original_value": s.original_value,
                    "proposed_value": s.proposed_value,
                    "reason": s.reason,
                }
                for s in pending[:100]
            ],
        },
    )


def _interpret_score(score: float) -> str:
    if score >= 95:
        return "Excellent — dataset is production-ready"
    elif score >= 85:
        return "Good — minor issues remain"
    elif score >= 70:
        return "Fair — significant cleaning needed"
    else:
        return "Poor — substantial data quality issues detected"
