"""Engine behaviour: extraction, cost attribution, and the safety rules.

No test here touches the network. Paid providers are mocked, per manual
Prompt 2.
"""

from __future__ import annotations

import httpx
import pytest

from src.engines import build_engines
from src.engines.extract import extract_from_html, has_extraction, parse_selector
from src.engines.firecrawl_engine import FirecrawlEngine, _json_schema_from
from src.engines.http_engine import HttpEngine
from src.engines.playwright_engine import parse_steps
from src.pricing import EngineCatalog, EnginePricing
from src.safety import DomainThrottle, RobotsDisallowed, SafetyGate, domain_of
from src.schemas import CostSource, ErrorType

PAGE = """
<html><body>
  <h1 class="title">Widget</h1>
  <span class="price">$19.99</span>
  <ul class="tags"><li>a</li><li>b</li></ul>
  <a class="perma" href="/p/1">link</a>
</body></html>
"""


# --- selector extraction --------------------------------------------------


def test_parse_selector_grammar():
    assert parse_selector("h1.title") == ("h1.title", False, None)
    assert parse_selector("a.perma@href") == ("a.perma", False, "href")
    assert parse_selector("ul.tags li::all") == ("ul.tags li", True, None)
    assert parse_selector("img::all@src") == ("img", True, "src")


def test_parse_selector_rejects_an_empty_css_part():
    with pytest.raises(ValueError, match="no CSS part"):
        parse_selector("@href")


def test_extract_coerces_to_the_declared_schema():
    out = extract_from_html(
        PAGE,
        {"name": "h1.title", "price": "span.price", "tags": "ul.tags li::all", "href": "a.perma@href"},
        {"name": "string", "price": "number", "tags": "array"},
    )
    assert out["name"] == "Widget"
    assert out["price"] == pytest.approx(19.99)  # "$19.99" -> 19.99
    assert out["tags"] == ["a", "b"]
    assert out["href"] == "/p/1"


def test_unmatched_selector_becomes_none_not_a_silent_pass():
    out = extract_from_html(PAGE, {"stock": "span.stock"}, {"stock": "string"})
    assert out["stock"] is None
    assert not has_extraction(out)


# --- HTTP engine ----------------------------------------------------------


@pytest.fixture
def patched_httpx(monkeypatch):
    """Swap httpx.get inside the HTTP engine for a scripted responder."""

    def install(response_or_exc):
        def fake_get(url, **kwargs):
            if isinstance(response_or_exc, Exception):
                raise response_or_exc
            return response_or_exc

        monkeypatch.setattr("src.engines.http_engine.httpx.get", fake_get)

    return install


def test_http_engine_extracts_and_costs_local_compute(inputs, catalog, gate, patched_httpx):
    patched_httpx(httpx.Response(200, text=PAGE, headers={"content-type": "text/html"}))
    from src.schemas import Bucket, TaskSpec

    task = TaskSpec(
        task_id="STA-001",
        bucket=Bucket.STATIC_HTML,
        domain="example.com",
        url="https://example.com/p/1",
        instruction="Get name and price.",
        expected_json={"name": "Widget", "price": 19.99},
        output_schema={"name": "string", "price": "number"},
        selectors={"name": "h1.title", "price": "span.price"},
        gold_approved=True,
    )

    outcome = HttpEngine(inputs, catalog, gate).run(task)

    assert outcome.api_success
    assert outcome.output == {"name": "Widget", "price": pytest.approx(19.99)}
    assert outcome.provider_cost_usd == 0.0
    # Local engines are not free: machine time is still attributed.
    assert outcome.local_compute_cost_usd >= 0.0
    assert outcome.provider_cost_source is CostSource.ESTIMATE


