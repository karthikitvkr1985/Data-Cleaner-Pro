"""Type inference — detect column types and build ColumnProfile objects."""
from __future__ import annotations

import io
import re
from typing import Any

import pandas as pd

from backend.models.schemas import ColumnProfile

DATETIME_FORMATS = [
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%m/%d/%Y %H:%M:%S",
    "%d %b %Y",
    "%d %B %Y",
]


def load_dataframe(
    file_bytes: bytes,
    file_ext: str,
    sheet_name: str,
    header_row: int | None = 0,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load bytes into a DataFrame. Returns (working_df, original_df)."""
    if file_ext in (".csv", ".tsv"):
        sep = "\t" if file_ext == ".tsv" else ","
        df = pd.read_csv(io.BytesIO(file_bytes), sep=sep, header=header_row)
    else:
        # Excel — read as raw cells first if header_row is not 0
        engine = "openpyxl" if file_ext in (".xlsx",) else "xlrd"
        try:
            df = pd.read_excel(
                io.BytesIO(file_bytes),
                sheet_name=sheet_name,
                header=header_row if header_row is not None else 0,
                engine=engine,
            )
        except Exception:
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0, header=0)

    # Strip leading/trailing whitespace from string columns
    df = df.apply(lambda col: col.str.strip() if col.dtype == object else col)
    df_original = df.copy()
    return df, df_original


def _try_integer(series: pd.Series) -> bool:
    cleaned = series.dropna().astype(str).str.replace(r"[,\s]", "", regex=True)
    try:
        pd.to_numeric(cleaned, errors="raise").apply(lambda x: int(x))
        return True
    except Exception:
        return False


def _try_float(series: pd.Series) -> bool:
    cleaned = series.dropna().astype(str).str.replace(r"[,\$€£¥\s]", "", regex=True)
    try:
        pd.to_numeric(cleaned, errors="raise")
        return True
    except Exception:
        return False


def _try_datetime(series: pd.Series) -> bool:
    sample = series.dropna().astype(str).head(50)
    successes = 0
    for fmt in DATETIME_FORMATS:
        try:
            parsed = pd.to_datetime(sample, format=fmt, errors="coerce")
            rate = parsed.notna().sum() / max(len(sample), 1)
            if rate > 0.8:
                return True
        except Exception:
            pass
    # Generic fallback
    try:
        parsed = pd.to_datetime(sample, errors="coerce", infer_datetime_format=True)
        return parsed.notna().sum() / max(len(sample), 1) > 0.8
    except Exception:
        return False


def _try_boolean(series: pd.Series) -> bool:
    BOOL_VALUES = {"true", "false", "yes", "no", "1", "0", "y", "n", "t", "f"}
    sample = series.dropna().astype(str).str.lower().unique()
    return len(sample) <= 2 and set(sample) <= BOOL_VALUES


def _is_categorical(series: pd.Series, total: int) -> bool:
    n_unique = series.nunique()
    return (n_unique / max(total, 1)) < 0.5 and n_unique < 50


def _numeric_stats(series: pd.Series) -> dict[str, Any]:
    try:
        num = pd.to_numeric(series.astype(str).str.replace(r"[,\$€£¥\s]", "", regex=True), errors="coerce")
        return {
            "min": float(num.min()) if not num.isna().all() else None,
            "max": float(num.max()) if not num.isna().all() else None,
            "mean": round(float(num.mean()), 4) if not num.isna().all() else None,
            "median": float(num.median()) if not num.isna().all() else None,
        }
    except Exception:
        return {}


def _categorical_stats(series: pd.Series) -> dict[str, Any]:
    try:
        counts = series.value_counts().head(10)
        return {"top_values": {str(k): int(v) for k, v in counts.items()}}
    except Exception:
        return {}


def _datetime_stats(series: pd.Series) -> dict[str, Any]:
    try:
        parsed = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
        return {
            "min": str(parsed.min()) if not parsed.isna().all() else None,
            "max": str(parsed.max()) if not parsed.isna().all() else None,
        }
    except Exception:
        return {}


def infer_column_profiles(df: pd.DataFrame) -> list[ColumnProfile]:
    profiles = []
    total = len(df)
    for col in df.columns:
        series = df[col]
        null_count = int(series.isna().sum())
        non_null = series.dropna()
        unique_count = int(series.nunique())
        sample = [str(v) for v in non_null.head(10).tolist()]

        # Infer type
        inferred = "string"
        stats: dict[str, Any] = {}

        if non_null.empty:
            inferred = "string"
        elif series.dtype in (int, float, "int64", "float64", "int32", "float32"):
            # Already numeric
            if series.dtype in ("int64", "int32") or (series.dtype in ("float64", "float32") and (series.dropna() % 1 == 0).all()):
                inferred = "integer"
            else:
                inferred = "float"
            stats = _numeric_stats(series)
        elif _try_boolean(non_null):
            inferred = "boolean"
            stats = _categorical_stats(non_null)
        elif _is_categorical(non_null, total - null_count):
            inferred = "categorical"
            stats = _categorical_stats(non_null)
        elif _try_datetime(non_null):
            inferred = "datetime"
            stats = _datetime_stats(non_null)
        elif _try_integer(non_null):
            inferred = "integer"
            stats = _numeric_stats(non_null)
        elif _try_float(non_null):
            inferred = "float"
            stats = _numeric_stats(non_null)
        else:
            inferred = "string"
            stats = {"avg_length": round(float(non_null.astype(str).str.len().mean()), 1) if len(non_null) > 0 else 0}

        profiles.append(ColumnProfile(
            name=str(col),
            inferred_type=inferred,
            null_count=null_count,
            unique_count=unique_count,
            total_count=total,
            sample_values=sample,
            stats=stats,
        ))
    return profiles
