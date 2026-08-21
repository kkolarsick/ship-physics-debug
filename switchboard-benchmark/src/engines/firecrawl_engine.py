"""Firecrawl -- the hosted extraction baseline, and the default comparator.

This is the "one good tool" a real customer would otherwise buy, so the router
has to beat it on cost per validated correct result, not on a straw man.

Endpoint shape is pinned to the v2 scrape API and overridable by env var. Verify
the request/response shape and the credit-to-dollar conversion against your own
dashboard before quoting savings -- manual section 9.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from ..schemas import ErrorType, TaskSpec
from .base import Engine, RawResult, classify_status

DEFAULT_API_BASE = "https://api.firecrawl.dev"
SCRAPE_PATH = "/v2/scrape"

#: USD per Firecrawl credit. PLACEHOLDER -- set FIRECRAWL_USD_PER_CREDIT from
#: (plan price / credits included) so observed credit usage becomes real money.
DEFAULT_USD_PER_CREDIT = 0.0


def _json_schema_from(output_schema: dict[str, str]) -> dict[str, Any]:
    """Turn the task's flat field->type map into a JSON Schema object."""
    type_map = {
        "string": "string",
        "number": "number",
        "integer": "integer",
        "boolean": "boolean",
        "array": "array",
        "object": "object",
        "any": "string",
    }
    properties: dict[str, Any] = {}
    for field, declared in output_schema.items():
        json_type = type_map.get(declared.lower(), "string")
        prop: dict[str, Any] = {"type": json_type}
        if json_type == "array":
            prop["items"] = {"type": "string"}
        properties[field] = prop
    return {
        "type": "object",
        "properties": properties,
        "required": list(output_schema),
    }


class FirecrawlEngine(Engine):
    name = "firecrawl"
    supports_js = True
    supports_interaction = False
    supports_pdf = True

    def __init__(self, *args: Any, timeout_s: float = 90.0, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.timeout_s = timeout_s
        self.api_key = os.getenv("FIRECRAWL_API_KEY", "")
        self.api_base = os.getenv("FIRECRAWL_API_BASE", DEFAULT_API_BASE).rstrip("/")
        self.usd_per_credit = float(
            os.getenv("FIRECRAWL_USD_PER_CREDIT", DEFAULT_USD_PER_CREDIT)
        )

    def is_available(self) -> tuple[bool, str]:
        if not self.api_key:
            return False, "FIRECRAWL_API_KEY is not set"
        return True, ""

    def _execute(self, task: TaskSpec) -> RawResult:
        payload: dict[str, Any] = {"url": task.url, "onlyMainContent": True}
        if task.output_schema:
            payload["formats"] = [
                {
                    "type": "json",
                    "prompt": task.instruction,
                    "schema": _json_schema_from(task.output_schema),
                }
            ]
        else:
            payload["formats"] = ["markdown"]

        response = httpx.post(
            f"{self.api_base}{SCRAPE_PATH}",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=self.timeout_s,
        )

        error_type = classify_status(response.status_code)
        if error_type is not ErrorType.NONE:
            return RawResult(
                api_success=False,
                http_status=response.status_code,
                error_type=error_type,
                # Body, not headers -- the key must never reach the log.
                error_message=f"HTTP {response.status_code}: {response.text[:300]}",
            )

        return self._parse_response(response.json(), response.status_code)

    def _parse_response(self, body: dict[str, Any], status: int) -> RawResult:
        if body.get("success") is False:
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.HTTP_ERROR,
                error_message=str(body.get("error", "firecrawl reported failure"))[:300],
            )

        data = body.get("data") or {}
        observed_cost = self._observed_cost(body, data)

        output: Optional[dict[str, Any]] = None
        if isinstance(data.get("json"), dict):
            output = data["json"]
        elif isinstance(data.get("markdown"), str) and data["markdown"].strip():
            output = {"markdown": data["markdown"]}

        if not output:
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.PARSE_ERROR,
                error_message="firecrawl returned no json or markdown payload",
                observed_cost_usd=observed_cost,
            )

        return RawResult(
            api_success=True,
            output=output,
            http_status=status,
            observed_cost_usd=observed_cost,
        )

    def _observed_cost(
        self, body: dict[str, Any], data: dict[str, Any]
    ) -> Optional[float]:
        """Credits consumed x your USD/credit rate. Returns None (falling back
        to the catalog estimate) unless both numbers are actually known."""
        credits = (
            body.get("creditsUsed")
            or data.get("creditsUsed")
            or (data.get("metadata") or {}).get("creditsUsed")
        )
        if credits is None or not self.usd_per_credit:
            return None
        try:
            return float(credits) * self.usd_per_credit
        except (TypeError, ValueError):
            return None
