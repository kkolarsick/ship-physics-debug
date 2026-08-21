"""End to end: strategy -> RunLog -> JobSummary -> gates.

This is the "explain one complete job from task definition to total cost" check
from Appendix B, run automatically.
"""

from __future__ import annotations

import pytest

from src.config import GateThresholds
from src.economics import (
    RunLogWriter,
    build_job_summaries,
    load_run_log,
    reconcile,
    summarize_strategy,
)
from src.gates import Verdict, evaluate_gates
from src.router import CheapestFirstCascade, SingleProvider
from src.runner import JobRunner, new_run_id
from src.schemas import Bucket, Split, TaskSpec

GOLD = {"name": "Widget", "price": 19.99}


@pytest.fixture
def js_task() -> TaskSpec:
    """A page the cheap engine cannot handle -- the escalation case."""
    return TaskSpec(
        task_id="JSH-001",
        split=Split.HOLDOUT,
        bucket=Bucket.JS_HEAVY,
        domain="example.com",
        url="https://example.com/spa/1",
        instruction="Extract the product name and price.",
        expected_json=GOLD,
        output_schema={"name": "string", "price": "number"},
        selectors={"name": "h1", "price": ".price"},
        gold_approved=True,
        sla_max_latency_ms=15_000,
    )


def test_cascade_escalates_and_bills_every_hop(inputs, catalog, scripted_engine_factory, js_task):
    engines = {
        "cheap": scripted_engine_factory(name="cheap", succeed=False),
        "mid": scripted_engine_factory(name="mid", succeed=False, supports_js=True),
        "premium": scripted_engine_factory(
            name="premium", succeed=True, output=GOLD, supports_js=True, supports_interaction=True
        ),
    }
    runner = JobRunner(inputs, catalog, engines, run_id="run-e2e")

    attempts = runner.run_job(js_task, CheapestFirstCascade())

    # requires_js is False on this task, so all three are eligible and tried in
    # cost order until one validates.
    assert [a.engine for a in attempts] == ["cheap", "mid", "premium"]
    assert [a.validated_correct for a in attempts] == [False, False, True]
    assert attempts[0].escalated_flag is False
    assert attempts[2].escalated_flag is True

    job = build_job_summaries(attempts, {js_task.task_id: js_task})[0]
    assert job.final_correct
    assert job.final_engine == "premium"
    assert job.attempts == 3
    assert job.escalations == 2
    # 0.001 + 0.010 + 0.100 -- the two failures are not forgiven.
    assert job.total_cost_usd == pytest.approx(0.111)
    assert reconcile(attempts, [job]) == []


def test_cascade_stops_at_the_first_validated_correct_result(
    inputs, catalog, scripted_engine_factory, js_task
):
    engines = {
        "cheap": scripted_engine_factory(name="cheap", succeed=True, output=GOLD),
        "premium": scripted_engine_factory(
            name="premium", succeed=True, output=GOLD, supports_js=True, supports_interaction=True
        ),
    }
    runner = JobRunner(inputs, catalog, engines, run_id="run-e2e")

    attempts = runner.run_job(js_task, CheapestFirstCascade())

    assert [a.engine for a in attempts] == ["cheap"]
    assert engines["premium"].calls == 0  # never touched, never billed


def test_successful_but_wrong_output_escalates(inputs, catalog, scripted_engine_factory, js_task):
    """A 200 with the wrong price is spend, not a result."""
    engines = {
        "cheap": scripted_engine_factory(
            name="cheap", succeed=True, output={"name": "Widget", "price": 24.99}
        ),
        "premium": scripted_engine_factory(
            name="premium", succeed=True, output=GOLD, supports_js=True, supports_interaction=True
        ),
    }
    attempts = JobRunner(inputs, catalog, engines).run_job(js_task, CheapestFirstCascade())

    assert attempts[0].api_success is True
    assert attempts[0].validated_correct is False
    assert attempts[-1].engine == "premium"
    assert attempts[-1].validated_correct is True


def test_route_to_an_unregistered_engine_still_produces_a_row(
    inputs, catalog, scripted_engine_factory, js_task
):
    """A silently skipped engine would make a strategy look better than it is."""
    engines = {"cheap": scripted_engine_factory(name="cheap", succeed=True, output=GOLD)}
    attempts = JobRunner(inputs, catalog, engines).run_job(js_task, SingleProvider("zyte"))

    assert len(attempts) == 1
    assert attempts[0].engine == "zyte"
    assert attempts[0].validated_correct is False
    assert "no adapter registered" in (attempts[0].error_message or "")


def test_task_with_no_eligible_engine_produces_a_row(
    inputs, catalog, scripted_engine_factory, js_task
):
    js_task.requires_interaction = True
    engines = {"cheap": scripted_engine_factory(name="cheap", succeed=True, output=GOLD)}
    attempts = JobRunner(inputs, catalog, engines).run_job(js_task, CheapestFirstCascade())

    assert len(attempts) == 1
    assert attempts[0].error_type == "engine_ineligible"


def test_manual_review_hook_overrides_the_automated_score(
    inputs, catalog, scripted_engine_factory, js_task
):
    engines = {
        "cheap": scripted_engine_factory(
            name="cheap", succeed=True, output={"name": "Widget", "price": 24.99}
        )
    }
    runner = JobRunner(
        inputs, catalog, engines, manual_review=lambda task, engine, output: True
    )
    attempts = runner.run_job(js_task, CheapestFirstCascade())

    assert attempts[0].manual_correct is True
    assert attempts[0].validated_correct is True


def test_full_run_reaches_a_verdict(inputs, catalog, scripted_engine_factory, js_task, tmp_path):
    """Baseline and candidate over the same holdout task, all the way to a gate."""
    writer = RunLogWriter(tmp_path / "run_log.csv")
    tasks = {js_task.task_id: js_task}

    baseline_engines = {
        "premium": scripted_engine_factory(
            name="premium", succeed=True, output=GOLD, supports_js=True, supports_interaction=True
        )
    }
    JobRunner(
        inputs, catalog, baseline_engines, run_id="run-1", writer=writer
    ).run_job(js_task, SingleProvider("premium"))

    candidate_engines = {
        "cheap": scripted_engine_factory(name="cheap", succeed=True, output=GOLD),
        "premium": scripted_engine_factory(
            name="premium", succeed=True, output=GOLD, supports_js=True, supports_interaction=True
        ),
    }
    JobRunner(
        inputs, catalog, candidate_engines, run_id="run-1", writer=writer
    ).run_job(js_task, CheapestFirstCascade())

    attempts = load_run_log(tmp_path / "run_log.csv")
    jobs = build_job_summaries(attempts, tasks)
    assert reconcile(attempts, jobs) == []

    baseline = summarize_strategy(jobs, "single:premium", split="Holdout")
    candidate = summarize_strategy(jobs, "cheapest_first", split="Holdout")

    assert baseline.cost_per_correct_usd == pytest.approx(0.100)
    assert candidate.cost_per_correct_usd == pytest.approx(0.001)

    result = evaluate_gates(
        baseline,
        candidate,
        GateThresholds(
            min_cost_savings_pct=30.0,
            max_correctness_degradation_pp=1.0,
            min_reliability_lift_pp=10.0,
            quality_floor_correct_pct=93.0,
        ),
    )

    assert result.verdict is Verdict.BUILD
    assert result.cost_savings_pct == pytest.approx(99.0)
    # One job is nowhere near enough to believe it, and the gate says so.
    assert any("directional" in w for w in result.warnings)


def test_run_ids_are_unique():
    assert new_run_id() != new_run_id()
