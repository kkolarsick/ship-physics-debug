"""Executes a strategy over tasks and writes RunLog.

The runner is the only place an AttemptResult is constructed, which is how the
append-only invariant is kept: it writes a row for every route it touches --
successes, failures, ineligible engines and unconfigured providers alike --
before it decides whether to escalate.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable, Iterable, Optional

from .config import BenchmarkInputs
from .economics import RunLogWriter
from .engines.base import Engine
from .pricing import EngineCatalog
from .router import Strategy
from .schemas import AttemptResult, ErrorType, TaskSpec
from .validate import validate

#: (task, engine, output) -> True/False/None. None means "no human verdict",
#: which leaves the automated score in charge.
ManualReview = Callable[[TaskSpec, str, Optional[dict]], Optional[bool]]


def new_run_id(prefix: str = "run") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}-{stamp}-{uuid.uuid4().hex[:6]}"


class JobRunner:
    def __init__(
        self,
        inputs: BenchmarkInputs,
        catalog: EngineCatalog,
        engines: dict[str, Engine],
        *,
        run_id: Optional[str] = None,
        writer: Optional[RunLogWriter] = None,
        manual_review: Optional[ManualReview] = None,
        stop_on_correct: bool = True,
    ) -> None:
        self.inputs = inputs
        self.catalog = catalog
        self.engines = engines
        self.run_id = run_id or new_run_id()
        self.writer = writer
        self.manual_review = manual_review
        self.stop_on_correct = stop_on_correct

    def run_job(self, task: TaskSpec, strategy: Strategy) -> list[AttemptResult]:
        """One Task x Strategy job. Returns every attempt, in order."""
        attempts: list[AttemptResult] = []
        plan = strategy.plan(task, self.engines, self.catalog)

        if not plan:
            attempts.append(
                self._ineligible_attempt(
                    task,
                    strategy,
                    engine="none",
                    attempt_no=1,
                    reason="no eligible engine for this task",
                )
            )

        for attempt_no, route in enumerate(plan, start=1):
            engine = self.engines.get(route.engine)
            if engine is None:
                attempts.append(
                    self._ineligible_attempt(
                        task,
                        strategy,
                        engine=route.engine,
                        attempt_no=attempt_no,
                        reason=f"no adapter registered for {route.engine!r}",
                        escalated=route.escalated,
                    )
                )
                continue

            outcome = engine.run(task)

            manual = (
                self.manual_review(task, route.engine, outcome.output)
                if self.manual_review
                else None
            )
            result = validate(
                task,
                outcome.output,
                threshold=self.inputs.validation_threshold,
                manual_correct=manual,
            )

            attempt = AttemptResult(
                run_id=self.run_id,
                task_id=task.task_id,
                strategy=strategy.name,
                engine=route.engine,
                attempt_no=attempt_no,
                route_reason=route.reason,
                api_success=outcome.api_success,
                validation_score=result.score,
                manual_correct=manual,
                validated_correct=result.validated_correct,
                latency_ms=outcome.latency_ms,
                provider_cost_usd=outcome.provider_cost_usd,
                local_compute_cost_usd=outcome.local_compute_cost_usd,
                total_attempt_cost_usd=round(
                    outcome.provider_cost_usd + outcome.local_compute_cost_usd, 10
                ),
                provider_cost_source=outcome.provider_cost_source,
                retry_flag=outcome.retry_count > 0,
                escalated_flag=route.escalated,
                http_status=outcome.http_status,
                error_type=outcome.error_type.value,
                error_message=_trim(outcome.error_message)
                or (result.reason if not result.validated_correct else None),
                schema_valid=result.schema_valid,
                freshness_valid=result.freshness_valid,
                completeness_score=result.completeness_score,
                output=outcome.output,
                split=task.split.value,
                bucket=task.bucket.value,
            )
            attempts.append(attempt)

            if attempt.validated_correct and self.stop_on_correct:
                break

        if self.writer:
            self.writer.extend(attempts)
        return attempts

    def run_all(
        self, tasks: Iterable[TaskSpec], strategy: Strategy
    ) -> list[AttemptResult]:
        out: list[AttemptResult] = []
        for task in tasks:
            out.extend(self.run_job(task, strategy))
        return out

    def _ineligible_attempt(
        self,
        task: TaskSpec,
        strategy: Strategy,
        *,
        engine: str,
        attempt_no: int,
        reason: str,
        escalated: bool = False,
    ) -> AttemptResult:
        """A route that could not even be tried is still a row. A silently
        skipped engine would make a strategy look better than it is."""
        return AttemptResult(
            run_id=self.run_id,
            task_id=task.task_id,
            strategy=strategy.name,
            engine=engine,
            attempt_no=attempt_no,
            route_reason=reason,
            api_success=False,
            validation_score=0.0,
            validated_correct=False,
            latency_ms=0,
            total_attempt_cost_usd=0.0,
            escalated_flag=escalated,
            error_type=ErrorType.ENGINE_INELIGIBLE.value,
            error_message=reason,
            split=task.split.value,
            bucket=task.bucket.value,
        )


def _trim(message: Optional[str], limit: int = 400) -> Optional[str]:
    if not message:
        return None
    return message if len(message) <= limit else message[: limit - 1] + "…"
