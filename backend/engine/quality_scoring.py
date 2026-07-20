from __future__ import annotations


import numpy as np
import pandas as pd

from backend.models.schemas import ColumnProfile, DataQualityScore, QualityDimension


def compute_quality_scores(
    df: pd.DataFrame,
    df_original: pd.DataFrame | None,
    columns: list[ColumnProfile],
    suggestions: list,
) -> DataQualityScore:
    total = len(df)
    if total == 0:
        return DataQualityScore(
            overall_score=0.0,
            dimensions=[],
            row_count=0,
            column_count=0,
        )

    dimensions: list[QualityDimension] = []

    completeness = _completeness_score(df, total)
    dimensions.append(completeness)

    validity = _validity_score(df, columns)
    dimensions.append(validity)

    uniqueness = _uniqueness_score(df, columns)
    dimensions.append(uniqueness)

    consistency = _consistency_score(df, columns)
    dimensions.append(consistency)

    accuracy = _accuracy_score(suggestions)
    dimensions.append(accuracy)

    integrity = _integrity_score(df, columns)
    dimensions.append(integrity)

    standardization = _standardization_score(suggestions)
    dimensions.append(standardization)

    scores = [d.score for d in dimensions if d.score is not None]
    overall = round(np.mean(scores), 1) if scores else 0.0

    if df_original is not None and len(df_original) > 0:
        original_completeness = 1.0 - df_original.isna().sum().sum() / (len(df_original) * max(len(df_original.columns), 1))
        improvement = round(completeness.score - original_completeness * 100, 1) if completeness.score is not None else None
    else:
        improvement = None

    return DataQualityScore(
        overall_score=overall,
        dimensions=dimensions,
        row_count=total,
        column_count=len(df.columns),
        before_after_improvement=improvement,
    )


def _completeness_score(df: pd.DataFrame, total: int) -> QualityDimension:
    total_cells = total * len(df.columns)
    if total_cells == 0:
        return QualityDimension(
            name="Completeness",
            score=100.0,
            description="Percentage of non-null values across all cells",
            passed=0,
            total=0,
        )
    null_cells = int(df.isna().sum().sum())
    filled_cells = total_cells - null_cells
    score = round(filled_cells / total_cells * 100, 1)
    return QualityDimension(
        name="Completeness",
        score=score,
        description="Percentage of non-null values across all cells",
        passed=filled_cells,
        total=total_cells,
    )


def _validity_score(df: pd.DataFrame, columns: list[ColumnProfile]) -> QualityDimension:
    total_cells = len(df) * len(df.columns)
    invalid = 0

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        series = df[col].dropna()
        if len(series) == 0:
            continue

        if profile.inferred_type in ("integer", "float"):
            invalid += int(pd.to_numeric(series, errors="coerce").isna().sum())
        elif profile.inferred_type == "datetime":
            invalid += int(pd.to_datetime(series, errors="coerce").isna().sum())

    valid = total_cells - invalid
    score = round(valid / max(total_cells, 1) * 100, 1)
    return QualityDimension(
        name="Validity",
        score=score,
        description="Percentage of values matching their inferred data type",
        passed=valid,
        total=total_cells,
    )


def _uniqueness_score(df: pd.DataFrame, columns: list[ColumnProfile]) -> QualityDimension:
    duplicate_cols = 0

    for i in range(len(columns)):
        for j in range(i + 1, len(columns)):
            c1, c2 = columns[i].name, columns[j].name
            if c1 not in df.columns or c2 not in df.columns:
                continue
            if df[c1].dtype == df[c2].dtype and df[c1].nunique() == df[c2].nunique():
                if c1 != c2 and df[c1].dropna().equals(df[c2].dropna()):
                    duplicate_cols += 1
                    break

    dup_mask = df.duplicated(keep="first")
    duplicate_rows = int(dup_mask.sum())
    unique_rows = len(df) - duplicate_rows
    score = round(unique_rows / max(len(df), 1) * 100, 1)
    return QualityDimension(
        name="Uniqueness",
        score=score,
        description="Percentage of rows that are not exact duplicates",
        passed=unique_rows,
        total=len(df),
    )


def _consistency_score(df: pd.DataFrame, columns: list[ColumnProfile]) -> QualityDimension:
    issues = 0
    checks = 0

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        series = df[col].dropna().astype(str)
        if len(series) < 3:
            continue
        checks += 1

        lengths = series.str.len()
        if lengths.std() > 0 and lengths.mean() > 3:
            outlier_lens = lengths[(lengths - lengths.mean()).abs() > 2 * lengths.std()]
            issues += len(outlier_lens)

    total_checks = max(checks * len(df), 1)
    consistent = total_checks - issues
    score = round(consistent / total_checks * 100, 1)
    return QualityDimension(
        name="Consistency",
        score=score,
        description="Consistency of value formats and patterns across the dataset",
        passed=int(consistent),
        total=int(total_checks),
    )


def _accuracy_score(suggestions: list) -> QualityDimension:
    total = len(suggestions)
    if total == 0:
        return QualityDimension(
            name="Accuracy",
            score=100.0,
            description="Proportion of data not flagged by cleaning suggestions",
            passed=0,
            total=0,
        )
    pending = sum(1 for s in suggestions if getattr(s, "status", "pending") != "pending")
    score = round((1 - pending / max(total, 1)) * 100, 1)
    return QualityDimension(
        name="Accuracy",
        score=score,
        description="Proportion of data not flagged by cleaning suggestions",
        passed=total - pending,
        total=total,
    )


def _integrity_score(df: pd.DataFrame, columns: list[ColumnProfile]) -> QualityDimension:
    total_checks = 0
    violations = 0

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        col_lower = col.lower()

        if profile.inferred_type in ("integer", "float"):
            if any(kw in col_lower for kw in ["age", "count", "quantity", "year"]):
                total_checks += 1
                series = pd.to_numeric(df[col], errors="coerce").dropna()
                negatives = (series < 0).sum()
                if negatives > 0:
                    violations += int(negatives)

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        total_checks += 1
        null_pct = profile.null_count / max(profile.total_count, 1)
        if null_pct < 0.05:
            violations += profile.null_count

    total_checks = max(total_checks, 1)
    passed = total_checks - violations
    score = round(passed / total_checks * 100, 1)
    return QualityDimension(
        name="Integrity",
        score=score,
        description="Referential integrity and constraint compliance",
        passed=0,
        total=0,
    )


def _standardization_score(suggestions: list) -> QualityDimension:
    total = len(suggestions)
    if total == 0:
        return QualityDimension(
            name="Standardization",
            score=100.0,
            description="Level of format standardization applied",
            passed=0,
            total=0,
        )
    format_suggestions = sum(1 for s in suggestions if getattr(s, "category", "") == "format")
    if format_suggestions == 0:
        return QualityDimension(
            name="Standardization",
            score=100.0,
            description="Level of format standardization applied",
            passed=0,
            total=0,
        )
    resolved = sum(1 for s in suggestions if getattr(s, "category", "") == "format" and getattr(s, "status", "pending") != "pending")
    score = round((1 - (format_suggestions - resolved) / max(format_suggestions, 1)) * 100, 1)
    return QualityDimension(
        name="Standardization",
        score=score,
        description="Level of format standardization applied",
        passed=resolved,
        total=format_suggestions,
    )
