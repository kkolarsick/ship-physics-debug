"""Cost attribution: what counts, what is separate, and what is a guess."""

from __future__ import annotations

import pytest

from src.config import BenchmarkInputs
from src.pricing import (
    DEFAULT_CATALOG,
    EngineCatalog,
    EnginePricing,
    VolumeModel,
    local_compute_cost,
    provider_cost,
)
from src.schemas import CostSource


def test_observed_cost_always_beats_the_catalog_estimate(catalog):
    cost, source = provider_cost("premium", catalog, 1000, True, observed_cost_usd=0.042)
    assert cost == pytest.approx(0.042)
    assert source is CostSource.OBSERVED_API


def test_catalog_fallback_is_labelled_as_such(catalog):
    cost, source = provider_cost("premium", catalog, 1000, True)
    assert cost == pytest.approx(0.100)
    assert source is CostSource.LIST_PRICE


def test_a_failed_attempt_is_charged_when_the_provider_charges(catalog):
    cost, _ = provider_cost("premium", catalog, 1000, api_success=False)
    assert cost == pytest.approx(0.100)


def test_a_failed_attempt_is_free_when_the_provider_does_not_charge():
    catalog = EngineCatalog(
        [EnginePricing(engine="x", cost_per_attempt_usd=0.5, charges_on_failure=False)]
    )
    assert provider_cost("x", catalog, 1000, api_success=False)[0] == 0.0
    assert provider_cost("x", catalog, 1000, api_success=True)[0] == pytest.approx(0.5)


def test_session_billed_engines_scale_with_time():
    catalog = EngineCatalog(
        [EnginePricing(engine="bb", cost_per_session_second_usd=0.002)]
    )
    assert catalog.expected_attempt_cost("bb", latency_ms=10_000) == pytest.approx(0.02)


def test_local_engines_have_no_provider_cost_but_do_have_compute_cost(catalog):
    cost, source = provider_cost("local", catalog, 5000, api_success=True)
    assert cost == 0.0
    assert source is CostSource.ESTIMATE

    inputs = BenchmarkInputs(local_compute_usd_per_hour=3.6)  # $0.001/second
    assert local_compute_cost(5000, inputs) == pytest.approx(0.005)


def test_unknown_engine_raises_with_a_usable_message(catalog):
    with pytest.raises(KeyError, match="data/engines.json"):
        catalog.get("nope")


def test_shipped_prices_are_marked_unverified():
    """Guard rail: if someone marks a placeholder 'verified' without checking an
    invoice, this test is the thing that should have stopped them."""
    catalog = EngineCatalog(DEFAULT_CATALOG)
    unverified = set(catalog.unverified_engines())
    assert {"firecrawl", "browser_use", "zyte"} <= unverified
    # Local engines are modelled, not quoted, so they are legitimately verified.
    assert "http" not in unverified


def test_fixed_fees_are_excluded_from_marginal_cost():
    catalog = EngineCatalog(
        [EnginePricing(engine="x", cost_per_attempt_usd=0.01, fixed_monthly_fee_usd=500)]
    )
    assert catalog.expected_attempt_cost("x") == pytest.approx(0.01)
    assert catalog.fixed_monthly_fees(["x"]) == pytest.approx(500)


def test_volume_model_applies_fixed_fees_once_per_month():
    model = VolumeModel(
        jobs_per_month=1_000_000,
        baseline_cost_per_correct=0.010,
        candidate_cost_per_correct=0.006,
        candidate_fixed_monthly_usd=2_000.0,
        correct_rate=0.95,
    )
    assert model.monthly_baseline_usd() == pytest.approx(9_500.0)
    assert model.monthly_candidate_usd() == pytest.approx(7_700.0)
    assert model.monthly_savings_usd() == pytest.approx(1_800.0)


def test_a_fixed_fee_can_erase_a_marginal_saving():
    """20% off a small workload is not a business (manual section 14)."""
    model = VolumeModel(
        jobs_per_month=10_000,
        baseline_cost_per_correct=0.010,
        candidate_cost_per_correct=0.008,
        candidate_fixed_monthly_usd=500.0,
    )
    assert model.monthly_savings_usd() < 0


def test_catalog_round_trips_through_json(tmp_path):
    path = tmp_path / "engines.json"
    EngineCatalog(DEFAULT_CATALOG).save(path)
    reloaded = EngineCatalog.load(path)
    assert set(reloaded.names()) == {e.engine for e in DEFAULT_CATALOG}
    assert reloaded.get("firecrawl").price_verified is False
