"""Strategy planning.

A strategy is judged here on the plan it produces, before anything executes --
which is the point of keeping routers transparent.
"""

from __future__ import annotations

import pytest

from src.router import (
    CheapestFirstCascade,
    EnginePriors,
    HeuristicRouter,
    RouterPolicy,
    SingleProvider,
    build_strategy,
)
from src.schemas import AttemptResult, Bucket, Split


@pytest.fixture
def engines(scripted_engine_factory):
    return {
        "cheap": scripted_engine_factory(name="cheap"),
        "mid": scripted_engine_factory(name="mid", supports_js=True),
        "premium": scripted_engine_factory(
            name="premium", supports_js=True, supports_interaction=True
        ),
    }


# --- single provider ------------------------------------------------------


def test_single_provider_never_falls_back(task, engines, catalog):
    plan = SingleProvider("premium").plan(task, engines, catalog)
    assert [r.engine for r in plan] == ["premium"]
    assert plan[0].escalated is False


def test_single_provider_name_is_stable():
    assert SingleProvider("firecrawl").name == "single:firecrawl"


# --- cheapest first -------------------------------------------------------


def test_cheapest_first_orders_by_marginal_cost(task, engines, catalog):
    plan = CheapestFirstCascade().plan(task, engines, catalog)
    assert [r.engine for r in plan] == ["cheap", "mid", "premium"]
    assert plan[0].escalated is False
    assert all(r.escalated for r in plan[1:])
    assert "escalation #1" in plan[1].reason


def test_js_requirement_drops_ineligible_engines(task, engines, catalog):
    task.requires_js = True
    plan = CheapestFirstCascade().plan(task, engines, catalog)
    assert [r.engine for r in plan] == ["mid", "premium"]


def test_interaction_requirement_narrows_to_one_engine(task, engines, catalog):
    task.requires_interaction = True
    plan = CheapestFirstCascade().plan(task, engines, catalog)
    assert [r.engine for r in plan] == ["premium"]


def test_allowed_engines_is_respected(task, engines, catalog):
    task.allowed_engines = ["mid"]
    plan = CheapestFirstCascade().plan(task, engines, catalog)
    assert [r.engine for r in plan] == ["mid"]


def test_plan_is_empty_when_nothing_is_eligible(task, engines, catalog):
    task.allowed_engines = ["zyte"]
    assert CheapestFirstCascade().plan(task, engines, catalog) == []


# --- priors ---------------------------------------------------------------


def _attempt(engine: str, correct: bool, *, split="Train", task_id="STA-001") -> AttemptResult:
    return AttemptResult(
        run_id="run-1",
        task_id=task_id,
        strategy="single:" + engine,
        engine=engine,
        attempt_no=1,
        route_reason="baseline",
        api_success=correct,
        validation_score=1.0 if correct else 0.0,
        validated_correct=correct,
        latency_ms=1000,
        total_attempt_cost_usd=0.0,
        split=split,
        bucket=Bucket.STATIC_HTML.value,
    )


def test_priors_are_laplace_smoothed():
    """One lucky attempt must not mint a 100% success prior."""
    priors = EnginePriors.from_attempts([_attempt("cheap", True)], {})
    p = priors.p_correct("cheap", Bucket.STATIC_HTML.value, "")
    assert 0.5 < p < 1.0


def test_priors_default_to_a_coin_flip_without_evidence():
    priors = EnginePriors()
    assert priors.p_correct("unseen", Bucket.STATIC_HTML.value, "example.com") == 0.5


def test_policy_build_ignores_holdout_attempts(task):
    tasks = {task.task_id: task}
    attempts = [
        _attempt("cheap", True, split="Train"),
        _attempt("cheap", False, split="Holdout"),
        _attempt("cheap", False, split="Holdout"),
    ]
    policy = RouterPolicy.build(attempts, tasks)
    assert policy.train_attempts == 1
    assert policy.priors.overall["cheap"] == [1, 1]


# --- heuristic router -----------------------------------------------------


def test_heuristic_prefers_expected_cost_to_correct_over_raw_price(task, engines, catalog):
    """`cheap` is 10x cheaper than `mid` but almost never right, so its
    expected cost to a correct result is worse. That is the whole thesis."""
    priors = EnginePriors(
        overall={"cheap": [1, 40], "mid": [38, 40], "premium": [40, 40]},
        mean_latency_ms={"cheap": 500, "mid": 2000, "premium": 6000},
    )
    plan = HeuristicRouter(RouterPolicy(priors=priors)).plan(task, engines, catalog)

    assert plan[0].engine == "mid"
    assert plan[0].expected_cost_to_correct_usd < plan[-1].expected_cost_to_correct_usd


def test_heuristic_still_opens_cheap_when_cheap_usually_works(task, engines, catalog):
    priors = EnginePriors(
        overall={"cheap": [36, 40], "mid": [39, 40], "premium": [40, 40]},
        mean_latency_ms={"cheap": 500, "mid": 2000, "premium": 6000},
    )
    plan = HeuristicRouter(RouterPolicy(priors=priors)).plan(task, engines, catalog)
    assert plan[0].engine == "cheap"


def test_hopeless_engine_is_deferred_to_last_resort_not_deleted(task, engines, catalog):
    priors = EnginePriors(
        overall={"cheap": [0, 40], "mid": [30, 40], "premium": [38, 40]},
    )
    policy = RouterPolicy(priors=priors, min_p_correct_to_open=0.15, min_evidence=3)
    plan = HeuristicRouter(policy).plan(task, engines, catalog)

    assert plan[0].engine != "cheap"
    assert plan[-1].engine == "cheap"  # still a last resort, not dropped
    assert "below open floor" in plan[-1].reason


def test_engine_that_cannot_meet_the_sla_is_deferred(task, engines, catalog):
    task.sla_max_latency_ms = 3000
    priors = EnginePriors(
        overall={"cheap": [20, 40], "mid": [39, 40], "premium": [40, 40]},
        mean_latency_ms={"cheap": 500, "mid": 1500, "premium": 30_000},
    )
    plan = HeuristicRouter(RouterPolicy(priors=priors)).plan(task, engines, catalog)

    assert plan[-1].engine == "premium"
    assert "exceeds SLA" in plan[-1].reason


def test_holdout_evaluation_requires_a_frozen_policy():
    with pytest.raises(ValueError, match="frozen policy"):
        HeuristicRouter(RouterPolicy(), require_frozen=True)


def test_freeze_marks_the_policy_and_round_trips(tmp_path):
    policy = RouterPolicy(priors=EnginePriors(overall={"cheap": [3, 4]}))
    assert not policy.is_frozen

    path = policy.freeze(tmp_path / "frozen_policy.json")
    assert policy.is_frozen

    reloaded = RouterPolicy.load(path)
    assert reloaded.is_frozen
    assert reloaded.priors.overall["cheap"] == [3, 4]
    HeuristicRouter(reloaded, require_frozen=True)  # must not raise


def test_loading_a_missing_policy_says_what_to_run(tmp_path):
    with pytest.raises(FileNotFoundError, match="freeze-policy"):
        RouterPolicy.load(tmp_path / "nope.json")


# --- resolution -----------------------------------------------------------


def test_build_strategy_resolves_names():
    assert build_strategy("single:http").name == "single:http"
    assert build_strategy("cheapest_first").name == "cheapest_first"
    assert build_strategy("heuristic", policy=RouterPolicy()).name == "heuristic"


def test_build_strategy_rejects_nonsense():
    with pytest.raises(ValueError, match="unknown strategy"):
        build_strategy("magic")
