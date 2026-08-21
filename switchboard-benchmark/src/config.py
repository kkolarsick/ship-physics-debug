"""Benchmark inputs -- the code-side mirror of the workbook Inputs sheet.

Thresholds live in one place so a run can never quietly use a softer gate than
the one the decision memo claims. Change them deliberately, in
`data/inputs.json`, not inline at a call site.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent

#: Overridable so a run can be kept side by side with another (and so the CLI
#: is testable without writing into the repo's own data/).
DATA_DIR = Path(os.getenv("SWITCHBOARD_DATA_DIR") or REPO_ROOT / "data")
REPORTS_DIR = Path(os.getenv("SWITCHBOARD_REPORTS_DIR") or REPO_ROOT / "reports")

TASKS_CSV = DATA_DIR / "tasks.csv"
RUN_LOG_CSV = DATA_DIR / "run_log.csv"
JOB_SUMMARY_CSV = DATA_DIR / "job_summary.csv"
GOLD_REVIEW_CSV = DATA_DIR / "gold_review.csv"
INPUTS_JSON = DATA_DIR / "inputs.json"
FROZEN_POLICY_JSON = DATA_DIR / "frozen_policy.json"


class BenchmarkInputs(BaseModel):
    """Workbook Inputs sheet. Defaults match manual v0.2."""

    # A result counts as correct at or above this validation score, unless a
    # manual correctness override says otherwise.
    validation_threshold: float = 0.90

    # Initial build gate (manual section 1 and 14).
    min_cost_savings_pct: float = 30.0
    max_correctness_degradation_pp: float = 1.0
    min_reliability_lift_pp: float = 10.0

    # A candidate that saves money below this holdout correctness is not
    # actually cheaper -- it is selling a worse product.
    quality_floor_correct_pct: float = 93.0

    # Translates unit savings into customer-scale dollars. The manual is blunt
    # that this number decides whether a win is a business.
    jobs_per_month: int = 1_000_000

    selected_baseline: str = "single:firecrawl"
    selected_candidate: str = "cheapest_first"

    # Politeness, manual section 3.
    respect_robots: bool = True
    min_domain_delay_s: float = 2.0
    max_domain_delay_s: float = 5.0
    max_concurrency: int = 1

    # Transient-network retries only. Never retry a 403/429 into a bypass.
    max_transient_retries: int = 2

    local_compute_usd_per_hour: float = 0.06
    user_agent: str = (
        "SwitchboardBenchmark/0.2 (+economics benchmark; contact: you@example.com)"
    )

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "BenchmarkInputs":
        """File values first, then environment overrides for the few knobs that
        belong in .env (secrets adjacent, machine specific)."""
        path = path or INPUTS_JSON
        data: dict = {}
        if path.exists():
            data = json.loads(path.read_text())
        inputs = cls(**data)

        env_map = {
            "local_compute_usd_per_hour": ("LOCAL_COMPUTE_USD_PER_HOUR", float),
            "user_agent": ("SWITCHBOARD_USER_AGENT", str),
            "min_domain_delay_s": ("SWITCHBOARD_MIN_DOMAIN_DELAY_S", float),
            "max_domain_delay_s": ("SWITCHBOARD_MAX_DOMAIN_DELAY_S", float),
        }
        for field, (env_name, caster) in env_map.items():
            raw = os.getenv(env_name)
            if raw:
                setattr(inputs, field, caster(raw))
        robots = os.getenv("SWITCHBOARD_RESPECT_ROBOTS")
        if robots is not None:
            inputs.respect_robots = robots.strip() not in {"0", "false", "False", ""}
        return inputs

    def save(self, path: Optional[Path] = None) -> Path:
        path = path or INPUTS_JSON
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.model_dump(), indent=2) + "\n")
        return path


class GateThresholds(BaseModel):
    """Extracted from BenchmarkInputs so gates.py can be tested standalone."""

    min_cost_savings_pct: float
    max_correctness_degradation_pp: float
    min_reliability_lift_pp: float
    quality_floor_correct_pct: float
    jobs_per_month: int = Field(default=1_000_000)

    @classmethod
    def from_inputs(cls, inputs: BenchmarkInputs) -> "GateThresholds":
        return cls(
            min_cost_savings_pct=inputs.min_cost_savings_pct,
            max_correctness_degradation_pp=inputs.max_correctness_degradation_pp,
            min_reliability_lift_pp=inputs.min_reliability_lift_pp,
            quality_floor_correct_pct=inputs.quality_floor_correct_pct,
            jobs_per_month=inputs.jobs_per_month,
        )
