"""Decision gates. The verdict is arithmetic, not enthusiasm."""

from __future__ import annotations

import pytest

from src.config import GateThresholds
from src.gates import Verdict, bucket_verdicts, cost_savings_pct, evaluate_gates, render_decision_memo
from src.schemas import StrategySummary


def summary(strategy: str, *, correct_pct: float, cost_per_correct: float | None,
            jobs: int = 25, bucket: str | None = None) -> StrategySummary:
    return StrategySummary(
        strategy=strategy,
        split="Holdout",
        bucket=bucket,
        jobs=jobs,
        correct_jobs=int(round(jobs * correct_pct / 100)),
        correct_pct=correct_pct,
        total_cost_usd=(cost_per_correct or 0) * jobs * correct_pct / 100,
        cost_per_correct_usd=cost_per_correct,
        avg_attempts=1.4,
        avg_latency_ms=2500,
        p95_latency_ms=6000,
        sla_met_pct=96.0,
        weighted_correct_pct=correct_pct,
    )


@pytest.fixture
def thresholds() -> GateThresholds:
    return GateThresholds(
        min_cost_savings_pct=30.0,
        max_correctness_degradation_pp=1.0,
        min_reliability_lift_pp=10.0,
        quality_floor_correct_pct=93.0,
        jobs_per_month=1_000_000,
    )


def test_cost_led_win_builds(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=94.5, cost_per_correct=0.006)  # 40% cheaper

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.BUILD
    assert result.cost_led_win
    assert result.cost_savings_pct == pytest.approx(40.0)
    assert result.projected_monthly_savings_usd == pytest.approx(3780.0)


def test_savings_below_the_quality_floor_do_not_build(thresholds):
    """The manual's sharpest rule: cheap and worse is not cheaper."""
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=88.0, cost_per_correct=0.004)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.KILL
    assert not result.quality_floor_met
    assert any("fake" in reason for reason in result.reasons)


def test_big_savings_with_too_much_degradation_is_not_a_cost_led_win(thresholds):
    baseline = summary("single:firecrawl", correct_pct=99.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.005)  # -4 pp

    result = evaluate_gates(baseline, candidate, thresholds)

    assert not result.cost_led_win
    assert result.verdict is Verdict.KILL
    assert any("more than the 1.0 pp allowance" in r for r in result.reasons)


def test_reliability_led_win_builds_even_when_more_expensive(thresholds):
    baseline = summary("single:http", correct_pct=70.0, cost_per_correct=0.002)
    candidate = summary("heuristic", correct_pct=94.0, cost_per_correct=0.0035)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.BUILD
    assert result.reliability_led_win
    assert result.correctness_delta_pp == pytest.approx(24.0)


def test_reliability_lift_at_an_unreasonable_cost_does_not_build(thresholds):
    baseline = summary("single:http", correct_pct=70.0, cost_per_correct=0.002)
    candidate = summary("heuristic", correct_pct=94.0, cost_per_correct=0.050)  # 25x

    result = evaluate_gates(baseline, candidate, thresholds, max_reliability_cost_multiple=2.0)

    assert not result.reliability_led_win
    assert result.verdict is Verdict.KILL


def test_middling_savings_narrows(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.008)  # 20%

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.NARROW
    assert "not yet company-grade" in result.headline


def test_negligible_savings_kills(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.0098)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.KILL
    assert "Do not build" in result.headline or "do not build" in result.headline


def test_candidate_with_no_correct_results_is_inconclusive(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=0.0, cost_per_correct=None)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert result.verdict is Verdict.INCONCLUSIVE
    assert any("no validated correct results" in w for w in result.warnings)


def test_placeholder_prices_are_flagged_on_every_verdict(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.005)

    result = evaluate_gates(baseline, candidate, thresholds, unverified_engines=["firecrawl"])

    assert any("placeholder prices" in w for w in result.warnings)


def test_small_holdout_is_flagged_as_directional(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010, jobs=8)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.005, jobs=8)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert any("directional" in w for w in result.warnings)


def test_unequal_job_counts_are_flagged(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010, jobs=25)
    candidate = summary("cheapest_first", correct_pct=95.0, cost_per_correct=0.005, jobs=20)

    result = evaluate_gates(baseline, candidate, thresholds)

    assert any("not like-for-like" in w for w in result.warnings)


def test_cost_savings_pct_is_none_without_a_baseline():
    assert cost_savings_pct(None, 0.01) is None
    assert cost_savings_pct(0.0, 0.01) is None


def test_bucket_verdicts_separate_wins_losses_and_dead_zones():
    baseline = [
        summary("b", correct_pct=95.0, cost_per_correct=0.010, bucket="Static HTML"),
        summary("b", correct_pct=90.0, cost_per_correct=0.010, bucket="JS-heavy"),
        summary("b", correct_pct=0.0, cost_per_correct=None, bucket="PDF / document"),
    ]
    candidate = [
        summary("c", correct_pct=95.0, cost_per_correct=0.002, bucket="Static HTML"),
        summary("c", correct_pct=90.0, cost_per_correct=0.020, bucket="JS-heavy"),
        summary("c", correct_pct=0.0, cost_per_correct=None, bucket="PDF / document"),
    ]

    wins, losses, dead = bucket_verdicts(baseline, candidate)

    assert wins == ["Static HTML (80% cheaper per correct)"]
    assert losses == ["JS-heavy (100% more expensive)"]
    assert dead == ["PDF / document (no engine succeeded)"]


def test_memo_states_the_verdict_and_the_caveats(thresholds):
    baseline = summary("single:firecrawl", correct_pct=95.0, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=94.5, cost_per_correct=0.006)
    result = evaluate_gates(baseline, candidate, thresholds, unverified_engines=["firecrawl"])

    memo = render_decision_memo(result, next_test="Run 200 PDF tasks through Zyte.")

    assert "## Verdict: BUILD" in memo
    assert "Run 200 PDF tasks through Zyte." in memo
    assert "Caveats that weaken this memo" in memo
    assert "I still think this could work" not in memo


def test_memo_quotes_the_thresholds_that_were_actually_applied():
    """A memo must not describe a gate the run did not use."""
    strict = GateThresholds(
        min_cost_savings_pct=50.0,
        max_correctness_degradation_pp=0.5,
        min_reliability_lift_pp=20.0,
        quality_floor_correct_pct=99.0,
        jobs_per_month=250_000,
    )
    baseline = summary("single:firecrawl", correct_pct=99.5, cost_per_correct=0.010)
    candidate = summary("cheapest_first", correct_pct=99.2, cost_per_correct=0.004)

    result = evaluate_gates(baseline, candidate, strict, max_reliability_cost_multiple=3.0)
    memo = render_decision_memo(result)

    assert result.thresholds.min_cost_savings_pct == 50.0
    assert "-0.5 pp" in memo
    assert "+20.0 pp" in memo
    assert "3x baseline" in memo
    assert "250,000 jobs/month" in memo
