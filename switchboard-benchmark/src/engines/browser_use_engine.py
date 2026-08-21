"""Browser Use -- the agentic browser path.

Economic hypothesis from the manual: flexible, but probably too costly for
routine jobs. The point of including it is to find the narrow class of tasks
where that flexibility is worth paying for, not to use it as a default.

Agentic runs bill twice: session time and model tokens. Both are pulled from
the task record when the API reports them, because an agentic path that looks
cheap is almost always a path whose token spend was never counted.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import httpx

from ..schemas import ErrorType, TaskSpec
from .base import Engine, RawResult, classify_status

DEFAULT_API_BASE = "https://api.browser-use.com"
TASKS_PATH = "/api/v2/tasks"

TERMINAL_OK = {"finished", "completed", "done", "success"}
TERMINAL_BAD = {"failed", "stopped", "error", "cancelled"}


class BrowserUseEngine(Engine):
    name = "browser_use"
    supports_js = True
    supports_interaction = True
    supports_pdf = False

    def __init__(
        self,
        *args: Any,
        timeout_s: float = 300.0,
        poll_interval_s: float = 3.0,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.timeout_s = timeout_s
        self.poll_interval_s = poll_interval_s
        self.api_key = os.getenv("BROWSER_USE_API_KEY", "")
        self.api_base = os.getenv("BROWSER_USE_API_BASE", DEFAULT_API_BASE).rstrip("/")

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "BROWSER_USE_API_KEY is not set"
        return True, ""

    def _headers(self) -> dict[str, str]:
        return {"X-Browser-Use-API-Key": self.api_key, "Content-Type": "application/json"}

    def _execute(self, task: TaskSpec) -> RawResult:
        payload: dict[str, Any] = {
            "task": f"Go to {task.url} and {task.instruction}",
            "startUrl": task.url,
        }
        if task.output_schema:
            payload["structuredOutputJson"] = _json_schema_from(task.output_schema)

        created = httpx.post(
            f"{self.api_base}{TASKS_PATH}",
            json=payload,
            headers=self._headers(),
            timeout=60.0,
        )
        error_type = classify_status(created.status_code)
        if error_type is not ErrorType.NONE:
            return RawResult(
                api_success=False,
                http_status=created.status_code,
                error_type=error_type,
                error_message=f"HTTP {created.status_code}: {created.text[:300]}",
            )

        body = created.json()
        task_id = body.get("id") or body.get("taskId")
        if not task_id:
            return RawResult(
                api_success=False,
                http_status=created.status_code,
                error_type=ErrorType.PARSE_ERROR,
                error_message="browser-use did not return a task id",
            )

        return self._poll(task_id, created.status_code)

    def _poll(self, task_id: str, status_code: int) -> RawResult:
        deadline = time.monotonic() + self.timeout_s
        last: dict[str, Any] = {}

        while time.monotonic() < deadline:
            resp = httpx.get(
                f"{self.api_base}{TASKS_PATH}/{task_id}",
                headers=self._headers(),
                timeout=60.0,
            )
            error_type = classify_status(resp.status_code)
            if error_type is not ErrorType.NONE:
                return RawResult(
                    api_success=False,
                    http_status=resp.status_code,
                    error_type=error_type,
                    error_message=f"HTTP {resp.status_code}: {resp.text[:300]}",
                )

            last = resp.json()
            state = str(last.get("status", "")).casefold()
            if state in TERMINAL_OK:
                return self._finished(last, resp.status_code)
            if state in TERMINAL_BAD:
                return RawResult(
                    api_success=False,
                    http_status=resp.status_code,
                    error_type=ErrorType.HTTP_ERROR,
                    error_message=f"browser-use task {state}",
                    observed_cost_usd=_observed_cost(last),
                )
            time.sleep(self.poll_interval_s)

        return RawResult(
            api_success=False,
            http_status=status_code,
            error_type=ErrorType.TIMEOUT,
            # The session still ran, so whatever it burned is still owed.
            error_message=f"browser-use task did not finish within {self.timeout_s:.0f}s",
            observed_cost_usd=_observed_cost(last),
        )

    def _finished(self, body: dict[str, Any], status: int) -> RawResult:
        cost = _observed_cost(body)
        output = body.get("structuredOutput") or body.get("output")
        if isinstance(output, str):
            import json

            try:
                output = json.loads(output)
            except json.JSONDecodeError:
                output = {"text": output}
        if not isinstance(output, dict) or not output:
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.PARSE_ERROR,
                error_message="browser-use finished without a usable output payload",
                observed_cost_usd=cost,
            )
        return RawResult(
            api_success=True, output=output, http_status=status, observed_cost_usd=cost
        )


def _observed_cost(body: dict[str, Any]) -> Optional[float]:
    """Session cost plus token cost, when the API reports them."""
    if not body:
        return None
    total = 0.0
    found = False
    for key in ("cost", "totalCostUsd", "sessionCostUsd", "llmCostUsd"):
        value = body.get(key)
        if value is None:
            continue
        try:
            total += float(value)
            found = True
        except (TypeError, ValueError):
            continue
    return total if found else None


def _json_schema_from(output_schema: dict[str, str]) -> dict[str, Any]:
    from .firecrawl_engine import _json_schema_from as build

    return build(output_schema)
