from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from backend.models.schemas import ColumnProfile, OutlierResult


def detect_outliers(
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> list[OutlierResult]:
    results: list[OutlierResult] = []

    for profile in columns:
        col = profile.name
        if col not in df.columns:
            continue
        if profile.inferred_type not in ("integer", "float"):
            continue

        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(series) < 4:
            continue

        iqr_outliers = _iqr_method(series, col)
        zscore_outliers = _zscore_method(series, col)

        combined_indices = set(
            o["row_index"] for o in iqr_outliers
        ) | set(o["row_index"] for o in zscore_outliers)

        if combined_indices:
            scores: list[float] = []
            for ridx in combined_indices:
                float(series.loc[ridx])
                iqr_flag = ridx in set(o["row_index"] for o in iqr_outliers)
                zscore_flag = ridx in set(o["row_index"] for o in zscore_outliers)
                score = 0.5 * (1.0 if iqr_flag else 0.0) + 0.5 * (1.0 if zscore_flag else 0.0)
                scores.append(round(score, 2))

            results.append(OutlierResult(
                column_name=col,
                outlier_count=len(combined_indices),
                total_values=len(series),
                outlier_percentage=round(len(combined_indices) / len(series) * 100, 2),
                method="IQR + Z-score",
                outliers=[
                    {"row_index": int(ridx), "value": float(series.loc[ridx]), "confidence": scores[i]}
                    for i, ridx in enumerate(sorted(combined_indices)[:50])
                ],
                iqr_bounds={
                    "q1": float(np.percentile(series, 25)),
                    "q3": float(np.percentile(series, 75)),
                    "lower_fence": float(np.percentile(series, 25) - 1.5 * (np.percentile(series, 75) - np.percentile(series, 25))),
                    "upper_fence": float(np.percentile(series, 75) + 1.5 * (np.percentile(series, 75) - np.percentile(series, 25))),
                } if iqr_outliers else None,
            ))

    return results


def _iqr_method(series: pd.Series, col: str) -> list[dict[str, Any]]:
    q1 = np.percentile(series, 25)
    q3 = np.percentile(series, 75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    outliers = series[(series < lower) | (series > upper)]
    return [
        {"row_index": int(idx), "value": float(val), "method": "iqr", "confidence": 0.7}
        for idx, val in outliers.head(50).items()
    ]


def _zscore_method(series: pd.Series, col: str) -> list[dict[str, Any]]:
    mean = series.mean()
    std = series.std()
    if std == 0:
        return []
    zscores = (series - mean) / std
    outliers = series[zscores.abs() > 3]
    return [
        {"row_index": int(idx), "value": float(val), "method": "zscore", "confidence": 0.8}
        for idx, val in outliers.head(50).items()
    ]
