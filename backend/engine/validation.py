"""Validation engine — auto-generate pandera/manual rules and surface violations."""
from __future__ import annotations

import uuid

import pandas as pd

from backend.models.schemas import ColumnProfile, Suggestion, ValidationRule


def generate_validation_rules(
    columns: list[ColumnProfile],
    df: pd.DataFrame,
) -> list[ValidationRule]:
    rules: list[ValidationRule] = []

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue

        if profile.inferred_type in ("integer", "float"):
            stats = profile.stats
            min_val = stats.get("min")
            max_val = stats.get("max")
            if min_val is not None and max_val is not None:
                rules.append(ValidationRule(
                    rule_id=str(uuid.uuid4()),
                    column_name=col,
                    rule_type="range",
                    description=f"'{col}' values must be between {min_val} and {max_val}",
                    params={"min": min_val, "max": max_val},
                    enabled=True,
                ))
            rules.append(ValidationRule(
                rule_id=str(uuid.uuid4()),
                column_name=col,
                rule_type="not_null",
                description=f"'{col}' must not be null",
                params={},
                enabled=profile.null_count == 0,
            ))

        elif profile.inferred_type == "categorical":
            top_vals = list(profile.stats.get("top_values", {}).keys())
            if top_vals and len(top_vals) <= 20:
                rules.append(ValidationRule(
                    rule_id=str(uuid.uuid4()),
                    column_name=col,
                    rule_type="isin",
                    description=f"'{col}' must be one of: {', '.join(top_vals[:10])}",
                    params={"allowed_values": top_vals},
                    enabled=True,
                ))

        elif profile.inferred_type == "string":
            # Max length rule based on observed data
            lengths = df[col].dropna().astype(str).str.len()
            if len(lengths) > 0:
                max_len = int(lengths.max())
                if max_len > 0:
                    rules.append(ValidationRule(
                        rule_id=str(uuid.uuid4()),
                        column_name=col,
                        rule_type="max_length",
                        description=f"'{col}' length must not exceed {max_len} characters",
                        params={"max_length": max_len},
                        enabled=False,  # off by default — user opts in
                    ))

        elif profile.inferred_type == "datetime":
            rules.append(ValidationRule(
                rule_id=str(uuid.uuid4()),
                column_name=col,
                rule_type="parseable_datetime",
                description=f"'{col}' values must be parseable as a date/time",
                params={},
                enabled=True,
            ))

    return rules


def run_validation(
    df: pd.DataFrame,
    rules: list[ValidationRule],
) -> list[Suggestion]:
    """Run enabled validation rules and return violation suggestions."""
    suggestions: list[Suggestion] = []

    for rule in rules:
        if not rule.enabled:
            continue
        col = rule.column_name
        if col not in df.columns:
            continue

        violations = _check_rule(df, col, rule)
        suggestions.extend(violations)

    return suggestions


def _check_rule(df: pd.DataFrame, col: str, rule: ValidationRule) -> list[Suggestion]:
    suggestions = []
    series = df[col]
    params = rule.params

    if rule.rule_type == "not_null":
        null_mask = series.isna()
        for idx in df.index[null_mask][:20]:
            suggestions.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=int(idx),
                column_name=col,
                original_value=None,
                proposed_value=None,
                reason=f"Rule violation: '{col}' is null at row {idx} (must not be null)",
                category="validation",
                status="pending",
            ))

    elif rule.rule_type == "range":
        min_val = params.get("min")
        max_val = params.get("max")
        if min_val is None and max_val is None:
            return []
        numeric = pd.to_numeric(series, errors="coerce")
        if min_val is not None:
            violations = df.index[(numeric < min_val) & numeric.notna()]
            for idx in violations[:10]:
                suggestions.append(Suggestion(
                    id=str(uuid.uuid4()),
                    row_index=int(idx),
                    column_name=col,
                    original_value=str(series.at[idx]),
                    proposed_value=str(min_val),
                    reason=f"Rule violation: '{col}' = {series.at[idx]} is below minimum {min_val}",
                    category="validation",
                    status="pending",
                ))
        if max_val is not None:
            violations = df.index[(numeric > max_val) & numeric.notna()]
            for idx in violations[:10]:
                suggestions.append(Suggestion(
                    id=str(uuid.uuid4()),
                    row_index=int(idx),
                    column_name=col,
                    original_value=str(series.at[idx]),
                    proposed_value=str(max_val),
                    reason=f"Rule violation: '{col}' = {series.at[idx]} exceeds maximum {max_val}",
                    category="validation",
                    status="pending",
                ))

    elif rule.rule_type == "isin":
        allowed = set(params.get("allowed_values", []))
        if not allowed:
            return []
        mask = series.notna() & ~series.astype(str).isin(allowed)
        for idx in df.index[mask][:10]:
            suggestions.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=int(idx),
                column_name=col,
                original_value=str(series.at[idx]),
                proposed_value=None,
                reason=f"Rule violation: '{col}' = '{series.at[idx]}' is not in the allowed values list",
                category="validation",
                status="pending",
            ))

    elif rule.rule_type == "max_length":
        max_len = params.get("max_length", 255)
        mask = series.notna() & (series.astype(str).str.len() > max_len)
        for idx in df.index[mask][:10]:
            val = str(series.at[idx])
            suggestions.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=int(idx),
                column_name=col,
                original_value=val,
                proposed_value=val[:max_len],
                reason=f"Rule violation: '{col}' value has {len(val)} chars, exceeds max {max_len}",
                category="validation",
                status="pending",
            ))

    elif rule.rule_type == "parseable_datetime":
        parsed = pd.to_datetime(series, errors="coerce")
        mask = series.notna() & parsed.isna()
        for idx in df.index[mask][:10]:
            suggestions.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=int(idx),
                column_name=col,
                original_value=str(series.at[idx]),
                proposed_value=None,
                reason=f"Rule violation: '{col}' = '{series.at[idx]}' cannot be parsed as a date/time",
                category="validation",
                status="pending",
            ))

    return suggestions
