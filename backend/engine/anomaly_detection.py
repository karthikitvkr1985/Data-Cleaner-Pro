from __future__ import annotations

import uuid
from typing import Any

import pandas as pd
import numpy as np

from backend.models.schemas import ColumnProfile, AnomalyResult


def detect_anomalies(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[AnomalyResult]:
    results: list[AnomalyResult] = []

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

    date_cols = [c.name for c in columns if c.inferred_type == "datetime" and c.name in df.columns]
    num_cols = [c.name for c in columns if c.inferred_type in ("integer", "float") and c.name in df.columns]

    if len(date_cols) >= 2:
        for i in range(len(date_cols)):
            for j in range(i + 1, len(date_cols)):
                c1, c2 = date_cols[i], date_cols[j]
                try:
                    d1 = pd.to_datetime(df[c1], errors="coerce")
                    d2 = pd.to_datetime(df[c2], errors="coerce")
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

    has_price_cols = [c for c in columns if any(kw in c.name.lower() for kw in ["price", "cost", "amount", "revenue"])]
    has_qty_cols = [c for c in columns if any(kw in c.name.lower() for kw in ["qty", "quantity", "count"])]

    for price_col in has_price_cols:
        for qty_col in has_qty_cols:
            if price_col.name in df.columns and qty_col.name in df.columns:
                prices = pd.to_numeric(df[price_col.name], errors="coerce")
                qtys = pd.to_numeric(df[qty_col.name], errors="coerce")
                zero_qty = (qtys == 0) & prices.notna()
                for idx in df.index[zero_qty][:3]:
                    if prices.at[idx] not in (0, None) and not pd.isna(prices.at[idx]):
                        anomalies.append({
                            "value": f"price={prices.at[idx]}, qty=0",
                            "row_indices": [int(idx)],
                            "frequency": 1,
                            "frequency_pct": round(1 / len(df) * 100, 2),
                            "reason": f"Row {idx}: price is {prices.at[idx]} but quantity is 0 — possible data entry error",
                            "confidence": 0.65,
                        })

    return anomalies
