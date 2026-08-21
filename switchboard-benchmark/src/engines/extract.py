"""Deterministic selector extraction shared by the local engines.

The primitive engines are not allowed to guess. They read the task's
`selectors` map and produce exactly the declared `output_schema`, so a failure
means "this engine could not get the data", never "this engine hallucinated
something plausible".

Selector grammar (deliberately tiny):

    "h1.title"                first match, text content
    "a.perma@href"            first match, attribute value
    "table tbody tr td::all"  every match, list of text
    "img.thumb::all@src"      every match, list of attribute values
"""

from __future__ import annotations

import re
from typing import Any, Optional

from bs4 import BeautifulSoup

from ..validate import parse_number

_ALL_MARKER = "::all"
_WS = re.compile(r"\s+")


def parse_selector(spec: str) -> tuple[str, bool, Optional[str]]:
    """'a.x::all@href' -> ('a.x', True, 'href')."""
    css = spec.strip()
    attr: Optional[str] = None
    if "@" in css:
        css, attr = css.rsplit("@", 1)
        attr = attr.strip() or None
    take_all = _ALL_MARKER in css
    css = css.replace(_ALL_MARKER, "").strip()
    if not css:
        raise ValueError(f"selector {spec!r} has no CSS part")
    return css, take_all, attr


def _node_value(node: Any, attr: Optional[str]) -> Optional[str]:
    if attr is not None:
        value = node.get(attr)
        if isinstance(value, list):  # e.g. class="a b"
            value = " ".join(value)
        return value
    return _WS.sub(" ", node.get_text(" ", strip=True)).strip()


def coerce(value: Any, declared: Optional[str]) -> Any:
    """Cast a scraped string to the declared schema type where that is
    unambiguous. Anything ambiguous is left as text for validation to judge."""
    if value is None or declared is None:
        return value
    kind = declared.lower()
    if isinstance(value, list):
        return [coerce(item, kind) for item in value]
    if kind in ("number", "integer"):
        number = parse_number(value)
        if number is None:
            return value
        return int(number) if kind == "integer" and float(number).is_integer() else number
    if kind == "boolean" and isinstance(value, str):
        low = value.strip().casefold()
        if low in {"true", "yes", "y", "1"}:
            return True
        if low in {"false", "no", "n", "0"}:
            return False
    return value


def extract_from_html(
    html: str,
    selectors: dict[str, str],
    output_schema: Optional[dict[str, str]] = None,
    *,
    parser: str = "lxml",
) -> dict[str, Any]:
    """Apply the selector map to a document. Fields that match nothing are
    returned as None so the schema check can see the hole."""
    output_schema = output_schema or {}
    soup = BeautifulSoup(html, parser)
    result: dict[str, Any] = {}

    for field, spec in selectors.items():
        css, take_all, attr = parse_selector(spec)
        nodes = soup.select(css)
        if take_all:
            values = [_node_value(n, attr) for n in nodes]
            result[field] = [v for v in values if v not in (None, "")]
        else:
            result[field] = _node_value(nodes[0], attr) if nodes else None
        result[field] = coerce(result[field], output_schema.get(field))

    return result


def has_extraction(result: dict[str, Any]) -> bool:
    """At least one field actually produced something. An all-None dict is a
    failed attempt, not a cheap success."""
    for value in result.values():
        if isinstance(value, list):
            if value:
                return True
        elif value not in (None, ""):
            return True
    return False
