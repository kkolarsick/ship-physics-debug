"""RunLog -> JobSummary -> StrategySummary (manual sections 9 and 10).

The whole benchmark rests on one rule, and this module is where it is enforced:

    A later successful fallback does not erase the cost or latency of earlier
    failed attempts.

So aggregation is always a sum over *every* attempt in a job, never a lookup of
the winning one. `reconcile()` re-derives the job totals straight from RunLog
and reports any row that disagrees -- that is the "check your math" step, run
automatically instead of on five hand-picked jobs.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Optional

from .config import JOB_SUMMARY_CSV, RUN_LOG_CSV
from .schemas import AttemptResult, JobSummary, StrategySummary, TaskSpec

RUN_LOG_FIELDS: list[str] = list(AttemptResult.model_fields)
JOB_SUMMARY_FIELDS: list[str] = list(JobSummary.model_fields)

_JSON_FIELDS = {"output"}
_BOOL_FIELDS = {
    "api_success",
    "validated_correct",
    "manual_correct",
    "retry_flag",
    "escalated_flag",
    "schema_valid",
    "freshness_valid",
    "final_correct",
    "sla_met",
}


# --------------------------------------------------------------------------
# CSV I/O
# --------------------------------------------------------------------------


def _to_csv_value(value: Any, field: str) -> str:
    if value is None:
        return ""
    if field in _JSON_FIELDS:
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def _from_csv_value(raw: str, field: str, annotation: Any) -> Any:
    if raw == "":
        return None
    if field in _JSON_FIELDS:
        return json.loads(raw)
    if field in _BOOL_FIELDS:
        return raw.strip().casefold() in {"true", "1", "yes"}
    return raw


class RunLogWriter:
    """Append-only writer. Attempts are never rewritten, only added."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or RUN_LOG_CSV
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists() or self.path.stat().st_size == 0:
            with self.path.open("w", newline="", encoding="utf-8") as fh:
                csv.writer(fh).writerow(RUN_LOG_FIELDS)

    def append(self, attempt: AttemptResult) -> None:
        row = attempt.model_dump()
        with self.path.open("a", newline="", encoding="utf-8") as fh:
            csv.writer(fh).writerow(
                [_to_csv_value(row[f], f) for f in RUN_LOG_FIELDS]
            )

    def extend(self, attempts: Iterable[AttemptResult]) -> None:
        for attempt in attempts:
            self.append(attempt)


def load_run_log(path: Optional[Path] = None) -> list[AttemptResult]:
    path = path or RUN_LOG_CSV
    if not path.exists():
        return []
    attempts: list[AttemptResult] = []
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            parsed = {
                field: _from_csv_value(row.get(field, ""), field, None)
                for field in RUN_LOG_FIELDS
                if field in row
            }
            attempts.append(AttemptResult(**parsed))
    return attempts


def write_job_summaries(
    jobs: Iterable[JobSummary], path: Optional[Path] = None
) -> Path:
    path = path or JOB_SUMMARY_CSV
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(JOB_SUMMARY_FIELDS)
        for job in jobs:
            row = job.model_dump()
            writer.writerow([_to_csv_value(row[f], f) for f in JOB_SUMMARY_FIELDS])
    return path


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------


def build_job_summaries(
    attempts: Iterable[AttemptResult],
    tasks: Optional[dict[str, TaskSpec]] = None,
) -> list[JobSummary]:
    """Collapse RunLog attempts into one row per (run, task, strategy)."""
    tasks = tasks or {}
    grouped: dict[tuple[str, str, str], list[AttemptResult]] = defaultdict(list)
    for attempt in attempts:
        grouped[(attempt.run_id, attempt.task_id, attempt.strategy)].append(attempt)

    jobs: list[JobSummary] = []
    for (run_id, task_id, strategy), rows in grouped.items():
        rows = sorted(rows, key=lambda a: a.attempt_no)
        task = tasks.get(task_id)

        # Sums span every attempt, including the ones that failed.
        total_provider = sum(a.provider_cost_usd for a in rows)
        total_local = sum(a.local_compute_cost_usd for a in rows)
        total_cost = sum(a.total_attempt_cost_usd for a in rows)
        total_latency = sum(a.latency_ms for a in rows)

        winner = next((a for a in rows if a.validated_correct), None)
        final_correct = winner is not None

        business_value = task.business_value if task else 1.0
        sla_limit = task.sla_max_latency_ms if task else None
        sla_met = bool(
            final_correct and sla_limit is not None and total_latency <= sla_limit
        )

        failures = [
            a.error_type or "validation_failed"
            for a in rows
            if not a.validated_correct
        ]

        jobs.append(
            JobSummary(
                run_id=run_id,
                task_id=task_id,
                strategy=strategy,
                split=rows[0].split or (task.split.value if task else None),
                bucket=rows[0].bucket or (task.bucket.value if task else None),
                final_correct=final_correct,
                final_engine=winner.engine if winner else None,
                attempts=len(rows),
                escalations=sum(1 for a in rows if a.escalated_flag),
                retries=sum(1 for a in rows if a.retry_flag),
                total_cost_usd=round(total_cost, 10),
                total_provider_cost_usd=round(total_provider, 10),
                total_local_compute_cost_usd=round(total_local, 10),
                total_latency_ms=total_latency,
                business_value=business_value,
                weighted_correct=business_value if final_correct else 0.0,
                sla_met=sla_met,
                engines_used="|".join(a.engine for a in rows),
                failure_reasons="|".join(sorted(set(failures))),
            )
        )

    jobs.sort(key=lambda j: (j.strategy, j.task_id))
    return jobs


