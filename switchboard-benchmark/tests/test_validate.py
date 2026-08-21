"""Validation is where 'successful but wrong' gets caught."""

from __future__ import annotations

from datetime import date

import pytest

from src.schemas import Bucket, TaskSpec
from src.validate import (
    check_completeness,
    check_freshness,
    check_schema,
    parse_number,
    validate,
    values_match,
)


def test_exact_match_scores_one(task):
    result = validate(task, {"name": "Widget", "price": 19.99})
    assert result.validated_correct
    assert result.score == pytest.approx(1.0)
    assert result.field_accuracy == pytest.approx(1.0)


def test_scraped_price_string_matches_numeric_gold(task):
    """'$19.99' off a page is the same answer as 19.99 in the gold."""
    result = validate(task, {"name": "Widget", "price": "$19.99"})
    assert result.validated_correct


def test_one_wrong_field_of_two_fails_the_threshold(task):
    result = validate(task, {"name": "Widget", "price": 24.99})
    assert not result.validated_correct
    assert result.field_accuracy == pytest.approx(0.5)
    assert "price" in result.wrong_fields


def test_missing_field_is_reported_separately_from_wrong(task):
    result = validate(task, {"name": "Widget"})
    assert result.missing_fields == ["price"]
    assert result.wrong_fields == []
    assert not result.validated_correct


def test_api_success_with_empty_payload_is_not_correct(task):
    result = validate(task, {})
    assert result.score == 0.0
    assert result.reason == "no parseable result"


def test_schema_violation_drags_the_score_below_threshold(task):
    """Right values, wrong shape: price arrives as a dict."""
    task.expected_json = {"name": "Widget"}
    task.output_schema = {"name": "string", "price": "number"}
    result = validate(task, {"name": "Widget", "price": {"amount": 19.99}})
    assert result.schema_valid is False
    assert not result.validated_correct


def test_completeness_gates_pagination_tasks():
    task = TaskSpec(
        task_id="SCR-001",
        bucket=Bucket.INFINITE_SCROLL,
        domain="example.com",
        url="https://example.com/list",
        instruction="Collect every row.",
        expected_json={"count": 50},
        required_rows=50,
        gold_approved=True,
    )
    half = validate(task, {"count": 50, "rows": [f"r{i}" for i in range(25)]})
    assert half.completeness_score == pytest.approx(0.5)
    assert not half.validated_correct

    full = validate(task, {"count": 50, "rows": [f"r{i}" for i in range(50)]})
    assert full.validated_correct


def test_stale_result_fails_freshness(task):
    task.freshness_max_age_days = 7
    stale = validate(
        task,
        {"name": "Widget", "price": 19.99, "as_of": "2020-01-01"},
        today=date(2026, 8, 21),
    )
    assert stale.freshness_valid is False
    assert not stale.validated_correct


def test_absent_date_is_not_scored_as_stale(task):
    """No date to judge is not the same as a stale answer."""
    task.freshness_max_age_days = 7
    result = validate(task, {"name": "Widget", "price": 19.99})
    assert result.freshness_valid is None
    assert result.validated_correct


def test_rubric_task_requires_a_human(task):
    task.expected_json = None
    task.expected_rubric = "Summary mentions the refund window."
    unreviewed = validate(task, {"summary": "30 day refunds"})
    assert unreviewed.score == 0.0
    assert not unreviewed.validated_correct
    assert "manual review required" in unreviewed.reason

    reviewed = validate(task, {"summary": "30 day refunds"}, manual_correct=True)
    assert reviewed.validated_correct


def test_manual_override_can_reject_a_perfect_automated_score(task):
    result = validate(task, {"name": "Widget", "price": 19.99}, manual_correct=False)
    assert not result.validated_correct
    assert "manual correctness override" in result.reason


def test_threshold_is_honoured(task):
    task.expected_json = {"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}
    task.output_schema = {}  # field accuracy is the only dimension in play
    output = {"a": 1, "b": 2, "c": 3, "d": 4, "e": 99}  # 80% of fields
    assert not validate(task, output, threshold=0.90).validated_correct
    assert validate(task, output, threshold=0.75).validated_correct


@pytest.mark.parametrize(
    "raw,expected",
    [("$1,234.50", 1234.5), ("19.99 USD", 19.99), ("", None), ("n/a", None), (7, 7.0)],
)
def test_parse_number(raw, expected):
    assert parse_number(raw) == expected


def test_list_match_ignores_order():
    assert values_match(["a", "b"], ["b", "a"])
    assert not values_match(["a", "b"], ["a", "c"])
    assert not values_match(["a", "b"], ["a"])


def test_check_schema_rejects_null_field():
    assert check_schema({"name": "x"}, {"name": "string"})
    assert not check_schema({"name": None}, {"name": "string"})


def test_check_schema_rejects_unknown_declared_type():
    with pytest.raises(ValueError, match="unknown schema type"):
        check_schema({"name": "x"}, {"name": "date"})


def test_check_completeness_without_a_list_is_zero():
    assert check_completeness({"count": 5}, 10) == 0.0


def test_check_freshness_unparseable_date_is_a_failure():
    assert check_freshness({"as_of": "sometime last year"}, 7) is False
