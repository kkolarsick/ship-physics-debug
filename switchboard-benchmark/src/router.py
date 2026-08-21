"""Strategies: single-provider, cheapest-first cascade, heuristic router.

An engine executes one attempt. A strategy decides which engines, in what
order, and when to stop. Keeping them separate is what lets the same task run
through a baseline and a router and stay comparable.

Every strategy here is transparent: it returns an ordered plan with a written
`reason` per hop, before anything is executed. No ML. If simple economics-aware
rules cannot find an edge, a learned model would hide the problem rather than
solve it (manual section 12).
"""

from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from pydantic import BaseModel, Field

from .config import FROZEN_POLICY_JSON
from .engines.base import Engine
from .pricing import EngineCatalog
from .schemas import AttemptResult, TaskSpec


def expected_cost(catalog: EngineCatalog, engine: str) -> float:
    """Marginal cost used for ordering. An engine with no catalog row sorts
    last rather than crashing the plan: the run still records the attempt and
    the missing price shows up as a gap to fix, not as a stack trace."""
    return catalog.expected_attempt_cost(engine) if catalog.has(engine) else math.inf


class Route(BaseModel):
    """One hop in a plan."""

    engine: str
    reason: str
    escalated: bool = False
    expected_cost_usd: float = 0.0
    expected_p_correct: Optional[float] = None
    expected_cost_to_correct_usd: Optional[float] = None