def _percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile. No numpy dependency, no interpolation
    surprises when a bucket holds two jobs."""
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, min(len(ordered), int(round(pct / 100.0 * len(ordered) + 0.5))))
    return float(ordered[rank - 1])


def summarize_strategy(
    jobs: Iterable[JobSummary],
    strategy: str,
    *,
    split: Optional[str] = None,
    bucket: Optional[str] = None,
) -> StrategySummary:
    """Strategy economics for one slice. `cost_per_correct_usd` is None when a
    strategy got nothing right -- it is undefined, not infinite, and must not be
    silently rendered as a big number."""
    rows = [
        j
        for j in jobs
        if j.strategy == strategy
        and (split is None or j.split == split)
        and (bucket is None or j.bucket == bucket)
    ]

    if not rows:
        return StrategySummary(
            strategy=strategy,
            split=split,
            bucket=bucket,
            jobs=0,
            correct_jobs=0,
            correct_pct=0.0,
            total_cost_usd=0.0,
            cost_per_correct_usd=None,
            avg_attempts=0.0,
            avg_latency_ms=0.0,
            p95_latency_ms=0.0,
            sla_met_pct=0.0,
            weighted_correct_pct=0.0,
        )

    correct = [j for j in rows if j.final_correct]
    total_cost = sum(j.total_cost_usd for j in rows)
    latencies = [float(j.total_latency_ms) for j in rows]
    value_total = sum(j.business_value for j in rows)

    reasons = Counter(
        reason
        for j in rows
        if not j.final_correct
        for reason in (j.failure_reasons.split("|") if j.failure_reasons else [])
        if reason
    )

    return StrategySummary(
        strategy=strategy,
        split=split,
        bucket=bucket,
        jobs=len(rows),
        correct_jobs=len(correct),
        correct_pct=round(100.0 * len(correct) / len(rows), 4),
        total_cost_usd=round(total_cost, 10),
        cost_per_correct_usd=round(total_cost / len(correct), 10) if correct else None,
        avg_attempts=round(sum(j.attempts for j in rows) / len(rows), 4),
        avg_latency_ms=round(sum(latencies) / len(rows), 2),
        p95_latency_ms=round(_percentile(latencies, 95), 2),
        sla_met_pct=round(100.0 * sum(1 for j in rows if j.sla_met) / len(rows), 4),
        weighted_correct_pct=round(
            100.0 * sum(j.weighted_correct for j in rows) / value_total, 4
        )
        if value_total
        else 0.0,
        top_failure_reasons="; ".join(
            f"{reason} x{count}" for reason, count in reasons.most_common(5)
        ),
    )


def summarize_by_bucket(
    jobs: Iterable[JobSummary], strategy: str, *, split: Optional[str] = None
) -> list[StrategySummary]:
    jobs = list(jobs)
    buckets = sorted({j.bucket for j in jobs if j.bucket})
    return [
        summarize_strategy(jobs, strategy, split=split, bucket=bucket)
        for bucket in buckets
    ]


def strategies_in(jobs: Iterable[JobSummary]) -> list[str]:
    return sorted({j.strategy for j in jobs})


# --------------------------------------------------------------------------
# Reconciliation
# --------------------------------------------------------------------------


def reconcile(
    attempts: Iterable[AttemptResult],
    jobs: Iterable[JobSummary],
    *,
    tolerance_usd: float = 1e-9,
) -> list[str]:
    """Re-derive every job total from RunLog and report disagreements.

    An empty list is the precondition for trusting any savings number. This is
    the automated form of the manual's "pick 5 multi-attempt jobs and sum them
    by hand" check.
    """
    by_key: dict[tuple[str, str, str], list[AttemptResult]] = defaultdict(list)
    for attempt in attempts:
        by_key[(attempt.run_id, attempt.task_id, attempt.strategy)].append(attempt)

    problems: list[str] = []
    seen: set[tuple[str, str, str]] = set()

    for job in jobs:
        key = (job.run_id, job.task_id, job.strategy)
        seen.add(key)
        rows = by_key.get(key)
        if not rows:
            problems.append(f"{key}: job summary has no RunLog attempts")
            continue

        expected_cost = sum(a.total_attempt_cost_usd for a in rows)
        if abs(expected_cost - job.total_cost_usd) > tolerance_usd:
            problems.append(
                f"{key}: cost mismatch -- RunLog {expected_cost:.10f} "
                f"vs JobSummary {job.total_cost_usd:.10f}"
            )

        expected_latency = sum(a.latency_ms for a in rows)
        if expected_latency != job.total_latency_ms:
            problems.append(
                f"{key}: latency mismatch -- RunLog {expected_latency} "
                f"vs JobSummary {job.total_latency_ms}"
            )

        if len(rows) != job.attempts:
            problems.append(
                f"{key}: attempt count mismatch -- RunLog {len(rows)} "
                f"vs JobSummary {job.attempts}"
            )

        for attempt in rows:
            parts = attempt.provider_cost_usd + attempt.local_compute_cost_usd
            if abs(parts - attempt.total_attempt_cost_usd) > tolerance_usd:
                problems.append(
                    f"{key} attempt {attempt.attempt_no}: total_attempt_cost_usd "
                    f"{attempt.total_attempt_cost_usd:.10f} != provider+local "
                    f"{parts:.10f}"
                )

    for key in by_key.keys() - seen:
        problems.append(f"{key}: RunLog attempts have no JobSummary row")

    return problems
