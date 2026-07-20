from __future__ import annotations

import re
from typing import Any

import pandas as pd
import numpy as np

from backend.models.schemas import ColumnProfile, SchemaMeaning


SEMANTIC_KEYWORDS: list[tuple[list[str], str]] = [
    (["id", "uuid", "guid", "identifier", "pk", "primary"], "identifier"),
    (["name", "full_name", "first_name", "last_name", "title"], "name"),
    (["desc", "description", "note", "comment", "remark"], "description"),
    (["cat", "category", "type", "class", "group", "segment"], "category"),
    (["code", "abbr", "abbreviation"], "code"),
    (["price", "cost", "amount", "revenue", "fee", "salary", "wage", "budget"], "currency"),
    (["pct", "percent", "rate", "ratio", "proportion"], "percentage"),
    (["date", "time", "timestamp", "created", "updated", "modified"], "date"),
    (["email", "e-mail", "mail"], "contact_info"),
    (["phone", "mobile", "tel", "fax", "telephone"], "contact_info"),
    (["url", "link", "website", "href"], "url"),
    (["addr", "address", "city", "state", "zip", "postal", "country", "location", "lat", "lon", "longitude", "latitude"], "location"),
    (["qty", "quantity", "count", "num", "number"], "numeric_value"),
    (["unit", "measure", "size", "weight", "height", "width", "length", "volume", "area"], "measurement"),
    (["flag", "is_", "has_", "active", "enabled", "status_bool"], "boolean"),
    (["min", "max", "avg", "average", "sum", "total", "subtotal", "aggregate"], "calculated_field"),
]


def infer_schema_meanings(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[SchemaMeaning]:
    meanings: list[SchemaMeaning] = []

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        series = df[col].dropna()

        meaning = _infer_meaning(col, series, profile)
        is_pk = _check_primary_key(series, profile)
        is_fk = _check_foreign_key(series, columns, col)

        meanings.append(SchemaMeaning(
            column_name=col,
            inferred_meaning=meaning,
            confidence=_meaning_confidence(col, meaning),
            is_primary_key=is_pk,
            is_foreign_key=is_fk,
            matching_keywords=_find_matching_keywords(col),
        ))

    return meanings


def _infer_meaning(col: str, series: pd.Series, profile: ColumnProfile) -> str:
    col_lower = col.lower().replace("_", " ").replace("-", " ")

    for keywords, meaning in SEMANTIC_KEYWORDS:
        if any(kw.lower() in col_lower for kw in keywords):
            return meaning

    if profile.inferred_type in ("integer", "float"):
        return "numeric_value"

    if profile.inferred_type == "datetime":
        return "date"

    if profile.inferred_type == "boolean":
        return "boolean"

    if profile.inferred_type == "categorical":
        return "category"

    return "free_text"


def _meaning_confidence(col: str, meaning: str) -> float:
    if meaning in ("identifier", "name", "description"):
        return 0.8
    if meaning in ("category", "code"):
        return 0.7
    if meaning in ("date", "boolean", "percentage"):
        return 0.9
    if meaning == "free_text":
        return 0.5
    return 0.6


def _check_primary_key(series: pd.Series, profile: ColumnProfile) -> bool:
    total = profile.total_count
    if total < 2:
        return False
    null_free = profile.null_count == 0
    unique = profile.unique_count == total
    return null_free and unique


def _check_foreign_key(series: pd.Series, columns: list[ColumnProfile], col: str) -> bool:
    col_lower = col.lower()
    if not any(kw in col_lower for kw in ["_id", "code", "ref", "fk"]):
        return False
    for other in columns:
        if other.name == col:
            continue
        if col_lower.endswith("_id") and other.name.lower() == col_lower.replace("_id", ""):
            return True
    return False


def _find_matching_keywords(col: str) -> list[str]:
    col_lower = col.lower().replace("_", " ").replace("-", " ")
    matched = []
    for keywords, _ in SEMANTIC_KEYWORDS:
        for kw in keywords:
            if kw.lower() in col_lower:
                matched.append(kw)
                break
    return matched
