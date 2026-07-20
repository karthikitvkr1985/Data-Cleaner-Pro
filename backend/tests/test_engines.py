#!/usr/bin/env python3
"""Integration tests for all engine modules with a synthetic dataset."""
from __future__ import annotations

import json
import os
import sys
import uuid

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.engine.type_inference import infer_column_profiles
from backend.engine.formatting import generate_formatting_suggestions
from backend.engine.deduplication import generate_dedup_suggestions
from backend.engine.missing_values import generate_missing_value_suggestions
from backend.engine.validation import generate_validation_rules, run_validation
from backend.engine.outlier_detection import detect_outliers
from backend.engine.anomaly_detection import detect_anomalies
from backend.engine.consistency import check_consistency
from backend.engine.quality_scoring import compute_quality_scores
from backend.engine.schema_inference import infer_schema_meanings
from backend.engine.audit import build_audit_log
from backend.engine.report import generate_cleaning_report
from backend.models.schemas import RecipeStep


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def test_df():
    rows = []
    for i in range(200):
        rows.append({
            "id": i + 1,
            "name": f"Record_{i}" if i < 150 else f"record_{i}",
            "age": 25 + (i % 50) if i != 5 else -5,
            "salary": 50000 + (i * 100) if i != 3 else 999999,
            "category": ["A", "B", "C", "D"][i % 4] if i < 180 else "Z",
            "start_date": pd.Timestamp("2024-01-01") + pd.Timedelta(days=i) if i != 10 else pd.NaT,
            "end_date": pd.Timestamp("2024-01-01") + pd.Timedelta(days=i + 10) if i != 10 else pd.NaT,
            "email": f"user{i}@example.com" if i % 5 != 0 else "not-an-email",
            "url": f"https://example.com/{i}" if i % 7 != 0 else "bad-url",
            "description": f"  item {i}  " if i % 3 == 0 else f"item{i}",
            "qty": (i % 10) + 1,
            "price": 9.99 + (i % 5),
            "rate": 0.05 + (i % 3) * 0.1,
            "source_id": i + 1000 if i < 180 else 99999,
        })
    df = pd.DataFrame(rows)
    df = pd.concat([df, df.iloc[-3:]], ignore_index=True)
    df.loc[7, "email"] = None
    df.loc[15, "age"] = None
    df.loc[20, "category"] = None
    df.loc[30, "id"] = None
    return df


@pytest.fixture(scope="module")
def profiles(test_df):
    return infer_column_profiles(test_df)


@pytest.fixture(scope="module")
def suggestions(test_df, profiles):
    results = []
    results.extend(generate_formatting_suggestions(test_df, profiles))
    results.extend(generate_dedup_suggestions(test_df, profiles))
    results.extend(generate_missing_value_suggestions(test_df, profiles))
    rules = generate_validation_rules(profiles, test_df)
    results.extend(run_validation(test_df, rules))
    return results


# ── Engine Tests ──────────────────────────────────────────────────────────────

class TestTypeInference:
    def test_all_columns_profiled(self, profiles, test_df):
        assert len(profiles) == len(test_df.columns)

    def test_id_has_duplicate_pct(self, profiles):
        id_p = next(p for p in profiles if p.name == "id")
        assert id_p.duplicate_pct is not None

    def test_age_min_value_is_negative_float(self, profiles):
        age = next(p for p in profiles if p.name == "age")
        assert age.min_value == "-5.0"


class TestFormatting:
    def test_finds_issues(self, suggestions):
        assert len(suggestions) > 0

    def test_has_format_suggestions(self, suggestions):
        fmt = [s for s in suggestions if s.category == "format"]
        assert len(fmt) > 0


class TestDeduplication:
    def test_detects_duplicates(self, suggestions):
        dup = [s for s in suggestions if s.category == "duplicate"]
        assert len(dup) > 0


class TestMissingValues:
    def test_detects_six_columns_with_nulls(self, suggestions):
        mv = [s for s in suggestions if s.category == "missing_value"]
        assert len(mv) == 6

    def test_flags_specific_columns(self, suggestions):
        cols = [s.column_name for s in suggestions if s.category == "missing_value"]
        assert "email" in cols
        assert "age" in cols
        assert "id" in cols


class TestOutlierDetection:
    def test_detects_outliers(self, profiles, test_df):
        results = detect_outliers(test_df, profiles)
        assert len(results) > 0

    def test_salary_has_outliers(self, profiles, test_df):
        results = detect_outliers(test_df, profiles)
        salary = [r for r in results if r.column_name == "salary"]
        assert len(salary) > 0
        assert salary[0].outlier_count > 0


class TestAnomalyDetection:
    def test_detects_anomalies(self, profiles, test_df):
        results = detect_anomalies(test_df, profiles)
        assert len(results) >= 1


class TestConsistency:
    def test_detects_issues(self, profiles, test_df):
        issues = check_consistency(test_df, profiles)
        assert len(issues) > 0

    def test_flags_null_id(self, profiles, test_df):
        issues = check_consistency(test_df, profiles)
        id_issues = [i for i in issues if i.column_name == "id"]
        assert len(id_issues) > 0


