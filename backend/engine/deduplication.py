"""Deduplication — exact duplicates, fuzzy near-duplicates, categorical canonicalization."""
from __future__ import annotations

import re
import uuid

import pandas as pd

from backend.config import FUZZY_DEDUP_THRESHOLD
from backend.models.schemas import ColumnProfile, Suggestion


def _normalize(val: str) -> str:
    val = val.lower().strip()
    val = re.sub(r"[^\w\s]", "", val)
    val = re.sub(r"\s+", " ", val)
    return val


def generate_dedup_suggestions(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[Suggestion]:
    suggestions: list[Suggestion] = []

    # 1. Exact duplicates
    suggestions.extend(_exact_duplicates(df))

    # 2. Near-duplicate / categorical canonicalization
    for profile in columns:
        if profile.inferred_type == "categorical":
            suggestions.extend(_categorical_canonicalization(df, profile.name))

    return suggestions


def _exact_duplicates(df: pd.DataFrame) -> list[Suggestion]:
    suggestions = []
    dup_mask = df.duplicated(keep="first")
    dup_indices = df.index[dup_mask].tolist()

    if not dup_indices:
        return []

    # Group into a single column-level summary suggestion + individual row suggestions
    for idx in dup_indices[:50]:  # cap at 50 individual row suggestions
        row_repr = ", ".join(str(df.at[idx, c])[:20] for c in list(df.columns)[:3])
        suggestions.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=int(idx),
            column_name=str(df.columns[0]),
            original_value=row_repr,
            proposed_value=None,
            reason=f"Row {idx} is an exact duplicate of an earlier row",
            category="duplicate",
            status="pending",
        ))

    if len(dup_indices) > 50:
        suggestions.append(Suggestion(
            id=str(uuid.uuid4()),
            row_index=None,
            column_name=str(df.columns[0]),
            original_value=None,
            proposed_value=None,
            reason=f"{len(dup_indices)} exact duplicate rows detected — consider dropping all duplicates (keep first occurrence)",
            category="duplicate",
            status="pending",
        ))

    return suggestions


def _categorical_canonicalization(df: pd.DataFrame, col: str) -> list[Suggestion]:
    """Find near-duplicate categorical values and propose canonical labels."""
    suggestions = []
    try:
        from rapidfuzz import fuzz, process
    except ImportError:
        return []

    values = df[col].dropna().unique().tolist()
    values = [str(v) for v in values if str(v).strip()]
    if len(values) < 2 or len(values) > 200:
        return []

    # Normalize for comparison
    norm_map: dict[str, str] = {v: _normalize(v) for v in values}
    used: set[str] = set()

    for i, v in enumerate(values):
        if v in used:
            continue
        norm_v = norm_map[v]
        # Find similar values
        matches = process.extract(
            norm_v,
            [norm_map[u] for u in values if u != v and u not in used],
            scorer=fuzz.token_sort_ratio,
            limit=10,
            score_cutoff=FUZZY_DEDUP_THRESHOLD,
        )

        if matches:
            # Find original values for matched norms
            norm_to_orig = {norm_map[u]: u for u in values if u != v and u not in used}
            similar = [norm_to_orig[m[0]] for m in matches if m[0] in norm_to_orig]

            if similar:
                canonical = _pick_canonical(v, similar)
                for sim in similar[:5]:
                    if sim == canonical:
                        continue
                    count = int((df[col].astype(str) == sim).sum())
                    suggestions.append(Suggestion(
                        id=str(uuid.uuid4()),
                        row_index=None,
                        column_name=col,
                        original_value=sim,
                        proposed_value=canonical,
                        reason=f"'{sim}' ({count} rows) appears to be a near-duplicate of '{canonical}' — consider merging to canonical label",
                        category="duplicate",
                        status="pending",
                    ))
                    used.add(sim)
            used.add(v)

    return suggestions


def _pick_canonical(a: str, others: list[str]) -> str:
    """Pick the most 'canonical' label — prefer title case, longer, more common."""
    candidates = [a] + others
    # Prefer title-cased
    title_cased = [c for c in candidates if c == c.title()]
    if title_cased:
        return title_cased[0]
    # Prefer longest
    return max(candidates, key=len)
