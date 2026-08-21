"""Benchmark safety rules (manual section 3), enforced in code.

Politeness is not a per-engine detail. Every engine that touches a public site
goes through `SafetyGate` first, so no adapter can quietly become the impolite
one. Blocks (403) and rate limits (429) are recorded as outcomes -- there is no
bypass path in this codebase, by design.
"""

from __future__ import annotations

import random
import threading
import time
import urllib.robotparser
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

import httpx

from .config import BenchmarkInputs

#: Status codes that mean "the site declined", never "try harder".
BLOCKED_STATUS = 403
RATE_LIMITED_STATUS = 429


def domain_of(url: str) -> str:
    return (urlparse(url).netloc or "").casefold()


@dataclass
class RobotsCache:
    """One robots.txt fetch per host, reused for the whole run.

    A host whose robots.txt cannot be fetched is treated as allowed -- that is
    the documented convention -- but a 401/403 on robots.txt itself is treated
    as a full disallow.
    """

    user_agent: str
    timeout_s: float = 10.0
    _parsers: dict[str, Optional[urllib.robotparser.RobotFileParser]] = field(
        default_factory=dict
    )
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def _parser_for(self, url: str) -> Optional[urllib.robotparser.RobotFileParser]:
        parts = urlparse(url)
        host_key = f"{parts.scheme}://{parts.netloc}"
        with self._lock:
            if host_key in self._parsers:
                return self._parsers[host_key]

        parser: Optional[urllib.robotparser.RobotFileParser]
        try:
            resp = httpx.get(
                f"{host_key}/robots.txt",
                timeout=self.timeout_s,
                headers={"User-Agent": self.user_agent},
                follow_redirects=True,
            )
            if resp.status_code in (401, 403):
                parser = urllib.robotparser.RobotFileParser()
                parser.disallow_all = True
            elif resp.status_code >= 400:
                parser = None  # no robots.txt published
            else:
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(resp.text.splitlines())
        except httpx.HTTPError:
            parser = None

        with self._lock:
            self._parsers[host_key] = parser
        return parser

    def allowed(self, url: str) -> bool:
        parser = self._parser_for(url)
        if parser is None:
            return True
        return parser.can_fetch(self.user_agent, url)

    def crawl_delay(self, url: str) -> Optional[float]:
        parser = self._parser_for(url)
        if parser is None:
            return None
        try:
            delay = parser.crawl_delay(self.user_agent)
        except AttributeError:
            return None
        return float(delay) if delay is not None else None


@dataclass
class DomainThrottle:
    """2-5 seconds between requests to the same public domain, per manual
    section 3, jittered so a run does not become a metronome."""

    min_delay_s: float = 2.0
    max_delay_s: float = 5.0
    _last_hit: dict[str, float] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _sleep = staticmethod(time.sleep)

    def wait(self, url: str, crawl_delay_s: Optional[float] = None) -> float:
        """Block until it is polite to hit this domain. Returns seconds slept.

        The wait is deliberately excluded from attempt latency: it is a property
        of the benchmark's manners, not of the engine's speed.
        """
        domain = domain_of(url)
        if not domain:
            return 0.0

        target = random.uniform(self.min_delay_s, self.max_delay_s)
        if crawl_delay_s is not None:
            target = max(target, crawl_delay_s)

        with self._lock:
            last = self._last_hit.get(domain)
            now = time.monotonic()
            sleep_for = 0.0 if last is None else max(0.0, target - (now - last))
            self._last_hit[domain] = now + sleep_for

        if sleep_for > 0:
            self._sleep(sleep_for)
        return sleep_for


class RobotsDisallowed(RuntimeError):
    """Raised before any request is made. Never caught into a retry."""


@dataclass
class SafetyGate:
    """Single entry point every engine calls before touching a URL."""

    inputs: BenchmarkInputs
    robots: RobotsCache = field(init=False)
    throttle: DomainThrottle = field(init=False)

    def __post_init__(self) -> None:
        self.robots = RobotsCache(user_agent=self.inputs.user_agent)
        self.throttle = DomainThrottle(
            min_delay_s=self.inputs.min_domain_delay_s,
            max_delay_s=self.inputs.max_domain_delay_s,
        )

    def before_request(self, url: str) -> None:
        crawl_delay: Optional[float] = None
        if self.inputs.respect_robots:
            if not self.robots.allowed(url):
                raise RobotsDisallowed(f"robots.txt disallows {url}")
            crawl_delay = self.robots.crawl_delay(url)
        self.throttle.wait(url, crawl_delay)

    def headers(self) -> dict[str, str]:
        return {
            "User-Agent": self.inputs.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
            "Accept-Language": "en",
        }
