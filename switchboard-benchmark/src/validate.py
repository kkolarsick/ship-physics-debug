"""Gold-controlled validation (manual section 8).

"API success" is not correctness. A 200 with the wrong price is spend, not a
result. This module is the only place allowed to decide that an attempt
produced a validated correct result.

Score is a weighted mean over the dimensions that apply to a task:

    completion      hard gate -- unparseable output scores 0
    field accuracy  0.60   fraction of gold fields matched
    schema validity 0.15   output conforms exactly to the requested shape
    completeness    0.15   required rows/sections present
    freshness       0.10   result current enough for the task

Tasks graded by rubric rather than by gold JSON deliberately score 0.0 and
carry `reason="manual review required"`. They become correct only through an
explicit manual_correct override -- never by accident.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from .schemas import TaskSpec, ValidationResult

WEIGHT_FIELD_ACCURACY = 0.60
WEIGHT_SCHEMA = 0.15
WEIGHT_COMPLETENESS = 0.15
WEIGHT_FRESHNESS = 0.10

_WS = re.compile(r"\s+")
_CURRENCY = re.compile(r"[^\d.\-eE]")

#: Keys an engine may use to report when the underlying page was last updated.
FRESHNESS_KEYS = ("as_of", "asOf", "last_updated", "lastUpdated", "date", "published_at")


def normalize_text(value: Any) -> str:
    return _WS.sub(" ", str(value)).strip().casefold()


def parse_number(value: Any) -> Optional[float]:
    """Best-effort numeric read of a scraped value: '$1,234.50' -> 1234.5."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    cleaned = _CURRENCY.sub("", value.replace(",", ""))
    if cleaned in {"", "-", ".", "-."}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def values_match(expected: Any, actual: Any, *, rel_tol: float = 1e-6) -> bool:
    """Compare a gold value with a scraped one, tolerantly but not loosely."""
    if expected is None:
        return actual is None

    if isinstance(expected, bool) or isinstance(actual, bool):
        return bool(expected) == bool(actual)

    if isinstance(expected, (int, float)):
        got = parse_number(actual)
        if got is None:
            return False
        return math.isclose(float(expected), got, rel_tol=rel_tol, abs_tol=0.005)

    if isinstance(expected, list):
        if not isinstance(actual, list) or len(expected) != len(actual):
            return False
        if all(values_match(e, a, rel_tol=rel_tol) for e, a in zip(expected, actual)):
            return True
        # Order is rarely part of the gold answer; fall back to a multiset match.
        remaining = list(actual)
        for item in expected:
            for i, candidate in enumerate(remaining):
                if values_match(item, candidate, rel_tol=rel_tol):
                    remaining.pop(i)
                    break
            else:
                return False
        return True

    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return False
        return all(
            key in actual and values_match(val, actual[key], rel_tol=rel_tol)
            for key, val in expected.items()
        )

    if isinstance(actual, (int, float)):
        as_num = parse_number(expected)
        if as_num is not None:
            return math.isclose(as_num, float(actual), rel_tol=rel_tol, abs_tol=0.005)

    return normalize_text(expected) == normalize_text(actual)


_TYPE_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "number": lambda v: (isinstance(v, (int, float)) and not isinstance(v, bool))
    or (isinstance(v, str) and parse_number(v) is not None),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "array": lambda v: isinstance(v, list),
    "object": lambda v: isinstance(v, dict),
    "any": lambda v: True,
}


def check_schema(output: dict[str, Any], output_schema: dict[str, str]) -> bool:
    """Every declared field present, non-null, and of the declared type."""
    for field, declared in output_schema.items():
        if field not in output or output[field] is None:
            return False
        check = _TYPE_CHECKS.get(declared.lower())
        if check is None:
            raise ValueError(
                f"unknown schema type {declared!r} for field {field!r}; "
                f"expected one of {sorted(_TYPE_CHECKS)}"
            )
        if not check(output[field]):
            return False
    return True