def test_403_is_recorded_as_blocked_and_not_retried(inputs, catalog, gate, monkeypatch, task):
    calls = {"n": 0}

    def fake_get(url, **kwargs):
        calls["n"] += 1
        return httpx.Response(403, text="forbidden")

    monkeypatch.setattr("src.engines.http_engine.httpx.get", fake_get)
    outcome = HttpEngine(inputs, catalog, gate).run(task)

    assert outcome.error_type is ErrorType.BLOCKED
    assert outcome.http_status == 403
    assert calls["n"] == 1  # a block is a decision, not a transient fault


def test_429_is_recorded_as_rate_limited(inputs, catalog, gate, patched_httpx, task):
    patched_httpx(httpx.Response(429, text="slow down"))
    outcome = HttpEngine(inputs, catalog, gate).run(task)
    assert outcome.error_type is ErrorType.RATE_LIMITED


def test_engine_without_selectors_refuses_to_guess(inputs, catalog, gate, patched_httpx, task):
    patched_httpx(httpx.Response(200, text=PAGE, headers={"content-type": "text/html"}))
    task.selectors = {}
    outcome = HttpEngine(inputs, catalog, gate).run(task)
    assert outcome.error_type is ErrorType.SCHEMA_ERROR
    assert "does not guess" in (outcome.error_message or "")


def test_unmatched_page_is_a_failure_that_still_costs(inputs, catalog, gate, patched_httpx, task):
    patched_httpx(httpx.Response(200, text="<html><body>nothing here</body></html>",
                                 headers={"content-type": "text/html"}))
    outcome = HttpEngine(inputs, catalog, gate).run(task)
    assert not outcome.api_success
    assert outcome.error_type is ErrorType.PARSE_ERROR
    assert "needs rendering" in (outcome.error_message or "")


def test_timeout_is_reported_after_retries_are_exhausted(inputs, catalog, gate, patched_httpx, task):
    patched_httpx(httpx.TimeoutException("too slow"))
    outcome = HttpEngine(inputs, catalog, gate).run(task)
    assert outcome.error_type is ErrorType.TIMEOUT


def test_paid_engine_still_charges_for_a_failed_attempt(inputs, gate, task):
    """Manual section 9: a failed attempt is spend, not a free retry."""
    catalog = EngineCatalog(
        [EnginePricing(engine="firecrawl", cost_per_attempt_usd=0.05, charges_on_failure=True)]
    )
    engine = FirecrawlEngine(inputs, catalog, gate)
    outcome = engine._outcome_error(ErrorType.HTTP_ERROR, "boom", latency_ms=1200)
    assert outcome.provider_cost_usd == pytest.approx(0.05)


def test_unconfigured_provider_is_not_charged(inputs, gate, monkeypatch, task):
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    catalog = EngineCatalog([EnginePricing(engine="firecrawl", cost_per_attempt_usd=0.05)])
    outcome = FirecrawlEngine(inputs, catalog, gate).run(task)
    assert outcome.error_type is ErrorType.NOT_CONFIGURED
    assert outcome.provider_cost_usd == 0.0


# --- Firecrawl response handling -----------------------------------------


def test_firecrawl_json_payload_is_used(inputs, gate):
    catalog = EngineCatalog([EnginePricing(engine="firecrawl", cost_per_attempt_usd=0.002)])
    engine = FirecrawlEngine(inputs, catalog, gate)
    raw = engine._parse_response({"success": True, "data": {"json": {"name": "Widget"}}}, 200)
    assert raw.api_success
    assert raw.output == {"name": "Widget"}


def test_firecrawl_empty_payload_is_a_parse_error(inputs, gate):
    catalog = EngineCatalog([EnginePricing(engine="firecrawl")])
    engine = FirecrawlEngine(inputs, catalog, gate)
    raw = engine._parse_response({"success": True, "data": {}}, 200)
    assert not raw.api_success
    assert raw.error_type is ErrorType.PARSE_ERROR


