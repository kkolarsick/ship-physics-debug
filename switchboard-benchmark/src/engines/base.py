"""Shared engine contract.

Every engine exposes the same `run(task) -> EngineOutcome`. That uniformity is
what makes single-provider baselines and routed strategies comparable at all.

An engine reports what happened and what it cost. It never decides whether the
output was correct -- that belongs to validate.py against frozen gold.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Optional

import httpx

from ..config import BenchmarkInputs
from ..pricing import EngineCatalog, local_compute_cost, provider_cost
from ..safety import BLOCKED_STATUS, RATE_LIMITED_STATUS, RobotsDisallowed, SafetyGate
from ..schemas import CostSource, EngineOutcome, ErrorType, TaskSpec

#: Errors worth a bounded retry. A 403 or 429 is a decision by the site, not a
#: transient fault, and never appears here.
TRANSIENT_EXCEPTIONS = (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)


class Engine(ABC):
    """Base class for one attempt path."""

    #: Registry key. Must match an entry in the pricing catalog.
    name: str = "base"

    #: Capability declarations the router reads for eligibility.
    supports_js: bool = False
    supports_interaction: bool = False
    supports_pdf: bool = False

    def __init__(
        self,
        inputs: BenchmarkInputs,
        catalog: EngineCatalog,
        gate: Optional[SafetyGate] = None,
    ) -> None:
        self.inputs = inputs
        self.catalog = catalog
        self.gate = gate or SafetyGate(inputs)

    # ---- adapter surface -------------------------------------------------

    @abstractmethod
    def _execute(self, task: TaskSpec) -> "RawResult":
        """Do the actual work. Raise for transient failures; return a RawResult
        for anything the engine handled itself."""

    def is_available(self) -> tuple[bool, str]:
        """(usable, why not). Missing credentials must fail loudly here rather
        than silently scoring a task as a failure."""
        return True, ""

    def is_eligible(self, task: TaskSpec) -> tuple[bool, str]:
        if not task.is_engine_eligible(self.name):
            return False, "not in task.allowed_engines"
        if task.requires_js and not self.supports_js:
            return False, "task requires JS rendering"
        if task.requires_interaction and not self.supports_interaction:
            return False, "task requires page interaction"
        return True, ""

    # ---- orchestration ---------------------------------------------------

    def run(self, task: TaskSpec) -> EngineOutcome:
        """Safety gate, bounded transient retries, timing, costing.

        Latency covers only the engine's own work: politeness sleeps and robots
        fetches are excluded so a slow benchmark does not look like a slow
        provider.
        """
        available, why = self.is_available()
        if not available:
            return self._outcome_error(ErrorType.NOT_CONFIGURED, why, latency_ms=0)

        eligible, why = self.is_eligible(task)
        if not eligible:
            return self._outcome_error(ErrorType.ENGINE_INELIGIBLE, why, latency_ms=0)

        retries = 0
        last_error: Optional[Exception] = None

        while retries <= self.inputs.max_transient_retries:
            try:
                self.gate.before_request(task.url)
            except RobotsDisallowed as exc:
                return self._outcome_error(
                    ErrorType.ROBOTS_DISALLOWED, str(exc), latency_ms=0
                )

            started = time.perf_counter()
            try:
                raw = self._execute(task)
            except TRANSIENT_EXCEPTIONS as exc:
                latency_ms = int((time.perf_counter() - started) * 1000)
                last_error = exc
                if retries >= self.inputs.max_transient_retries:
                    return self._outcome_error(
                        ErrorType.TIMEOUT
                        if isinstance(exc, httpx.TimeoutException)
                        else ErrorType.NETWORK,
                        f"{type(exc).__name__}: {exc}",
                        latency_ms=latency_ms,
                        retries=retries,
                    )
                retries += 1
                time.sleep(2**retries)  # exponential backoff, max 2 retries
                continue
            except Exception as exc:  # noqa: BLE001 - an engine bug is a data point
                latency_ms = int((time.perf_counter() - started) * 1000)
                return self._outcome_error(
                    ErrorType.UNKNOWN,
                    f"{type(exc).__name__}: {exc}",
                    latency_ms=latency_ms,
                    retries=retries,
                )

            latency_ms = int((time.perf_counter() - started) * 1000)
            return self._to_outcome(raw, latency_ms, retries)

        # Unreachable: the loop returns on success and on exhausted retries.
        return self._outcome_error(
            ErrorType.NETWORK, f"retries exhausted: {last_error}", latency_ms=0
        )

    # ---- helpers ---------------------------------------------------------

    def _to_outcome(self, raw: "RawResult", latency_ms: int, retries: int) -> EngineOutcome:
        cost, source = provider_cost(
            self.name,
            self.catalog,
            latency_ms=latency_ms,
            api_success=raw.api_success,
            observed_cost_usd=raw.observed_cost_usd,
        )
        local = (
            local_compute_cost(latency_ms, self.inputs)
            if self.catalog.get(self.name).is_local
            else 0.0
        )
        return EngineOutcome(
            engine=self.name,
            api_success=raw.api_success,
            latency_ms=latency_ms,
            output=raw.output,
            provider_cost_usd=cost,
            provider_cost_source=source,
            local_compute_cost_usd=local,
            http_status=raw.http_status,
            error_type=raw.error_type,
            error_message=raw.error_message,
            retry_count=retries,
        )

    def _outcome_error(
        self,
        error_type: ErrorType,
        message: str,
        *,
        latency_ms: int,
        retries: int = 0,
        http_status: Optional[int] = None,
    ) -> EngineOutcome:
        """A failed attempt still costs money if the provider charges for it."""
        charge_it = error_type not in (
            ErrorType.NOT_CONFIGURED,
            ErrorType.ENGINE_INELIGIBLE,
            ErrorType.ROBOTS_DISALLOWED,
        )
        cost, source = (
            provider_cost(self.name, self.catalog, latency_ms, api_success=False)
            if charge_it
            else (0.0, CostSource.ESTIMATE)
        )
        local = (
            local_compute_cost(latency_ms, self.inputs)
            if charge_it and self.catalog.get(self.name).is_local
            else 0.0
        )
        return EngineOutcome(
            engine=self.name,
            api_success=False,
            latency_ms=latency_ms,
            output=None,
            provider_cost_usd=cost,
            provider_cost_source=source,
            local_compute_cost_usd=local,
            http_status=http_status,
            error_type=error_type,
            error_message=message,
            retry_count=retries,
        )


class RawResult:
    """What an adapter hands back before costing and timing are applied."""

    __slots__ = ("api_success", "output", "http_status", "error_type", "error_message", "observed_cost_usd")

    def __init__(
        self,
        api_success: bool,
        output: Optional[dict] = None,
        http_status: Optional[int] = None,
        error_type: ErrorType = ErrorType.NONE,
        error_message: Optional[str] = None,
        observed_cost_usd: Optional[float] = None,
    ) -> None:
        self.api_success = api_success
        self.output = output
        self.http_status = http_status
        self.error_type = error_type
        self.error_message = error_message
        self.observed_cost_usd = observed_cost_usd


def classify_status(status: int) -> ErrorType:
    """Map an HTTP status onto a recorded outcome. 403 and 429 are logged as
    what they are and the run moves on -- manual section 3."""
    if status == BLOCKED_STATUS:
        return ErrorType.BLOCKED
    if status == RATE_LIMITED_STATUS:
        return ErrorType.RATE_LIMITED
    if status >= 400:
        return ErrorType.HTTP_ERROR
    return ErrorType.NONE
