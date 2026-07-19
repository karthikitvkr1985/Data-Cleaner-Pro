"""Missing value detection and strategy suggestions."""
from __future__ import annotations

import uuid

import pandas as pd

from backend.models.schemas import ColumnProfile, Suggestion


def generate_missing_value_suggestions(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[Suggestion]:
    suggestions: list[Suggestion] = []
    total = len(df)
    if total == 0:
        return []

    for profile in columns:
        col = profile.name
        if profile.null_count == 0:
            continue

        missing_pct = round(profile.null_count / total * 100, 1)
        series = df[col]

        # Choose a suggested strategy based on type + missing rate
        strategy, proposed = _suggest_strategy(series, profile, missing_pct)

        suggestions.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=col,
            original_value=None,
            proposed_value=proposed,
            reason=f"'{col}' has {profile.null_count} missing values ({missing_pct}%) — suggested strategy: {strategy}",
            category="missing_value",
            status="pending",
        ))

    return suggestions


def _suggest_strategy(
    series: pd.Series,
    profile: ColumnProfile,
    missing_pct: float,
) -> tuple[str, str]:
    """Return (human-readable strategy, proposed_value for suggestion)."""
    if missing_pct > 60:
        return "drop column (>60% missing)", "drop"

    if profile.inferred_type in ("integer", "float"):
        stats = profile.stats
        median = stats.get("median")
        mean = stats.get("mean")
        if median is not None:
            return f"fill with median ({median})", str(median)
        elif mean is not None:
            return f"fill with mean ({round(mean, 2)})", str(round(mean, 2))
        return "fill with 0", "0"

    if profile.inferred_type == "categorical":
        top = profile.stats.get("top_values", {})
        if top:
            mode = max(top, key=top.get)
            return f"fill with mode ('{mode}')", mode
        return "fill with 'Unknown'", "Unknown"

    if profile.inferred_type == "boolean":
        return "fill with False", "False"

    if profile.inferred_type == "datetime":
        return "forward-fill (propagate last known date)", "ffill"

    # string / default
    if missing_pct < 5:
        return "fill with empty string", ""
    return "fill with sentinel 'N/A'", "N/A"


def apply_missing_strategy(
    df: pd.DataFrame,
    col: str,
    strategy: str,
    custom_value: str | None = None,
) -> pd.DataFrame:
    """Apply a fill strategy to a column. Used during recipe replay."""
    df = df.copy()
    if strategy == "drop":
        df = df.dropna(subset=[col])
    elif strategy == "ffill":
        df[col] = df[col].ffill()
    elif strategy == "bfill":
        df[col] = df[col].bfill()
    elif strategy == "mean":
        df[col] = df[col].fillna(pd.to_numeric(df[col], errors="coerce").mean())
    elif strategy == "median":
        df[col] = df[col].fillna(pd.to_numeric(df[col], errors="coerce").median())
    elif strategy == "mode":
        mode = df[col].mode()
        if not mode.empty:
            df[col] = df[col].fillna(mode.iloc[0])
    elif custom_value is not None:
        df[col] = df[col].fillna(custom_value)
    return df
