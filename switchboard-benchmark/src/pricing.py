"""Engine catalog and cost model -- the code side of the workbook Engines sheet.

Two rules from manual section 9 are enforced structurally rather than by
discipline:

1. Fixed monthly platform fees are kept OUT of marginal attempt cost. They live
   on the catalog entry and are only applied later, at a modelled volume.
2. Every cost number carries a CostSource. A placeholder list price can never
   be mistaken for a reconciled invoice, and `unverified_engines()` names the
   ones still running on guesses.

THE SHIPPED PRICES ARE PLACEHOLDERS. Replace them with observed marginal cost
from your own provider dashboards before quoting any savings number.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from .config import DATA_DIR, BenchmarkInputs
from .schemas import CostSource

ENGINES_JSON = DATA_DIR / "engines.json"


class EnginePricing(BaseModel):
    """One provider's economics. `price_verified` is the honesty switch."""

    engine: str
    role: str = ""

    # Marginal cost of one attempt, in USD.
    cost_per_attempt_usd: float = 0.0
    # Additional per-second charge for engines billed on browser/session time.
    cost_per_session_second_usd: float = 0.0
    # Charged even when the attempt fails? Most hosted providers do charge.
    charges_on_failure: bool = True

    # Kept separate on purpose -- never folded into an attempt.
    fixed_monthly_fee_usd: float = 0.0

    cost_source: CostSource = CostSource.LIST_PRICE
    price_verified: bool = False

    # Local engines bill machine time, not a provider.
    is_local: bool = False

    # Capability flags the router reads when deciding eligibility.
    supports_js: bool = False
    supports_interaction: bool = False
    supports_pdf: bool = False

    notes: str = ""


#: Ordering here is only documentation; the router sorts by measured cost.
DEFAULT_CATALOG: list[EnginePricing] = [
    EnginePricing(
        engine="http",
        role="Primitive local baseline",
        cost_per_attempt_usd=0.0,
        is_local=True,
        cost_source=CostSource.ESTIMATE,
        price_verified=True,  # local compute is modelled, not quoted
        supports_pdf=True,
        notes="Cost is machine time only; see local_compute_cost().",
    ),
    EnginePricing(
        engine="playwright",
        role="Deterministic browser baseline",
        cost_per_attempt_usd=0.0,
        is_local=True,
        cost_source=CostSource.ESTIMATE,
        price_verified=True,
        supports_js=True,
        supports_interaction=True,
        notes="Cost is machine time only; browser startup dominates.",
    ),
    EnginePricing(
        engine="firecrawl",
        role="Hosted extraction baseline",
        cost_per_attempt_usd=0.002,
        supports_js=True,
        supports_pdf=True,
        notes="PLACEHOLDER. Derive from credits consumed per scrape on your plan.",
    ),
    EnginePricing(
        engine="browser_use",
        role="Agentic browser path",
        cost_per_attempt_usd=0.05,
        cost_per_session_second_usd=0.001,
        supports_js=True,
        supports_interaction=True,
        notes="PLACEHOLDER. Agentic runs also burn model tokens -- reconcile both.",
    ),
    EnginePricing(
        engine="zyte",
        role="Integrated extraction baseline",
        cost_per_attempt_usd=0.004,
        supports_js=True,
        supports_pdf=True,
        notes="PLACEHOLDER. Adapter not shipped; add before enabling.",
    ),
    EnginePricing(
        engine="brightdata",
        role="Extraction/browser provider",
        cost_per_attempt_usd=0.005,
        supports_js=True,
        notes="PLACEHOLDER. Adapter not shipped; add before enabling.",
    ),
    EnginePricing(
        engine="apify",
        role="Actors/browser platform",
        cost_per_attempt_usd=0.004,
        supports_js=True,
        supports_interaction=True,
        notes="PLACEHOLDER. Adapter not shipped; add before enabling.",
    ),
    EnginePricing(
        engine="browserbase",
        role="Browser infrastructure",
        cost_per_attempt_usd=0.0,
        cost_per_session_second_usd=0.002,
        supports_js=True,
        supports_interaction=True,
        notes="PLACEHOLDER. Billed on session minutes; adapter not shipped.",
    ),
]


