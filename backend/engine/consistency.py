from __future__ import annotations


import pandas as pd

from backend.models.schemas import ColumnProfile, ConsistencyIssue


def check_consistency(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[ConsistencyIssue]:
    issues: list[ConsistencyIssue] = []

    issues.extend(_check_id_consistency(df, columns))
    issues.extend(_check_referential_integrity(df, columns))
    issues.extend(_check_value_range_consistency(df, columns))
    issues.extend(_check_dependency_consistency(df, columns))

    return issues


def _check_id_consistency(df: pd.DataFrame, columns: list[ColumnProfile]) -> list[ConsistencyIssue]:
    issues: list[ConsistencyIssue] = []

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        col_lower = col.lower()
        if any(kw in col_lower for kw in ["id", "identifier", "key", "code"]):
            series = df[col].dropna().astype(str)
            if len(series) < 2:
                continue

            dupe_count = int(series.duplicated().sum())
            if dupe_count > 0:
                issues.append(ConsistencyIssue(
                    column_name=col,
                    issue_type="duplicate_id",
                    description=f"'{col}' has {dupe_count} duplicate identifier values (expected uniqueness)",
                    row_count=dupe_count,
                    severity="high",
                    affected_values=series[series.duplicated(keep="first")].head(5).tolist(),
                    suggestion=f"Investigate or deduplicate {dupe_count} non-unique values in '{col}'",
                ))

            null_count = int(df[col].isna().sum())
            if null_count > 0:
                issues.append(ConsistencyIssue(
                    column_name=col,
                    issue_type="null_id",
                    description=f"'{col}' has {null_count} null identifier values",
                    row_count=null_count,
                    severity="high",
                    affected_values=[],
                    suggestion=f"Fill or remove {null_count} null values in identifier column '{col}'",
                ))

            empty_count = int((series == "").sum())
            if empty_count > 0:
                issues.append(ConsistencyIssue(
                    column_name=col,
                    issue_type="empty_id",
                    description=f"'{col}' has {empty_count} empty string identifier values",
                    row_count=empty_count,
                    severity="high",
                    affected_values=[],
                    suggestion=f"Review {empty_count} empty identifiers in '{col}'",
                ))

    return issues


def _check_referential_integrity(df: pd.DataFrame, columns: list[ColumnProfile]) -> list[ConsistencyIssue]:
    issues: list[ConsistencyIssue] = []

    id_cols_map: dict[str, str] = {}
    for c in columns:
        if c.name not in df.columns:
            continue
        cl = c.name.lower()
        if cl == "id" or cl.endswith("_id") or cl.endswith("_code") or cl == "code":
            base = cl.replace("_id", "").replace("_code", "").replace("code_", "")
            id_cols_map[base] = c.name
        elif any(kw in cl for kw in ["identifier", "key", "pk"]) and c.unique_count == c.total_count:
            id_cols_map[cl] = c.name

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        cl = col.lower()
        if not cl.endswith("_id") and not any(kw in cl for kw in ["parent_", "ref_", "fk_", "foreign_"]):
            continue

        base = cl.replace("_id", "").replace("parent_", "").replace("ref_", "").replace("fk_", "").replace("foreign_", "")
        target_col = None

        if base in id_cols_map:
            target_col = id_cols_map[base]
        elif base + "_id" in id_cols_map:
            target_col = id_cols_map[base + "_id"]
        elif base + "_code" in id_cols_map:
            target_col = id_cols_map[base + "_code"]
        else:
            exact_matches = [v for k, v in id_cols_map.items() if k == base]
            if exact_matches:
                target_col = exact_matches[0]
            else:
                continue

        ref_series = df[col].dropna().astype(str)
        target_series = df[target_col].dropna().astype(str)
        target_set = set(target_series)

        if ref_series.empty:
            continue

        orphans = ref_series[~ref_series.isin(target_set)]
        orphan_count = len(orphans)
        if orphan_count > 0 and orphan_count < len(ref_series):
            issues.append(ConsistencyIssue(
                column_name=col,
                issue_type="orphan_reference",
                description=f"'{col}' has {orphan_count} value(s) not found in referenced column '{target_col}'",
                row_count=orphan_count,
                severity="medium",
                affected_values=orphans.head(5).tolist(),
                suggestion=f"Review {orphan_count} orphan {'reference' if orphan_count == 1 else 'references'} in '{col}' — they may refer to deleted or missing records",
            ))

    return issues


def _check_value_range_consistency(df: pd.DataFrame, columns: list[ColumnProfile]) -> list[ConsistencyIssue]:
    issues: list[ConsistencyIssue] = []

    percentage_cols = []
    for profile in columns:
        col = profile.name
        col_lower = col.lower()
        if any(kw in col_lower for kw in ["pct", "percent", "rate", "ratio"]):
            if col in df.columns:
                percentage_cols.append(col)

    for col in percentage_cols:
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(series) == 0:
            continue
        pct_min = series.min()
        pct_max = series.max()
        if pct_max > 100 or pct_min < -100:
            out_of_range = series[(series > 100) | (series < -100)]
            issues.append(ConsistencyIssue(
                column_name=col,
                issue_type="percentage_out_of_range",
                description=f"'{col}' has {len(out_of_range)} values outside -100 to 100 range (min={round(pct_min,2)}, max={round(pct_max,2)})",
                row_count=len(out_of_range),
                severity="medium",
                affected_values=[round(float(v), 2) for v in out_of_range.head(5)],
                suggestion=f"Convert {col} values: values > 1 may be stored as decimals vs percentages",
            ))

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        col_lower = col.lower()
        if any(kw in col_lower for kw in ["age"]):
            series = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(series) == 0:
                continue
            too_old = series[series > 120]
            if len(too_old) > 0:
                issues.append(ConsistencyIssue(
                    column_name=col,
                    issue_type="unreasonable_value",
                    description=f"'{col}' has {len(too_old)} values exceeding reasonable maximum of 120",
                    row_count=len(too_old),
                    severity="high",
                    affected_values=[float(v) for v in too_old.head(5)],
                    suggestion=f"Review {len(too_old)} values — ages over 120 may be data entry errors",
                ))

    return issues


def _check_dependency_consistency(df: pd.DataFrame, columns: list[ColumnProfile]) -> list[ConsistencyIssue]:
    issues: list[ConsistencyIssue] = []

    col_names = [c.name for c in columns]

    start_col = next((c for c in col_names if any(kw in c.lower() for kw in ["start", "begin", "from"])), None)
    end_col = next((c for c in col_names if any(kw in c.lower() for kw in ["end", "finish", "to"])), None)

    if start_col and end_col and start_col in df.columns and end_col in df.columns:
        if any(c.inferred_type in ("integer", "float", "datetime") for c in columns if c.name == start_col):
            for profile in columns:
                if profile.name == end_col:
                    if profile.inferred_type in ("integer", "float", "datetime"):
                        try:
                            start_vals = pd.to_numeric(df[start_col], errors="coerce")
                            end_vals = pd.to_numeric(df[end_col], errors="coerce")
                        except Exception:
                            start_vals = pd.to_datetime(df[start_col], errors="coerce")
                            end_vals = pd.to_datetime(df[end_col], errors="coerce")

                        inverted = (start_vals.notna() & end_vals.notna() & (start_vals > end_vals))
                        inverted_count = int(inverted.sum())
                        if inverted_count > 0:
                            issues.append(ConsistencyIssue(
                                column_name=f"{start_col}/{end_col}",
                                issue_type="inverted_range",
                                description=f"'{start_col}' > '{end_col}' in {inverted_count} rows (expected start <= end)",
                                row_count=inverted_count,
                                severity="medium",
                                affected_values=[f"{df.at[idx, start_col]} > {df.at[idx, end_col]}" for idx in df.index[inverted][:5]],
                                suggestion=f"Review and swap {inverted_count} inverted start/end value pairs",
                            ))
                    break

    return issues
