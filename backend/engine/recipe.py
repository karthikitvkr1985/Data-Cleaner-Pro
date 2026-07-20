"""Recipe recording and replay engine."""
from __future__ import annotations


import pandas as pd

from backend.models.schemas import RecipeStep


def apply_recipe(
    df: pd.DataFrame,
    steps: list[RecipeStep],
) -> tuple[pd.DataFrame, int, int]:
    """
    Replay recipe steps against a new dataframe.
    Returns (result_df, steps_applied, steps_skipped).
    """
    applied = 0
    skipped = 0

    for step in steps:
        try:
            df = _apply_step(df, step)
            applied += 1
        except Exception as e:
            print(f"[recipe] Skipped step '{step.step_id}': {e}")
            skipped += 1

    return df, applied, skipped


def _apply_step(df: pd.DataFrame, step: RecipeStep) -> pd.DataFrame:
    module = step.module
    params = step.params

    if module == "format":
        return _apply_format_step(df, params)
    elif module == "missing":
        return _apply_missing_step(df, params)
    elif module == "dedup":
        return _apply_dedup_step(df, params)
    elif module == "nl":
        from backend.ai.suggestion_engine import apply_nl_intent
        intent = params.get("intent", {})
        return apply_nl_intent(df, intent)
    else:
        # Unknown module — skip silently
        return df


def _apply_format_step(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    col = params.get("column_name")
    status = params.get("status")
    value = params.get("value")
    category = params.get("category")
    row_index = params.get("row_index")

    if col is None or col not in df.columns:
        return df

    df = df.copy()

    if row_index is not None:
        if row_index < len(df):
            df.at[row_index, col] = value
        return df

    # Column-level
    if category == "format":
        if value == "upper":
            df[col] = df[col].astype(str).str.upper()
        elif value == "lower":
            df[col] = df[col].astype(str).str.lower()
        elif value == "title":
            df[col] = df[col].astype(str).str.title()
        elif value == "strip":
            df[col] = df[col].astype(str).str.strip()
    elif category == "missing_value" and value is not None:
        if value == "drop":
            df = df.dropna(subset=[col])
        else:
            df[col] = df[col].fillna(value)
    elif category == "duplicate" and status == "accepted":
        df = df.drop_duplicates(keep="first")

    return df


def _apply_missing_step(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    col = params.get("column_name")
    strategy = params.get("strategy", "fill")
    value = params.get("value")

    if col is None or col not in df.columns:
        return df

    from backend.engine.missing_values import apply_missing_strategy
    return apply_missing_strategy(df, col, strategy, custom_value=value)


def _apply_dedup_step(df: pd.DataFrame, params: dict) -> pd.DataFrame:
    key_cols = params.get("key_columns")
    if key_cols:
        key_cols = [c for c in key_cols if c in df.columns]
        if key_cols:
            return df.drop_duplicates(subset=key_cols, keep="first")
    return df.drop_duplicates(keep="first")


def generate_markdown(session_id: str, filename: str, steps: list[RecipeStep]) -> str:
    lines = [
        f"# Cleaning Recipe — {filename}",
        f"\n**Session:** `{session_id}`",
        f"\n## Steps ({len(steps)} total)\n",
    ]
    for i, step in enumerate(steps, 1):
        lines.append(f"{i}. **[{step.module.upper()}]** {step.description}")
        if step.params:
            for k, v in step.params.items():
                if k not in ("preview_id",):
                    lines.append(f"   - `{k}`: `{v}`")
    if not steps:
        lines.append("No steps recorded yet.")
    return "\n".join(lines)