class EngineCatalog:
    """Lookup over EnginePricing, loaded from data/engines.json when present."""

    def __init__(self, entries: Optional[list[EnginePricing]] = None) -> None:
        entries = entries if entries is not None else DEFAULT_CATALOG
        self._by_name: dict[str, EnginePricing] = {e.engine: e for e in entries}

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "EngineCatalog":
        path = path or ENGINES_JSON
        if not path.exists():
            return cls()
        raw = json.loads(path.read_text())
        return cls([EnginePricing(**row) for row in raw])

    def save(self, path: Optional[Path] = None) -> Path:
        path = path or ENGINES_JSON
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = [e.model_dump() for e in self._by_name.values()]
        path.write_text(json.dumps(rows, indent=2) + "\n")
        return path

    def get(self, engine: str) -> EnginePricing:
        if engine not in self._by_name:
            raise KeyError(
                f"engine {engine!r} is not in the catalog; add it to data/engines.json"
            )
        return self._by_name[engine]

    def names(self) -> list[str]:
        return list(self._by_name)

    def has(self, engine: str) -> bool:
        return engine in self._by_name

    def unverified_engines(self) -> list[str]:
        """Engines still priced from a placeholder. Any savings claim that
        depends on one of these is a guess, and the runner says so."""
        return [e.engine for e in self._by_name.values() if not e.price_verified]

    def expected_attempt_cost(self, engine: str, latency_ms: int = 0) -> float:
        """Cost the router uses to order routes before it has run anything."""
        p = self.get(engine)
        return p.cost_per_attempt_usd + p.cost_per_session_second_usd * (
            latency_ms / 1000.0
        )

    def fixed_monthly_fees(self, engines: Optional[list[str]] = None) -> float:
        names = engines if engines is not None else self.names()
        return sum(self.get(n).fixed_monthly_fee_usd for n in names)


def local_compute_cost(latency_ms: int, inputs: BenchmarkInputs) -> float:
    """Machine time attributed to one local attempt.

    Deliberately crude and deliberately non-zero: 'free' local engines are the
    easiest way to manufacture a fake saving, so they still carry a cost line.
    """
    hours = latency_ms / 1000.0 / 3600.0
    return round(hours * inputs.local_compute_usd_per_hour, 10)


def provider_cost(
    engine: str,
    catalog: EngineCatalog,
    latency_ms: int,
    api_success: bool,
    observed_cost_usd: Optional[float] = None,
) -> tuple[float, CostSource]:
    """Marginal provider charge for one attempt.

    An `observed_cost_usd` reported by the provider always wins; falling back to
    the catalog is explicitly labelled so the reconciliation step in section 9
    can find every estimate.
    """
    if observed_cost_usd is not None:
        return round(observed_cost_usd, 10), CostSource.OBSERVED_API

    p = catalog.get(engine)
    if p.is_local:
        return 0.0, CostSource.ESTIMATE
    if not api_success and not p.charges_on_failure:
        return 0.0, p.cost_source

    cost = p.cost_per_attempt_usd + p.cost_per_session_second_usd * (
        latency_ms / 1000.0
    )
    return round(cost, 10), p.cost_source


class VolumeModel(BaseModel):
    """Translates a per-job saving into monthly dollars at a stated volume.

    Fixed fees enter here, and only here.
    """

    jobs_per_month: int
    baseline_cost_per_correct: float
    candidate_cost_per_correct: float
    baseline_fixed_monthly_usd: float = 0.0
    candidate_fixed_monthly_usd: float = 0.0
    correct_rate: float = Field(default=1.0, ge=0.0, le=1.0)

    def monthly_baseline_usd(self) -> float:
        correct = self.jobs_per_month * self.correct_rate
        return correct * self.baseline_cost_per_correct + self.baseline_fixed_monthly_usd

    def monthly_candidate_usd(self) -> float:
        correct = self.jobs_per_month * self.correct_rate
        return (
            correct * self.candidate_cost_per_correct + self.candidate_fixed_monthly_usd
        )

    def monthly_savings_usd(self) -> float:
        return self.monthly_baseline_usd() - self.monthly_candidate_usd()
