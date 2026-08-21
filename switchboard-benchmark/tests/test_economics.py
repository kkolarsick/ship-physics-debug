"""Job economics.

The central test in this file is the one the manual demands by name: a cheap
attempt fails, an expensive fallback succeeds, and BOTH costs must survive into
the job total. If that ever regresses, every savings number the project
produces is fiction.
"""

from __future__ import annotations

import pytest

from src.economics import (
    RunLogWriter,
    build_job_summaries,
    load_run_log,
    reconcile,
    summarize_strategy,
    write_job_summaries,
)
from src.schemas import AttemptResult


def attempt(**kwargs) -> AttemptResult:
    base = dict(
        run_id="run-1",
        task_id="STA-001",
        strategy="cheapest_first",
        engine="cheap",
        attempt_no=1,
        route_reason="cheapest eligible engine",
        api_success=True,
        validation_score=1.0,
        validated_correct=True,
        latency_ms=1000,
        provider_cost_usd=0.001,
        local_compute_cost_usd=0.0,
        total_attempt_cost_usd=0.001,
        split="Train",
        bucket="Static HTML",
    )
    base.update(kwargs)
    return AttemptResult(**base)


def test_failed_cheap_attempt_stays_in_the_job_total():
    """Manual section 6: a later successful fallback does not erase earlier cost."""
    failed = attempt(
        engine="cheap",
        attempt_no=1,
        api_success=False,
        validation_score=0.0,
        validated_correct=False,
        latency_ms=800,
        provider_cost_usd=0.001,
        total_attempt_cost_usd=0.001,
        error_type="parse_error",
    )
    succeeded = attempt(
        engine="premium",
        attempt_no=2,
        escalated_flag=True,
        latency_ms=4200,
        provider_cost_usd=0.100,
        total_attempt_cost_usd=0.100,
    )

    jobs = build_job_summaries([failed, succeeded])
    assert len(jobs) == 1
    job = jobs[0]

    assert job.final_correct is True
    assert job.final_engine == "premium"
    assert job.attempts == 2
    assert job.escalations == 1
    # 0.001 + 0.100 -- the failure is still on the bill.
    assert job.total_cost_usd == pytest.approx(0.101)
    assert job.total_latency_ms == 5000
    assert job.engines_used == "cheap|premium"


def test_cost_per_correct_counts_failed_jobs_as_spend():
    """Two jobs, one correct. The failed job's cost still divides into the KPI."""
    correct = attempt(task_id="A", provider_cost_usd=0.010, total_attempt_cost_usd=0.010)
    failed = attempt(
        task_id="B",
        api_success=False,
        validation_score=0.2,
        validated_correct=False,
        provider_cost_usd=0.010,
        total_attempt_cost_usd=0.010,
        error_type="parse_error",
    )

    jobs = build_job_summaries([correct, failed])
    summary = summarize_strategy(jobs, "cheapest_first")

    assert summary.jobs == 2
    assert summary.correct_jobs == 1
    assert summary.correct_pct == pytest.approx(50.0)
    assert summary.total_cost_usd == pytest.approx(0.020)
    # $0.02 spent for one correct result, not $0.01.
    assert summary.cost_per_correct_usd == pytest.approx(0.020)


def test_cost_per_correct_is_none_when_nothing_was_correct():
    failed = attempt(validated_correct=False, api_success=False, validation_score=0.0)
    summary = summarize_strategy(build_job_summaries([failed]), "cheapest_first")
    assert summary.correct_jobs == 0
    assert summary.cost_per_correct_usd is None


def test_reconcile_is_clean_for_generated_summaries():
    attempts = [
        attempt(attempt_no=1, validated_correct=False, api_success=False),
        attempt(attempt_no=2, engine="premium", provider_cost_usd=0.1, total_attempt_cost_usd=0.1),
    ]
    jobs = build_job_summaries(attempts)
    assert reconcile(attempts, jobs) == []


def test_reconcile_catches_a_dropped_attempt():
    """The exact failure mode the troubleshooting table warns about: the
    workbook shows savings the RunLog does not support."""
    attempts = [
        attempt(attempt_no=1, validated_correct=False, api_success=False),
        attempt(attempt_no=2, engine="premium", provider_cost_usd=0.1, total_attempt_cost_usd=0.1),
    ]
    jobs = build_job_summaries(attempts)
    jobs[0].total_cost_usd = 0.100  # someone "forgot" the failed attempt

    problems = reconcile(attempts, jobs)
    assert any("cost mismatch" in p for p in problems)


def test_reconcile_catches_an_attempt_whose_parts_do_not_add_up():
    broken = attempt(provider_cost_usd=0.001, local_compute_cost_usd=0.002, total_attempt_cost_usd=0.001)
    jobs = build_job_summaries([broken])
    problems = reconcile([broken], jobs)
    assert any("!= provider+local" in p for p in problems)


def test_sla_met_requires_correctness_and_the_latency_budget(task):
    task.sla_max_latency_ms = 3000
    tasks = {task.task_id: task}

    fast = build_job_summaries([attempt(latency_ms=1000)], tasks)[0]
    assert fast.sla_met is True

    slow = build_job_summaries([attempt(latency_ms=9000)], tasks)[0]
    assert slow.sla_met is False

    wrong_but_fast = build_job_summaries(
        [attempt(latency_ms=100, validated_correct=False, api_success=False)], tasks
    )[0]
    assert wrong_but_fast.sla_met is False


def test_run_log_round_trips_through_csv(tmp_path):
    path = tmp_path / "run_log.csv"
    writer = RunLogWriter(path)
    original = attempt(output={"name": "Widget", "price": 19.99}, schema_valid=True)
    writer.append(original)
    writer.append(attempt(attempt_no=2, engine="premium", escalated_flag=True))

    loaded = load_run_log(path)
    assert len(loaded) == 2
    assert loaded[0].output == {"name": "Widget", "price": 19.99}
    assert loaded[0].schema_valid is True
    assert loaded[0].validated_correct is True
    assert loaded[1].escalated_flag is True
    assert loaded[0].total_attempt_cost_usd == pytest.approx(0.001)


def test_run_log_writer_appends_rather_than_truncating(tmp_path):
    path = tmp_path / "run_log.csv"
    RunLogWriter(path).append(attempt())
    RunLogWriter(path).append(attempt(attempt_no=2))  # a second run of the process
    assert len(load_run_log(path)) == 2


def test_job_summary_csv_is_written(tmp_path):
    jobs = build_job_summaries([attempt()])
    path = write_job_summaries(jobs, tmp_path / "job_summary.csv")
    assert path.exists()
    assert "cheapest_first" in path.read_text()


def test_weighted_correctness_follows_business_value(task):
    task.business_value = 5.0
    tasks = {task.task_id: task}
    jobs = build_job_summaries([attempt()], tasks)
    assert jobs[0].weighted_correct == pytest.approx(5.0)
    assert summarize_strategy(jobs, "cheapest_first").weighted_correct_pct == pytest.approx(100.0)
