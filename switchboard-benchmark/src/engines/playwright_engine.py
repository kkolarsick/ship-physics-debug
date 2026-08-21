"""Playwright Chromium -- the deterministic browser baseline.

Economic hypothesis: JS rendering may be cheap enough locally that a premium
hosted API is not required. Same selector contract as the HTTP engine, so the
only variable between them is rendering.

Interaction steps come from `task.notes` as a small declarative script rather
than free-form code, which keeps interaction-heavy tasks reproducible:

    click:button.load-more | scroll:3 | wait:1500 | waitfor:.results tr
"""

from __future__ import annotations

from typing import Any

from ..schemas import ErrorType, TaskSpec
from .base import Engine, RawResult, classify_status
from .extract import extract_from_html, has_extraction

INTERACTION_PREFIX = "steps:"


def parse_steps(notes: str) -> list[tuple[str, str]]:
    """Pull the declarative interaction script out of a task's notes."""
    if INTERACTION_PREFIX not in notes:
        return []
    script = notes.split(INTERACTION_PREFIX, 1)[1].strip()
    steps: list[tuple[str, str]] = []
    for chunk in script.split("|"):
        chunk = chunk.strip()
        if not chunk:
            continue
        verb, _, arg = chunk.partition(":")
        steps.append((verb.strip().casefold(), arg.strip()))
    return steps


class PlaywrightEngine(Engine):
    name = "playwright"
    supports_js = True
    supports_interaction = True
    supports_pdf = False

    def __init__(self, *args: Any, timeout_ms: int = 30_000, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.timeout_ms = timeout_ms

    def is_available(self) -> tuple[bool, str]:
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            return False, "playwright is not installed (pip install playwright)"
        return True, ""

    def _execute(self, task: TaskSpec) -> RawResult:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright

        if not task.selectors:
            return RawResult(
                api_success=False,
                error_type=ErrorType.SCHEMA_ERROR,
                error_message=(
                    "task has no selectors; the Playwright engine does not guess."
                ),
            )

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                context = browser.new_context(user_agent=self.inputs.user_agent)
                page = context.new_page()
                response = page.goto(
                    task.url, timeout=self.timeout_ms, wait_until="domcontentloaded"
                )
                status = response.status if response else None

                if status is not None:
                    error_type = classify_status(status)
                    if error_type is not ErrorType.NONE:
                        return RawResult(
                            api_success=False,
                            http_status=status,
                            error_type=error_type,
                            error_message=f"HTTP {status}",
                        )

                try:
                    self._run_steps(page, parse_steps(task.notes))
                except PlaywrightError as exc:
                    return RawResult(
                        api_success=False,
                        http_status=status,
                        error_type=ErrorType.PARSE_ERROR,
                        error_message=f"interaction step failed: {exc}",
                    )

                html = page.content()
            finally:
                browser.close()

        output = extract_from_html(html, task.selectors, task.output_schema)
        if not has_extraction(output):
            return RawResult(
                api_success=False,
                output=output,
                http_status=status,
                error_type=ErrorType.PARSE_ERROR,
                error_message="no selector matched after rendering",
            )
        return RawResult(api_success=True, output=output, http_status=status)

    def _run_steps(self, page: Any, steps: list[tuple[str, str]]) -> None:
        for verb, arg in steps:
            if verb == "click":
                page.click(arg, timeout=self.timeout_ms)
            elif verb == "waitfor":
                page.wait_for_selector(arg, timeout=self.timeout_ms)
            elif verb == "wait":
                page.wait_for_timeout(int(arg or 1000))
            elif verb == "scroll":
                for _ in range(int(arg or 1)):
                    page.mouse.wheel(0, 20_000)
                    page.wait_for_timeout(750)
            elif verb == "fill":
                selector, _, value = arg.partition("=")
                page.fill(selector.strip(), value.strip(), timeout=self.timeout_ms)
            else:
                raise ValueError(f"unknown interaction step {verb!r}")