def check_completeness(output: dict[str, Any], required_rows: int) -> float:
    """Fraction of the required rows present in the largest list the output
    returned. Pagination and infinite-scroll tasks fail here, not on accuracy."""
    if required_rows <= 0:
        return 1.0
    lists = [v for v in output.values() if isinstance(v, list)]
    if not lists:
        return 0.0
    longest = max(len(v) for v in lists)
    return min(1.0, longest / required_rows)


def _coerce_date(value: Any) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %B %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def check_freshness(
    output: dict[str, Any], max_age_days: int, *, today: Optional[date] = None
) -> Optional[bool]:
    """None when the output carries no date to judge -- an absent signal is not
    a failure, and must not be silently scored as one."""
    today = today or datetime.now(timezone.utc).date()
    for key in FRESHNESS_KEYS:
        if key in output:
            seen = _coerce_date(output[key])
            if seen is None:
                return False
            return seen >= today - timedelta(days=max_age_days)
    return None


def validate(
    task: TaskSpec,
    output: Optional[dict[str, Any]],
    *,
    threshold: float = 0.90,
    manual_correct: Optional[bool] = None,
    today: Optional[date] = None,
) -> ValidationResult:
    """Score one attempt against a task's frozen gold answer."""
    if manual_correct is not None and output is None:
        # A human can rescue a task the automation could not parse.
        return ValidationResult(
            score=1.0 if manual_correct else 0.0,
            validated_correct=manual_correct,
            reason="manual correctness override",
        )

    if not isinstance(output, dict) or not output:
        return ValidationResult(
            score=0.0,
            validated_correct=bool(manual_correct),
            reason="no parseable result",
        )

    if task.expected_json is None:
        return ValidationResult(
            score=1.0 if manual_correct else 0.0,
            validated_correct=bool(manual_correct),
            schema_valid=check_schema(output, task.output_schema)
            if task.output_schema
            else None,
            reason="manual correctness override"
            if manual_correct is not None
            else "manual review required (rubric task, no gold JSON)",
        )

    matched: list[str] = []
    missing: list[str] = []
    wrong: list[str] = []
    for field, gold in task.expected_json.items():
        if field not in output:
            missing.append(field)
        elif values_match(gold, output[field]):
            matched.append(field)
        else:
            wrong.append(field)

    total_fields = len(task.expected_json)
    field_accuracy = len(matched) / total_fields if total_fields else 1.0

    schema_valid = check_schema(output, task.output_schema) if task.output_schema else None
    completeness = (
        check_completeness(output, task.required_rows) if task.required_rows else None
    )
    freshness_valid = (
        check_freshness(output, task.freshness_max_age_days, today=today)
        if task.freshness_max_age_days
        else None
    )

    dimensions: list[tuple[float, float]] = [(WEIGHT_FIELD_ACCURACY, field_accuracy)]
    if schema_valid is not None:
        dimensions.append((WEIGHT_SCHEMA, 1.0 if schema_valid else 0.0))
    if completeness is not None:
        dimensions.append((WEIGHT_COMPLETENESS, completeness))
    if freshness_valid is not None:
        dimensions.append((WEIGHT_FRESHNESS, 1.0 if freshness_valid else 0.0))

    weight_total = sum(w for w, _ in dimensions)
    score = sum(w * v for w, v in dimensions) / weight_total

    reasons: list[str] = []
    if missing:
        reasons.append(f"missing fields: {', '.join(sorted(missing))}")
    if wrong:
        reasons.append(f"wrong fields: {', '.join(sorted(wrong))}")
    if schema_valid is False:
        reasons.append("schema mismatch")
    if completeness is not None and completeness < 1.0:
        reasons.append(f"incomplete ({completeness:.0%} of required rows)")
    if freshness_valid is False:
        reasons.append("stale result")

    correct = score >= threshold
    if manual_correct is not None:
        correct = manual_correct
        reasons.append("manual correctness override")

    return ValidationResult(
        score=round(score, 6),
        validated_correct=correct,
        schema_valid=schema_valid,
        freshness_valid=freshness_valid,
        completeness_score=completeness,
        field_accuracy=round(field_accuracy, 6),
        matched_fields=matched,
        missing_fields=missing,
        wrong_fields=wrong,
        reason="; ".join(reasons) if reasons else "all gold fields matched",
    )
