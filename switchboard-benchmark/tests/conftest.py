"""Shared fixtures.

Every fixture here is offline and instant: no robots.txt fetch, no politeness
sleep, no provider call. Tests that need a provider mock it.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import BenchmarkInputs  # noqa: E402
from src.engines.base import Engine, RawResult  # noqa: E402
from src.pricing import EngineCatalog, EnginePricing  # noqa: E402
from src.safety import SafetyGate  # noqa: E402
from src.schemas import Bucket, ErrorType, Split, TaskSpec  # noqa: E402


@pytest.fixture
def inputs() -> BenchmarkInputs:
    return BenchmarkInputs(
        respect_robots=False,
        min_domain_delay_s=0.0,
        max_domain_delay_s=0.0,
        max_transient_retries=0,
        local_compute_usd_per_hour=3.6,  # $0.001 per second, easy to reason about
    )


@pytest.fixture
def catalog() -> EngineCatalog:
    """Prices chosen so the cheap/expensive ordering is unmistakable."""
    return EngineCatalog(
        [
            EnginePricing(
                engine="cheap",
                cost_per_attempt_usd=0.001,
                price_verified=True,
                supports_js=False,
            ),
            EnginePricing(
                engine="mid",
                cost_per_attempt_usd=0.010,
                price_verified=True,
                supports_js=True,
            ),
            EnginePricing(
                engine="premium",
                cost_per_attempt_usd=0.100,
                price_verified=True,
                supports_js=True,
                supports_interaction=True,
            ),
            EnginePricing(
                engine="local",
                cost_per_attempt_usd=0.0,
                is_local=True,
                price_verified=True,
            ),
            EnginePricing(engine="http", cost_per_attempt_usd=0.0, is_local=True, price_verified=True),
        ]
    )


@pytest.fixture
def gate(inputs: BenchmarkInputs) -> SafetyGate:
    return SafetyGate(inputs)


@pytest.fixture
def task() -> TaskSpec:
    return TaskSpec(
        task_id="STA-001",
        split=Split.TRAIN,
        bucket=Bucket.STATIC_HTML,
        domain="example.com",
        url="https://example.com/product/1",
        instruction="Extract the product name and price.",
        expected_json={"name": "Widget", "price": 19.99},
        output_schema={"name": "string", "price": "number"},
        selectors={"name": "h1.title", "price": "span.price"},
        gold_approved=True,
        sla_max_latency_ms=15_000,
    )


class ScriptedEngine(Engine):
    """An engine whose outcome is decided by the test, not by a network.

    It still goes through `Engine.run`, so costing, eligibility and the
    charge-on-failure rule are exercised exactly as in production.
    """

    def __init__(
        self,
        *args,
        name: str = "scripted",
        succeed: bool = True,
        output: Optional[dict] = None,
        latency_ms: int = 1000,
        supports_js: bool = False,
        supports_interaction: bool = False,
        error_type: ErrorType = ErrorType.PARSE_ERROR,
        observed_cost_usd: Optional[float] = None,
        **kwargs,
    ) -> None:
        self.name = name
        self.supports_js = supports_js
        self.supports_interaction = supports_interaction
        self._succeed = succeed
        self._output = output
        self._latency_ms = latency_ms
        self._error_type = error_type
        self._observed_cost_usd = observed_cost_usd
        self.calls = 0
        super().__init__(*args, **kwargs)

    def _execute(self, task: TaskSpec) -> RawResult:
        self.calls += 1
        if self._succeed:
            return RawResult(
                api_success=True,
                output=self._output,
                http_status=200,
                observed_cost_usd=self._observed_cost_usd,
            )
        return RawResult(
            api_success=False,
            http_status=500,
            error_type=self._error_type,
            error_message="scripted failure",
            observed_cost_usd=self._observed_cost_usd,
        )


@pytest.fixture
def scripted_engine_factory(inputs, catalog, gate):
    def make(**kwargs) -> ScriptedEngine:
        return ScriptedEngine(inputs, catalog, gate, **kwargs)

    return make
