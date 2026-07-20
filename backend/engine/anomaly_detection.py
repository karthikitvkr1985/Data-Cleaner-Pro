from __future__ import annotations

from typing import Any

import pandas as pd
import numpy as np

from backend.models.schemas import ColumnProfile, AnomalyResult


def detect_anomalies(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[AnomalyResult]:
    results: list[AnomalyResult] = []

    if len(df) < 3:
        return results

    cat_cols = [c.name for c in columns if c.inferred_type in ("categorical", "string") and c.name in df.columns]
    num_cols = [c.name for c in columns if c.inferred_type in ("integer", "float") and c.name in df.columns]

    for col in cat_cols:
        anomalies = _detect_categorical_anomalies(df, col)
        if anomalies:
            results.append(AnomalyResult(
                column_name=col,
                anomaly_type="categorical",
                count=len(anomalies),
                anomalies=anomalies[:20],
            ))

    for col in num_cols:
        anomalies = _detect_numeric_anomalies(df, col)
        if anomalies:
            results.append(AnomalyResult(
                column_name=col,
                anomaly_type="numeric",
                count=len(anomalies),
                anomalies=anomalies[:20],
            ))

    cross_anomalies = _detect_cross_column_anomalies(df, columns)
    if cross_anomalies:
        results.append(AnomalyResult(
            column_name="(cross-column)",
            anomaly_type="cross_column",
            count=len(cross_anomalies),
            anomalies=cross_anomalies[:20],
        ))

    return results


def _detect_categorical_anomalies(df: pd.DataFrame, col: str) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    series = df[col].dropna().astype(str)
    if len(series) < 5:
        return anomalies

    value_counts = series.value_counts()
    total = len(series)

    if len(value_counts) < 2:
        return anomalies

    rare_values = value_counts[value_counts / total < 0.01]
    for val, count in rare_values.head(10).items():
        indices = series[series == val].index.tolist()
        anomalies.append({
            "value": str(val),
            "row_indices": [int(i) for i in indices[:5]],
            "frequency": int(count),
            "frequency_pct": round(count / total * 100, 2),
            "reason": f"Value '{val}' appears only {count} times ({round(count/total*100, 2)}%) — unusually rare",
            "confidence": 0.6,
        })

    return anomalies


def _detect_numeric_anomalies(df: pd.DataFrame, col: str) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    series = pd.to_numeric(df[col], errors="coerce").dropna()
    if len(series) < 5:
        return anomalies

    mean = series.mean()
    std = series.std()

    if std == 0:
        if len(series) > 1 and len(series) < len(df):
            anomalies.append({
                "value": float(series.iloc[0]),
                "row_indices": [int(i) for i in series.index[:5]],
                "frequency": int(len(series)),
                "frequency_pct": round(len(series) / len(df) * 100, 2),
                "reason": f"Column '{col}' has zero variance — all {len(series)} non-null values are identical ({series.iloc[0]}), suggesting a constant or default value",
                "confidence": 0.5,
            })
        return anomalies

    extreme = series[(series - mean).abs() > 4 * std]
    for idx, val in extreme.head(10).items():
        z = abs((val - mean) / std)
        anomalies.append({
            "value": float(val),
            "row_indices": [int(idx)],
            "frequency": 1,
            "frequency_pct": round(1 / len(series) * 100, 2),
            "reason": f"Value {val} is {round(z, 1)} standard deviations from the mean ({round(mean, 2)})",
            "confidence": 0.75,
        })

    return anomalies


def _detect_cross_column_anomalies(df: pd.DataFrame, columns: list[ColumnProfile]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []

    if not columns or len(df) < 3:
        return anomalies

    col_map = {c.name: c for c in columns}

    # Date ordering check
    date_cols = [c.name for c in columns if c.inferred_type == "datetime" and c.name in df.columns]
    if len(date_cols) >= 2:
        for i in range(len(date_cols)):
            for j in range(i + 1, len(date_cols)):
                c1, c2 = date_cols[i], date_cols[j]
                try:
                    d1 = pd.to_datetime(df[c1], errors="coerce")
                    d2 = pd.to_datetime(df[c2], errors="coerce")
                    if d1.notna().sum() < 3 or d2.notna().sum() < 3:
                        continue
                    diff = (d1 - d2).dt.days
                    impossible = diff[(diff < 0) & diff.notna()].head(5)
                    for idx, days in impossible.items():
                        anomalies.append({
                            "value": f"{df.at[idx, c1]} vs {df.at[idx, c2]}",
                            "row_indices": [int(idx)],
                            "frequency": 1,
                            "frequency_pct": round(1 / len(df) * 100, 2),
                            "reason": f"'{c1}' is before '{c2}' at row {idx} — unexpected temporal order",
                            "confidence": 0.8,
                        })
                except Exception:
                    pass

    # Price/quantity check
    price_col_names = [c.name for c in columns if any(kw in c.name.lower() for kw in ["price", "cost", "amount", "revenue", "spend", "value"]) and c.name in df.columns]
    qty_col_names = [c.name for c in columns if any(kw in c.name.lower() for kw in ["qty", "quantity", "count", "units"]) and c.name in df.columns]

    for pc in price_col_names:
        for qc in qty_col_names:
            prices = pd.to_numeric(df[pc], errors="coerce")
            qtys = pd.to_numeric(df[qc], errors="coerce")
            if prices.notna().sum() < 3 or qtys.notna().sum() < 3:
                continue
            zero_qty = (qtys == 0) & prices.notna() & (prices != 0)
            for idx in df.index[zero_qty][:3]:
                anomalies.append({
                    "value": f"{pc}={prices.at[idx]}, {qc}=0",
                    "row_indices": [int(idx)],
                    "frequency": 1,
                    "frequency_pct": round(1 / len(df) * 100, 2),
                    "reason": f"Row {idx}: {pc} is {prices.at[idx]} but {qc} is 0 — possible data entry error",
                    "confidence": 0.65,
                })

    # Negative value check for non-negative columns
    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        if profile.inferred_type not in ("integer", "float"):
            continue
        cl = col.lower()
        if any(kw in cl for kw in ["age", "count", "quantity", "year", "score", "rank"]):
            series = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(series) < 3:
                continue
            neg = series[series < 0]
            for idx in neg.head(5).index:
                anomalies.append({
                    "value": float(series[idx]),
                    "row_indices": [int(idx)],
                    "frequency": 1,
                    "frequency_pct": round(1 / len(df) * 100, 2),
                    "reason": f"'{col}' has negative value {series[idx]} at row {idx} — expected non-negative",
                    "confidence": 0.7,
                })

    return anomalies