class Strategy(ABC):
    """A named, ordered routing policy."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def plan(
        self, task: TaskSpec, engines: dict[str, Engine], catalog: EngineCatalog
    ) -> list[Route]:
        """Ordered routes to try. The runner stops at the first validated
        correct result or when the plan is exhausted."""

    @staticmethod
    def eligible_engines(
        task: TaskSpec, engines: dict[str, Engine]
    ) -> list[tuple[str, Engine]]:
        out: list[tuple[str, Engine]] = []
        for name, engine in engines.items():
            ok, _ = engine.is_eligible(task)
            if ok:
                out.append((name, engine))
        return out


class SingleProvider(Strategy):
    """Every task goes to one provider only -- the baseline a router has to
    beat. No fallback: a failure here is a failure of that provider."""

    def __init__(self, engine: str) -> None:
        self.engine = engine

    @property
    def name(self) -> str:
        return f"single:{self.engine}"

    def plan(
        self, task: TaskSpec, engines: dict[str, Engine], catalog: EngineCatalog
    ) -> list[Route]:
        priced = catalog.has(self.engine)
        return [
            Route(
                engine=self.engine,
                reason=f"single-provider baseline ({self.engine})"
                + ("" if priced else " -- WARNING: no pricing row, cost recorded as 0"),
                expected_cost_usd=expected_cost(catalog, self.engine) if priced else 0.0,
            )
        ]


class CheapestFirstCascade(Strategy):
    """Strategy A. Cheapest eligible engine first; escalate only on failure.

    Intentionally naive: it ignores how likely each engine is to succeed. The
    gap between this and the heuristic router is the measured value of knowing
    anything about the task at all.
    """

    @property
    def name(self) -> str:
        return "cheapest_first"

    def plan(
        self, task: TaskSpec, engines: dict[str, Engine], catalog: EngineCatalog
    ) -> list[Route]:
        eligible = self.eligible_engines(task, engines)
        ordered = sorted(eligible, key=lambda pair: expected_cost(catalog, pair[0]))
        routes: list[Route] = []
        for position, (name, _) in enumerate(ordered):
            cost = expected_cost(catalog, name)
            routes.append(
                Route(
                    engine=name,
                    reason=(
                        f"cheapest eligible engine (${cost:.6f}/attempt)"
                        if position == 0
                        else f"escalation #{position}: next cheapest (${cost:.6f}/attempt)"
                    ),
                    escalated=position > 0,
                    expected_cost_usd=cost,
                )
            )
        return routes


class EnginePriors(BaseModel):
    """Observed probability that an engine produces a validated correct result,
    sliced the way the router actually decides.

    Laplace-smoothed, so one lucky attempt cannot mint a 100% prior.
    """

    #: "engine|bucket" -> [correct, total]
    by_bucket: dict[str, list[int]] = Field(default_factory=dict)
    #: "engine|domain" -> [correct, total]
    by_domain: dict[str, list[int]] = Field(default_factory=dict)
    #: "engine" -> [correct, total]
    overall: dict[str, list[int]] = Field(default_factory=dict)

    #: Observed mean latency per engine, for SLA feasibility.
    mean_latency_ms: dict[str, float] = Field(default_factory=dict)

    prior_strength: float = 1.0

    @staticmethod
    def _rate(counts: Optional[list[int]], strength: float) -> Optional[float]:
        if not counts or counts[1] == 0:
            return None
        correct, total = counts
        return (correct + strength) / (total + 2 * strength)

    def p_correct(self, engine: str, bucket: str, domain: str) -> float:
        """Most specific evidence that exists, falling back outward. With no
        evidence at all, 0.5 -- an honest coin flip, not optimism."""
        for counts in (
            self.by_domain.get(f"{engine}|{domain}"),
            self.by_bucket.get(f"{engine}|{bucket}"),
            self.overall.get(engine),
        ):
            rate = self._rate(counts, self.prior_strength)
            if rate is not None:
                return rate
        return 0.5

    def evidence_count(self, engine: str, bucket: str) -> int:
        counts = self.by_bucket.get(f"{engine}|{bucket}") or self.overall.get(engine)
        return counts[1] if counts else 0

    def latency(self, engine: str, default_ms: float = 5000.0) -> float:
        return self.mean_latency_ms.get(engine, default_ms)

    @classmethod
    def from_attempts(
        cls,
        attempts: Iterable[AttemptResult],
        tasks: dict[str, TaskSpec],
        *,
        prior_strength: float = 1.0,
    ) -> "EnginePriors":
        """Build priors from RunLog. Callers must pass TRAIN attempts only --
        `RouterPolicy.build` enforces that."""
        by_bucket: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        by_domain: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        overall: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        latency_sum: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])

        for attempt in attempts:
            task = tasks.get(attempt.task_id)
            bucket = attempt.bucket or (task.bucket.value if task else "")
            domain = task.domain if task else ""
            win = 1 if attempt.validated_correct else 0

            for store, key in (
                (by_bucket, f"{attempt.engine}|{bucket}"),
                (by_domain, f"{attempt.engine}|{domain}"),
                (overall, attempt.engine),
            ):
                store[key][0] += win
                store[key][1] += 1

            latency_sum[attempt.engine][0] += attempt.latency_ms
            latency_sum[attempt.engine][1] += 1

        return cls(
            by_bucket=dict(by_bucket),
            by_domain=dict(by_domain),
            overall=dict(overall),
            mean_latency_ms={
                engine: total / count
                for engine, (total, count) in latency_sum.items()
                if count
            },
            prior_strength=prior_strength,
        )


class RouterPolicy(BaseModel):
    """A frozen heuristic policy (manual section 13).

    Once written to disk with `frozen_at` set, the policy is what gets evaluated
    on Holdout. Changing rules after seeing holdout results means a new holdout
    set, not a new policy file.
    """

    priors: EnginePriors = Field(default_factory=EnginePriors)

    #: Never open with an engine this unlikely to succeed, however cheap it is.
    min_p_correct_to_open: float = 0.15
    #: Below this many observations, trust cost ordering over a shaky prior.
    min_evidence: int = 3
    #: Drop routes whose expected latency cannot meet the task SLA.
    enforce_sla: bool = True
    #: Headroom on the SLA, since a cascade may spend it across several hops.
    sla_safety_factor: float = 1.0

    frozen_at: Optional[str] = None
    built_from_run_ids: list[str] = Field(default_factory=list)
    train_attempts: int = 0
    notes: str = ""

    @classmethod
    def build(
        cls,
        attempts: Iterable[AttemptResult],
        tasks: dict[str, TaskSpec],
        **overrides: object,
    ) -> "RouterPolicy":
        """Fit a policy from TRAIN attempts only.

        Holdout rows are dropped here rather than trusted to the caller: it is
        the one place benchmark cheating could enter unnoticed.
        """
        attempts = list(attempts)
        train = [
            a
            for a in attempts
            if (a.split or (tasks[a.task_id].split.value if a.task_id in tasks else ""))
            == "Train"
        ]
        policy = cls(
            priors=EnginePriors.from_attempts(train, tasks),
            built_from_run_ids=sorted({a.run_id for a in train}),
            train_attempts=len(train),
            **overrides,  # type: ignore[arg-type]
        )
        return policy

    def freeze(self, path: Optional[Path] = None) -> Path:
        path = path or FROZEN_POLICY_JSON
        self.frozen_at = datetime.now(timezone.utc).isoformat()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.model_dump(), indent=2) + "\n")
        return path

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "RouterPolicy":
        path = path or FROZEN_POLICY_JSON
        if not path.exists():
            raise FileNotFoundError(
                f"no frozen policy at {path}; run `python -m src.benchmark freeze-policy` "
                "against Train results before evaluating Holdout"
            )
        return cls(**json.loads(path.read_text()))

    @property
    def is_frozen(self) -> bool:
        return self.frozen_at is not None


class HeuristicRouter(Strategy):
    """Strategy B. Orders routes by expected cost to a correct result.

        expected_cost_to_correct = attempt_cost / p(correct | engine, task)

    The division is the whole idea: a nominally cheap engine that fails two
    times in three is not cheap, because the escalation is what you actually
    pay for. Task facts (requires_js, requires_interaction) are handled as hard
    eligibility in `Engine.is_eligible`, so this only weighs the survivors.
    """

    def __init__(self, policy: RouterPolicy, *, require_frozen: bool = False) -> None:
        if require_frozen and not policy.is_frozen:
            raise ValueError(
                "holdout evaluation requires a frozen policy; call policy.freeze() first"
            )
        self.policy = policy

    @property
    def name(self) -> str:
        return "heuristic"

    def plan(
        self, task: TaskSpec, engines: dict[str, Engine], catalog: EngineCatalog
    ) -> list[Route]:
        priors = self.policy.priors
        scored: list[tuple[float, Route]] = []
        deferred: list[tuple[float, Route]] = []

        for name, _ in self.eligible_engines(task, engines):
            cost = expected_cost(catalog, name)
            p = priors.p_correct(name, task.bucket.value, task.domain)
            evidence = priors.evidence_count(name, task.bucket.value)
            latency = priors.latency(name)
            # A free engine is not infinitely good; floor the cost so ordering
            # among local engines still falls back to probability.
            ectc = max(cost, 1e-9) / max(p, 1e-6)

            route = Route(
                engine=name,
                reason="",
                expected_cost_usd=cost,
                expected_p_correct=round(p, 4),
                expected_cost_to_correct_usd=round(ectc, 8),
            )

            if (
                self.policy.enforce_sla
                and latency > task.sla_max_latency_ms * self.policy.sla_safety_factor
            ):
                route.reason = (
                    f"deferred: mean latency {latency:.0f}ms exceeds SLA "
                    f"{task.sla_max_latency_ms}ms"
                )
                deferred.append((ectc, route))
                continue

            if p < self.policy.min_p_correct_to_open and evidence >= self.policy.min_evidence:
                route.reason = (
                    f"deferred: p(correct)={p:.2f} below open floor "
                    f"{self.policy.min_p_correct_to_open:.2f} on {evidence} observations"
                )
                deferred.append((ectc, route))
                continue

            route.reason = (
                f"expected cost-to-correct ${ectc:.6f} "
                f"(${cost:.6f} / p={p:.2f}, n={evidence})"
            )
            scored.append((ectc, route))

        scored.sort(key=lambda pair: pair[0])
        deferred.sort(key=lambda pair: pair[0])

        # Deferred routes stay in the plan as last resorts: a slow or unreliable
        # engine still beats returning nothing.
        routes = [route for _, route in scored] + [route for _, route in deferred]
        for position, route in enumerate(routes):
            route.escalated = position > 0
            if position > 0:
                route.reason = f"escalation #{position}: {route.reason}"
        return routes


def build_strategy(
    spec: str, *, policy: Optional[RouterPolicy] = None, require_frozen: bool = False
) -> Strategy:
    """Resolve a strategy name from the CLI or the Inputs sheet.

    Accepts "single:<engine>", "cheapest_first", "heuristic".
    """
    if spec.startswith("single:"):
        return SingleProvider(spec.split(":", 1)[1])
    if spec == "cheapest_first":
        return CheapestFirstCascade()
    if spec == "heuristic":
        if policy is None:
            policy = RouterPolicy.load()
        return HeuristicRouter(policy, require_frozen=require_frozen)
    raise ValueError(
        f"unknown strategy {spec!r}; expected 'single:<engine>', "
        "'cheapest_first', or 'heuristic'"
    )