class TestSchemaInference:
    def test_all_columns_have_meaning(self, profiles, test_df):
        meanings = infer_schema_meanings(test_df, profiles)
        assert len(meanings) == len(test_df.columns)

    def test_id_is_identifier(self, profiles, test_df):
        meanings = infer_schema_meanings(test_df, profiles)
        id_m = next(m for m in meanings if m.column_name == "id")
        assert id_m.inferred_meaning == "identifier"
        assert not id_m.is_primary_key  # has nulls


class TestQualityScoring:
    def test_returns_all_seven_dimensions(self, profiles, suggestions, test_df):
        quality = compute_quality_scores(test_df, test_df.copy(), profiles, suggestions)
        assert len(quality.dimensions) == 7

    def test_overall_score_positive(self, profiles, suggestions, test_df):
        quality = compute_quality_scores(test_df, test_df.copy(), profiles, suggestions)
        assert quality.overall_score > 0

    def test_has_completeness(self, profiles, suggestions, test_df):
        quality = compute_quality_scores(test_df, test_df.copy(), profiles, suggestions)
        c = next((d for d in quality.dimensions if d.name == "Completeness"), None)
        assert c is not None
        assert c.score is not None


class TestAudit:
    def test_generates_entries(self, profiles, suggestions, test_df):
        steps = [
            RecipeStep(step_id=str(uuid.uuid4()), module="format",
                       description="Trimmed whitespace", params={}),
            RecipeStep(step_id=str(uuid.uuid4()), module="dedup",
                       description="Dropped duplicates", params={"count": 3}),
        ]
        entries = build_audit_log("test-session", test_df, test_df.copy(),
                                  suggestions, steps)
        assert len(entries) >= 3


class TestReport:
    def test_eight_sections(self, profiles, suggestions, test_df):
        quality = compute_quality_scores(test_df, test_df.copy(), profiles, suggestions)
        outliers = detect_outliers(test_df, profiles)
        report = generate_cleaning_report(
            session_id="test-session", filename="test.csv",
            columns=profiles, suggestions=suggestions,
            recipe_steps=[], quality_score=quality.overall_score,
            outlier_count=sum(o.outlier_count for o in outliers),
            anomaly_count=3, consistency_issue_count=2,
        )
        assert len(report.sections) == 8
        assert report.workflow_summary.total_suggestions == len(suggestions)
        assert "total_columns" in report.sections[0].content


# ── End-to-end  ───────────────────────────────────────────────────────────────

class TestEndToEnd:
    def test_full_analyze_pipeline(self, profiles, suggestions, test_df):
        outliers = detect_outliers(test_df, profiles)
        anomalies = detect_anomalies(test_df, profiles)
        consistency = check_consistency(test_df, profiles)
        meanings = infer_schema_meanings(test_df, profiles)
        quality = compute_quality_scores(test_df, test_df.copy(), profiles, suggestions)

        assert len(profiles) == len(test_df.columns)
        assert len(suggestions) > 0
        assert len(outliers) > 0
        assert len(anomalies) >= 1
        assert len(consistency) > 0
        assert len(meanings) == len(test_df.columns)
        assert quality.overall_score > 0


# ── Edge Cases  ───────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_dataframe(self):
        empty = pd.DataFrame({"a": [], "b": []})
        p = infer_column_profiles(empty)
        assert len(p) == 2
        assert detect_outliers(empty, p) == []
        assert detect_anomalies(empty, p) == []
        assert check_consistency(empty, p) == []
        quality = compute_quality_scores(empty, empty.copy(), p, [])
        assert quality.overall_score == 0.0

    def test_single_row(self):
        single = pd.DataFrame({"a": [1], "b": ["x"]})
        p = infer_column_profiles(single)
        assert detect_outliers(single, p) == []
        assert detect_anomalies(single, p) == []

    def test_all_nulls(self):
        null_df = pd.DataFrame({"a": [None, None, None], "b": [None, None, None]})
        p = infer_column_profiles(null_df)
        assert all(pr.inferred_type == "string" for pr in p)
        assert detect_outliers(null_df, p) == []
        quality = compute_quality_scores(null_df, null_df.copy(), p, [])
        assert quality.overall_score > 0

    def test_no_id_columns(self):
        no_ids = pd.DataFrame({"color": ["red", "blue"], "size": ["S", "M"]})
        p = infer_column_profiles(no_ids)
        issues = check_consistency(no_ids, p)
        ref = [i for i in issues if i.issue_type == "orphan_reference"]
        assert len(ref) == 0

    def test_orphan_references(self):
        ids_df = pd.DataFrame({
            "order_id": [1, 2, 3],
            "product_code": ["P1", "P2", "P3"],
            "ref_product": ["P1", "P99", "P999"],
        })
        p = infer_column_profiles(ids_df)
        issues = check_consistency(ids_df, p)
        orphan = [i for i in issues if i.issue_type == "orphan_reference"]
        assert len(orphan) > 0
