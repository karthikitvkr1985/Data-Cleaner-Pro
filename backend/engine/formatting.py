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
EMOJI_RE = re.compile(r"[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\u2600-\u26FF\u2700-\u27BF]")
INVISIBLE_CHAR_RE = re.compile(r"[\u200B-\u200D\uFEFF\u00A0\u2060\u2061\u2062\u2063\u2064]")
ILLEGAL_XML_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]")
INVALID_UNICODE_RE = re.compile(r"[\uD800-\uDFFF]")
LEADING_TRAILING_WS_RE = re.compile(r"^\s+|\s+$")


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

        ws_issues = _find_whitespace_issues(series, col)
        suggestions.extend(ws_issues)

        if profile.inferred_type in ("string", "float", "integer"):
            curr_suggestions = _find_currency_issues(series, col, df[col])
            suggestions.extend(curr_suggestions)

        if profile.inferred_type == "datetime":
            date_suggestions = _find_date_issues(df[col], col)
            suggestions.extend(date_suggestions)

        if profile.inferred_type in ("string", "categorical") and _looks_like_email_col(col):
            suggestions.extend(_find_email_issues(series, col))

        if profile.inferred_type == "string" and _looks_like_url_col(col):
            suggestions.extend(_find_url_issues(series, col))

        special_char_suggestions = _find_special_char_issues(series, col, df)
        suggestions.extend(special_char_suggestions)

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


# ── Special Character Handling (STEP 17) ──


def _find_special_char_issues(series: pd.Series, col: str, df: pd.DataFrame) -> list[Suggestion]:
    issues: list[Suggestion] = []

    emoji_count = int(EMOJI_RE.search(series.str.cat(sep=" ")) is not None if len(series) > 0 else 0)
    for val in series.head(100):
        if EMOJI_RE.search(val):
            emoji_count += 1

    if emoji_count > 0:
        cleaned_series = series.apply(lambda v: EMOJI_RE.sub("", v))
        sample_original = next((v for v in series if EMOJI_RE.search(v)), "")
        sample_cleaned = EMOJI_RE.sub("", sample_original)
        if sample_cleaned.strip():
            issues.append(Suggestion(
                id=str(uuid.uuid4()),
                row_index=None,
                column_name=col,
                original_value=sample_original,
                proposed_value=sample_cleaned.strip(),
                reason=f"{emoji_count} values in '{col}' contain emoji characters — removing emojis",
                category="format",
                status="pending",
            ))

    invisible_count = 0
    invisible_values = []
    for val in series.head(100):
        if INVISIBLE_CHAR_RE.search(val):
            invisible_count += 1
            invisible_values.append(val)

    if invisible_count > 0:
        sample = invisible_values[0] if invisible_values else ""
        cleaned = INVISIBLE_CHAR_RE.sub("", sample)
        issues.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=col,
            original_value=repr(sample),
            proposed_value=cleaned,
            reason=f"{invisible_count} values in '{col}' contain invisible Unicode characters (zero-width spaces, BOM, etc.)",
            category="format",
            status="pending",
        ))

    unsupported_count = 0
    for val in series.head(200):
        if ILLEGAL_XML_RE.search(val) or INVALID_UNICODE_RE.search(val):
            unsupported_count += 1

    if unsupported_count > 0:
        issues.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=col,
            original_value=None,
            proposed_value="remove",
            reason=f"{unsupported_count} values in '{col}' contain illegal XML characters or invalid Unicode",
            category="format",
            status="pending",
        ))

    return issues
