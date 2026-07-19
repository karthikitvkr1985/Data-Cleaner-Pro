"""Formatting suggestions — whitespace, case, currency, date, email/phone/URL validation."""
from __future__ import annotations

import re
import uuid
from typing import Any

import pandas as pd

from backend.models.schemas import ColumnProfile, Suggestion

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[a-z]{2,}$", re.IGNORECASE)
PHONE_RE = re.compile(r"^\+?[\d\s\-().]{7,20}$")
URL_RE = re.compile(r"^https?://[^\s<>\"]+", re.IGNORECASE)
CURRENCY_RE = re.compile(r"[\$€£¥₹]|,(?=\d{3})")
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")
DOUBLE_SPACE_RE = re.compile(r" {2,}")


def generate_formatting_suggestions(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[Suggestion]:
    suggestions: list[Suggestion] = []

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        series = df[col].dropna().astype(str)

        # 1. Whitespace / control character issues
        ws_issues = _find_whitespace_issues(series, col)
        suggestions.extend(ws_issues)

        # 2. Currency cleanup (string columns that contain numeric + symbols)
        if profile.inferred_type in ("string", "float", "integer"):
            curr_suggestions = _find_currency_issues(series, col, df[col])
            suggestions.extend(curr_suggestions)

        # 3. Date normalization
        if profile.inferred_type == "datetime":
            date_suggestions = _find_date_issues(df[col], col)
            suggestions.extend(date_suggestions)

        # 4. Email validation
        if profile.inferred_type in ("string", "categorical") and _looks_like_email_col(col):
            suggestions.extend(_find_email_issues(series, col))

        # 5. URL validation
        if profile.inferred_type == "string" and _looks_like_url_col(col):
            suggestions.extend(_find_url_issues(series, col))

    return suggestions


def _find_whitespace_issues(series: pd.Series, col: str) -> list[Suggestion]:
    issues = []
    seen: set[str] = set()
    for val in series:
        stripped = val.strip()
        cleaned = DOUBLE_SPACE_RE.sub(" ", stripped)
        cleaned = CONTROL_CHAR_RE.sub("", cleaned)
        if cleaned != val and cleaned not in seen:
            seen.add(cleaned)
            issues.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=None,
                column_name=col,
                original_value=val,
                proposed_value=cleaned,
                reason=f"Strip whitespace/control characters in column '{col}'",
                category="format",
                status="pending",
            ))
            if len(issues) >= 3:
                break
    # Aggregate: if many rows have issues, create a column-level suggestion
    ws_count = sum(1 for v in series if v.strip() != v or DOUBLE_SPACE_RE.search(v))
    if ws_count > 3:
        issues.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=col,
            original_value=None,
            proposed_value="strip",
            reason=f"{ws_count} values in '{col}' have leading/trailing whitespace or control characters",
            category="format",
            status="pending",
        ))
    return issues


def _find_currency_issues(series: pd.Series, col: str, original_series: pd.Series) -> list[Suggestion]:
    issues = []
    count = sum(1 for v in series if CURRENCY_RE.search(v))
    if count > 0:
        sample = next((v for v in series if CURRENCY_RE.search(v)), "")
        cleaned_sample = CURRENCY_RE.sub("", sample).replace(",", "").strip()
        issues.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=col,
            original_value=sample,
            proposed_value=cleaned_sample,
            reason=f"{count} values in '{col}' contain currency symbols or thousands separators — strip to normalize numeric values",
            category="format",
            status="pending",
        ))
    return issues


def _find_date_issues(series: pd.Series, col: str) -> list[Suggestion]:
    issues = []
    try:
        parsed = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
        non_null = parsed.dropna()
        if len(non_null) == 0:
            return issues
        # Count inconsistent formats
        original_formats: set[str] = set()
        for v in series.dropna().astype(str).head(50):
            if "/" in v:
                original_formats.add("MM/DD/YYYY or similar")
            elif "-" in v and "T" in v:
                original_formats.add("ISO 8601")
            elif "-" in v:
                original_formats.add("YYYY-MM-DD")
        if len(original_formats) > 1 or ("ISO 8601" not in original_formats and len(original_formats) > 0):
            issues.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=None,
                column_name=col,
                original_value=series.dropna().astype(str).iloc[0] if len(series.dropna()) > 0 else None,
                proposed_value=str(non_null.iloc[0].date()) if len(non_null) > 0 else None,
                reason=f"Normalize '{col}' to consistent ISO 8601 date format (YYYY-MM-DD)",
                category="format",
                status="pending",
            ))
    except Exception:
        pass
    return issues


def _looks_like_email_col(col: str) -> bool:
    return any(keyword in col.lower() for keyword in ["email", "e-mail", "mail"])


def _looks_like_url_col(col: str) -> bool:
    return any(keyword in col.lower() for keyword in ["url", "link", "website", "href"])


def _find_email_issues(series: pd.Series, col: str) -> list[Suggestion]:
    invalid = [v for v in series if v and not EMAIL_RE.match(v.strip())]
    if not invalid:
        return []
    return [Suggestion(
        id=str(uuid.uuid4()),
        row_index=None,
        column_name=col,
        original_value=invalid[0],
        proposed_value=None,
        reason=f"{len(invalid)} values in '{col}' do not match a valid email format",
        category="validation",
        status="pending",
    )]


def _find_url_issues(series: pd.Series, col: str) -> list[Suggestion]:
    invalid = [v for v in series if v and not URL_RE.match(v.strip())]
    if not invalid:
        return []
    return [Suggestion(
        id=str(uuid.uuid4()),
        row_index=None,
        column_name=col,
        original_value=invalid[0],
        proposed_value=None,
        reason=f"{len(invalid)} values in '{col}' do not match a valid URL format",
        category="validation",
        status="pending",
    )]
