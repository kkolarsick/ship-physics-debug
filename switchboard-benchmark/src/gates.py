"""Decision gates and the holdout memo (manual sections 13, 14, Appendix D).

The gates are code so the verdict is computed before anyone reads it, from
thresholds that were set before the run. "Do not soften the verdict" is easier
to obey when softening it means editing a file with a git history.

One threshold the manual leaves in prose: "reasonable incremental cost" for a
reliability-led win. It is made explicit here as
`max_reliability_cost_multiple` (default 2.0x the baseline cost per validated
correct result). Change it deliberately, and say so in the memo.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .config import REPORTS_DIR, GateThresholds
from .pricing import VolumeModel
from .schemas import StrategySummary


class Verdict(str, Enum):
    BUILD = "BUILD"
    NARROW = "NARROW"
    KILL = "KILL"
    INCONCLUSIVE = "INCONCLUSIVE"


class GateResult(BaseModel):
    verdict: Verdict
    headline: str

    baseline_strategy: str
    candidate_strategy: str
    split: Optional[str] = None

    baseline_correct_pct: float
    candidate_correct_pct: float
    correctness_delta_pp: float

    baseline_cost_per_correct: Optional[float]
    candidate_cost_per_correct: Optional[float]
    cost_savings_pct: Optional[float]

    quality_floor_met: bool
    cost_led_win: bool
    reliability_led_win: bool

    #: The gate that was actually applied, carried with the result so a memo
    #: cannot quote a threshold the run did not use.
    thresholds: GateThresholds
    max_reliability_cost_multiple: float = 2.0

    projected_monthly_savings_usd: Optional[float] = None
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def cost_savings_pct(baseline: Optional[float], candidate: Optional[float]) -> Optional[float]:
    """1 - candidate/baseline, as a percentage. None when either side has no
    defined cost per correct result -- a strategy that got nothing right cannot
    be said to have saved anything."""
    if baseline is None or candidate is None or baseline == 0:
        return None
    return round(100.0 * (1.0 - candidate / baseline), 4)


def evaluate_gates(
    baseline: StrategySummary,
    candidate: StrategySummary,
    thresholds: GateThresholds,
    *,
    max_reliability_cost_multiple: float = 2.0,
    baseline_fixed_monthly_usd: float = 0.0,
    candidate_fixed_monthly_usd: float = 0.0,
    unverified_engines: Optional[list[str]] = None,
) -> GateResult:
    """Apply manual section 14 to one baseline/candidate pair."""
    savings = cost_savings_pct(
        baseline.cost_per_correct_usd, candidate.cost_per_correct_usd
    )
    delta_pp = round(candidate.correct_pct - baseline.correct_pct, 4)
    floor_met = candidate.correct_pct >= thresholds.quality_floor_correct_pct

    reasons: list[str] = []
    warnings: list[str] = []

    if candidate.cost_per_correct_usd is None:
        warnings.append("candidate produced no validated correct results")
    if baseline.cost_per_correct_usd is None:
        warnings.append("baseline produced no validated correct results")
    if unverified_engines:
        warnings.append(
            "cost model still uses placeholder prices for: "
            + ", ".join(sorted(unverified_engines))
            + " -- reconcile against invoices before quoting savings"
        )
    if candidate.jobs < 25:
        plural = "job" if candidate.jobs == 1 else "jobs"
        warnings.append(
            f"only {candidate.jobs} holdout {plural}; treat the verdict as directional"
        )
    if baseline.jobs != candidate.jobs:
        warnings.append(
            f"baseline ran {baseline.jobs} jobs but candidate ran {candidate.jobs}; "
            "the comparison is not like-for-like"
        )

    # --- cost-led win ---
    cost_led = bool(
        savings is not None
        and savings >= thresholds.min_cost_savings_pct
        and delta_pp >= -thresholds.max_correctness_degradation_pp
        and floor_met
    )
    if savings is not None and savings >= thresholds.min_cost_savings_pct:
        if not floor_met:
            reasons.append(
                f"{savings:.1f}% savings but holdout correctness "
                f"{candidate.correct_pct:.1f}% is below the "
                f"{thresholds.quality_floor_correct_pct:.1f}% quality floor -- "
                "the savings are fake"
            )
        elif delta_pp < -thresholds.max_correctness_degradation_pp:
            reasons.append(
                f"{savings:.1f}% savings but correctness fell {abs(delta_pp):.1f} pp, "
                f"more than the {thresholds.max_correctness_degradation_pp:.1f} pp allowance"
            )
        else:
            reasons.append(
                f"cost-led win: {savings:.1f}% lower cost per validated correct result "
                f"with {delta_pp:+.1f} pp correctness"
            )

    # --- reliability-led win ---
    cost_acceptable = (
        candidate.cost_per_correct_usd is not None
        and baseline.cost_per_correct_usd is not None
        and candidate.cost_per_correct_usd
        <= baseline.cost_per_correct_usd * max_reliability_cost_multiple
    )
    reliability_led = bool(
        delta_pp >= thresholds.min_reliability_lift_pp and cost_acceptable
    )
    if delta_pp >= thresholds.min_reliability_lift_pp:
        if cost_acceptable:
            reasons.append(
                f"reliability-led win: {delta_pp:+.1f} pp correctness at "
                f"{'≤' if cost_acceptable else '>'}"
                f"{max_reliability_cost_multiple:g}x baseline cost per correct result"
            )
        else:
            reasons.append(
                f"{delta_pp:+.1f} pp correctness lift, but cost per correct result "
                f"exceeds {max_reliability_cost_multiple:g}x baseline"
            )

    # --- verdict ---
    if cost_led or reliability_led:
        verdict = Verdict.BUILD
        headline = "Continue: the holdout shows a real edge."
    elif savings is None:
        verdict = Verdict.INCONCLUSIVE
        headline = "No defensible comparison: cost per correct result is undefined."
        reasons.append("fix the run before drawing any conclusion")
    elif savings >= 10.0 and delta_pp >= -thresholds.max_correctness_degradation_pp:
        verdict = Verdict.NARROW
        headline = (
            "Interesting but not yet company-grade: expand volume and find a "
            "high-scale buyer segment."
        )
        reasons.append(
            f"{savings:.1f}% savings sits between 10% and "
            f"{thresholds.min_cost_savings_pct:.0f}% at equivalent quality"
        )
    else:
        verdict = Verdict.KILL
        headline = "Weak generic routing thesis: do not build a generic router."
        reasons.append(
            f"{savings:.1f}% savings with {delta_pp:+.1f} pp correctness clears neither gate"
        )

    projected: Optional[float] = None
    if (
        baseline.cost_per_correct_usd is not None
        and candidate.cost_per_correct_usd is not None
    ):
        projected = round(
            VolumeModel(
                jobs_per_month=thresholds.jobs_per_month,
                baseline_cost_per_correct=baseline.cost_per_correct_usd,
                candidate_cost_per_correct=candidate.cost_per_correct_usd,
                baseline_fixed_monthly_usd=baseline_fixed_monthly_usd,
                candidate_fixed_monthly_usd=candidate_fixed_monthly_usd,
                correct_rate=candidate.correct_pct / 100.0,
            ).monthly_savings_usd(),
            2,
        )

    return GateResult(
        verdict=verdict,
        headline=headline,
        thresholds=thresholds,
        max_reliability_cost_multiple=max_reliability_cost_multiple,
        baseline_strategy=baseline.strategy,
        candidate_strategy=candidate.strategy,
        split=candidate.split,
        baseline_correct_pct=baseline.correct_pct,
        candidate_correct_pct=candidate.correct_pct,
        correctness_delta_pp=delta_pp,
        baseline_cost_per_correct=baseline.cost_per_correct_usd,
        candidate_cost_per_correct=candidate.cost_per_correct_usd,
        cost_savings_pct=savings,
        quality_floor_met=floor_met,
        cost_led_win=cost_led,
        reliability_led_win=reliability_led,
        projected_monthly_savings_usd=projected,
        reasons=reasons,
        warnings=warnings,
    )


# --------------------------------------------------------------------------
# Decision memo (Appendix D)
# --------------------------------------------------------------------------


def _money(value: Optional[float]) -> str:
    return "n/a" if value is None else f"${value:,.6f}".rstrip("0").rstrip(".")


def _pct(value: Optional[float]) -> str:
    return "n/a" if value is None else f"{value:.1f}%"


def bucket_verdicts(
    baseline_buckets: list[StrategySummary],
    candidate_buckets: list[StrategySummary],
) -> tuple[list[str], list[str], list[str]]:
    """(router wins, router loses, everything fails) by bucket.

    The third list matters most: manual section 15 says a workload where every
    engine fails may be a better business than the router.
    """
    by_bucket = {s.bucket: s for s in baseline_buckets}
    wins: list[str] = []
    losses: list[str] = []
    dead_zones: list[str] = []

    for candidate in candidate_buckets:
        base = by_bucket.get(candidate.bucket)
        if base is None or not candidate.bucket:
            continue
        if base.correct_pct == 0.0 and candidate.correct_pct == 0.0:
            dead_zones.append(f"{candidate.bucket} (no engine succeeded)")
            continue
        savings = cost_savings_pct(
            base.cost_per_correct_usd, candidate.cost_per_correct_usd
        )
        if savings is None:
            losses.append(f"{candidate.bucket} (candidate got nothing right)")
        elif savings > 0:
            wins.append(f"{candidate.bucket} ({savings:.0f}% cheaper per correct)")
        else:
            losses.append(f"{candidate.bucket} ({abs(savings):.0f}% more expensive)")

    return wins, losses, dead_zones


def render_decision_memo(
    result: GateResult,
    *,
    baseline_buckets: Optional[list[StrategySummary]] = None,
    candidate_buckets: Optional[list[StrategySummary]] = None,
    external_router_notes: str = "not yet benchmarked",
    next_test: str = "",
) -> str:
    """Appendix D, filled in from the numbers. The headings are fixed; the
    'I still think this could work' section does not exist."""
    wins, losses, dead_zones = bucket_verdicts(
        baseline_buckets or [], candidate_buckets or []
    )
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        "# Switchboard decision memo",
        "",
        f"_Generated {stamp} from holdout results._",
        "",
        f"## Verdict: {result.verdict.value}",
        "",
        result.headline,
        "",
        f"- **Selected baseline:** `{result.baseline_strategy}`",
        f"- **Selected candidate:** `{result.candidate_strategy}`",
        "",
        "## Holdout correctness: baseline vs candidate",
        "",
        f"- Baseline: {_pct(result.baseline_correct_pct)}",
        f"- Candidate: {_pct(result.candidate_correct_pct)}",
        f"- Delta: {result.correctness_delta_pp:+.1f} pp",
        f"- Quality floor met: {'yes' if result.quality_floor_met else 'NO'}",
        "",
        "## Holdout cost per validated correct result",
        "",
        f"- Baseline: {_money(result.baseline_cost_per_correct)}",
        f"- Candidate: {_money(result.candidate_cost_per_correct)}",
        f"- Cost savings: {_pct(result.cost_savings_pct)}",
        "",
        "## Correctness lift / degradation",
        "",
        f"{result.correctness_delta_pp:+.1f} pp "
        f"(allowance for a cost-led win: "
        f"-{result.thresholds.max_correctness_degradation_pp:.1f} pp; a reliability-led "
        f"win needs +{result.thresholds.min_reliability_lift_pp:.1f} pp at no more than "
        f"{result.max_reliability_cost_multiple:g}x baseline cost per correct)",
        "",
        "## Projected savings at realistic customer volume",
        "",
        f"{_money(result.projected_monthly_savings_usd)} per month at "
        f"{result.thresholds.jobs_per_month:,} jobs/month "
        "(edit `jobs_per_month` in data/inputs.json to match a real workload before "
        "quoting this).",
        "",
        "## Buckets where routing wins",
        "",
        *([f"- {w}" for w in wins] or ["- none"]),
        "",
        "## Buckets where routing loses",
        "",
        *([f"- {l}" for l in losses] or ["- none"]),
        "",
        "## What existing routers do better/worse",
        "",
        external_router_notes,
        "",
        "## Most important shared failure class",
        "",
        *(
            [f"- {d}" for d in dead_zones]
            or ["- no bucket failed across every engine in this run"]
        ),
        "",
        "## Next falsifiable test",
        "",
        next_test or "_state one test whose result could change this verdict_",
    ]

    if result.reasons:
        lines += ["", "## Why the gate returned this verdict", ""]
        lines += [f"- {r}" for r in result.reasons]
    if result.warnings:
        lines += ["", "## Caveats that weaken this memo", ""]
        lines += [f"- {w}" for w in result.warnings]

    return "\n".join(lines) + "\n"


def write_decision_memo(
    markdown: str, path: Optional[Path] = None
) -> Path:
    path = path or REPORTS_DIR / "decision_memo.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")
    return path
