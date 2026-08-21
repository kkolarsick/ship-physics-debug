"""Engine registry.

Adding a provider means: write the adapter, register it here, and add a pricing
row in `pricing.DEFAULT_CATALOG` (or data/engines.json). The router picks it up
automatically -- there is no separate list of routes to keep in sync.
"""

from __future__ import annotations

from typing import Optional

from ..config import BenchmarkInputs
from ..pricing import EngineCatalog
from ..safety import SafetyGate
from .base import Engine, RawResult
from .browser_use_engine import BrowserUseEngine
from .firecrawl_engine import FirecrawlEngine
from .http_engine import HttpEngine
from .playwright_engine import PlaywrightEngine

ENGINE_CLASSES: dict[str, type[Engine]] = {
    HttpEngine.name: HttpEngine,
    PlaywrightEngine.name: PlaywrightEngine,
    FirecrawlEngine.name: FirecrawlEngine,
    BrowserUseEngine.name: BrowserUseEngine,
}


def build_engines(
    inputs: BenchmarkInputs,
    catalog: EngineCatalog,
    names: Optional[list[str]] = None,
    gate: Optional[SafetyGate] = None,
) -> dict[str, Engine]:
    """Instantiate engines sharing one safety gate, so the domain throttle is
    global across the whole run rather than per engine."""
    gate = gate or SafetyGate(inputs)
    selected = names if names is not None else list(ENGINE_CLASSES)
    unknown = [n for n in selected if n not in ENGINE_CLASSES]
    if unknown:
        raise KeyError(f"no adapter registered for: {', '.join(unknown)}")
    return {name: ENGINE_CLASSES[name](inputs, catalog, gate) for name in selected}


__all__ = [
    "Engine",
    "RawResult",
    "HttpEngine",
    "PlaywrightEngine",
    "FirecrawlEngine",
    "BrowserUseEngine",
    "ENGINE_CLASSES",
    "build_engines",
]