def test_firecrawl_credits_become_dollars_only_with_a_rate(inputs, gate, monkeypatch):
    catalog = EngineCatalog([EnginePricing(engine="firecrawl", cost_per_attempt_usd=0.002)])

    engine = FirecrawlEngine(inputs, catalog, gate)
    body = {"success": True, "data": {"json": {"a": 1}, "metadata": {"creditsUsed": 5}}}
    assert engine._parse_response(body, 200).observed_cost_usd is None  # no rate set

    monkeypatch.setenv("FIRECRAWL_USD_PER_CREDIT", "0.001")
    engine = FirecrawlEngine(inputs, catalog, gate)
    assert engine._parse_response(body, 200).observed_cost_usd == pytest.approx(0.005)


def test_json_schema_conversion():
    schema = _json_schema_from({"name": "string", "price": "number", "tags": "array"})
    assert schema["properties"]["price"]["type"] == "number"
    assert schema["properties"]["tags"]["items"] == {"type": "string"}
    assert set(schema["required"]) == {"name", "price", "tags"}


# --- Playwright step script ----------------------------------------------


def test_interaction_steps_are_parsed_from_notes():
    steps = parse_steps("anything before | steps: click:button.more | scroll:3 | wait:500")
    assert steps == [("click", "button.more"), ("scroll", "3"), ("wait", "500")]


def test_no_steps_when_notes_say_nothing():
    assert parse_steps("just a note") == []


# --- safety ---------------------------------------------------------------


def test_robots_disallow_blocks_before_any_request(inputs, catalog):
    inputs.respect_robots = True
    gate = SafetyGate(inputs)
    gate.robots.allowed = lambda url: False  # type: ignore[assignment]

    with pytest.raises(RobotsDisallowed):
        gate.before_request("https://example.com/x")


def test_disallowed_task_is_logged_not_attempted(inputs, catalog, task, monkeypatch):
    inputs.respect_robots = True
    gate = SafetyGate(inputs)
    gate.robots.allowed = lambda url: False  # type: ignore[assignment]
    called = {"n": 0}
    monkeypatch.setattr(
        "src.engines.http_engine.httpx.get",
        lambda *a, **k: called.__setitem__("n", called["n"] + 1),
    )

    outcome = HttpEngine(inputs, catalog, gate).run(task)
    assert outcome.error_type is ErrorType.ROBOTS_DISALLOWED
    assert called["n"] == 0
    assert outcome.provider_cost_usd == 0.0


def test_throttle_spaces_requests_to_the_same_domain():
    slept: list[float] = []
    throttle = DomainThrottle(min_delay_s=2.0, max_delay_s=2.0)
    throttle._sleep = slept.append  # type: ignore[assignment]

    assert throttle.wait("https://example.com/a") == 0.0  # first hit is free
    second = throttle.wait("https://example.com/b")
    assert second > 0.0
    assert slept == [second]


def test_throttle_does_not_delay_a_different_domain():
    throttle = DomainThrottle(min_delay_s=2.0, max_delay_s=2.0)
    throttle._sleep = lambda s: None  # type: ignore[assignment]
    throttle.wait("https://a.example/x")
    assert throttle.wait("https://b.example/x") == 0.0


def test_domain_of():
    assert domain_of("https://Example.com/path") == "example.com"


def test_crawl_delay_overrides_a_shorter_default():
    slept: list[float] = []
    throttle = DomainThrottle(min_delay_s=1.0, max_delay_s=1.0)
    throttle._sleep = slept.append  # type: ignore[assignment]
    throttle.wait("https://example.com/a")
    assert throttle.wait("https://example.com/b", crawl_delay_s=10.0) == pytest.approx(10.0, abs=0.2)


# --- registry -------------------------------------------------------------


def test_build_engines_shares_one_safety_gate(inputs, catalog):
    engines = build_engines(inputs, EngineCatalog.load(), ["http", "playwright"])
    assert set(engines) == {"http", "playwright"}
    assert engines["http"].gate is engines["playwright"].gate


def test_build_engines_rejects_an_unknown_name(inputs, catalog):
    with pytest.raises(KeyError, match="no adapter registered"):
        build_engines(inputs, EngineCatalog.load(), ["zyte"])
