"""HTTP + BeautifulSoup -- the primitive local baseline.

Economic hypothesis: a large share of ordinary pages should cost almost
nothing. This engine exists to find out how large that share really is, so it
is kept deliberately dumb: one GET, one parse, no rendering, no retries beyond
the transient ones the base class allows.
"""

from __future__ import annotations

from typing import Any, Optional

import httpx

from ..schemas import ErrorType, TaskSpec
from .base import Engine, RawResult, classify_status
from .extract import extract_from_html, has_extraction

PDF_CONTENT_TYPES = ("application/pdf", "application/x-pdf")


class HttpEngine(Engine):
    name = "http"
    supports_js = False
    supports_interaction = False
    supports_pdf = True

    def __init__(self, *args: Any, timeout_s: float = 20.0, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.timeout_s = timeout_s

    def _execute(self, task: TaskSpec) -> RawResult:
        response = httpx.get(
            task.url,
            headers=self.gate.headers(),
            timeout=self.timeout_s,
            follow_redirects=True,
        )

        error_type = classify_status(response.status_code)
        if error_type is not ErrorType.NONE:
            # 403/429 are recorded and left alone -- no bypass, no aggressive retry.
            return RawResult(
                api_success=False,
                http_status=response.status_code,
                error_type=error_type,
                error_message=f"HTTP {response.status_code}",
            )

        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        if content_type in PDF_CONTENT_TYPES or task.url.lower().endswith(".pdf"):
            return self._extract_pdf(response.content, task, response.status_code)

        if not task.selectors:
            return RawResult(
                api_success=False,
                http_status=response.status_code,
                error_type=ErrorType.SCHEMA_ERROR,
                error_message=(
                    "task has no selectors; the HTTP engine does not guess. "
                    "Add selectors or restrict allowed_engines."
                ),
            )

        try:
            output = extract_from_html(response.text, task.selectors, task.output_schema)
        except ValueError as exc:
            return RawResult(
                api_success=False,
                http_status=response.status_code,
                error_type=ErrorType.PARSE_ERROR,
                error_message=str(exc),
            )

        if not has_extraction(output):
            return RawResult(
                api_success=False,
                output=output,
                http_status=response.status_code,
                error_type=ErrorType.PARSE_ERROR,
                error_message="no selector matched (page likely needs rendering)",
            )

        return RawResult(api_success=True, output=output, http_status=response.status_code)

    def _extract_pdf(
        self, payload: bytes, task: TaskSpec, status: int
    ) -> RawResult:
        """Text-layer only. Scanned documents fail here and that failure is the
        finding -- section 15 explicitly asks whether documents are their own
        product."""
        try:
            import io

            from pypdf import PdfReader
        except ImportError:
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.NOT_CONFIGURED,
                error_message="pypdf is not installed; pip install -r requirements.txt",
            )

        try:
            reader = PdfReader(io.BytesIO(payload))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception as exc:  # noqa: BLE001 - malformed PDFs are a real outcome
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.PARSE_ERROR,
                error_message=f"pdf parse failed: {type(exc).__name__}: {exc}",
            )

        text = "\n".join(pages).strip()
        if not text:
            return RawResult(
                api_success=False,
                http_status=status,
                error_type=ErrorType.PARSE_ERROR,
                error_message="pdf has no text layer (likely scanned)",
            )

        output: dict[str, Optional[object]] = {"text": text, "page_count": len(pages)}
        return RawResult(api_success=True, output=output, http_status=status)
