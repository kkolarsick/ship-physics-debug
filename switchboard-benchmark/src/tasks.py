"""The task registry -- the code side of the workbook Tasks sheet.

Two rules the loader enforces so they cannot be forgotten under deadline:

* `load_tasks()` returns only gold-approved rows by default. An unreviewed gold
  answer must never reach a formal run.
* Train/Holdout is assigned at seed time, before any result exists, and the
  loader never reassigns it.
"""

from __future__ import annotations

import csv
import json
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Optional

from .config import GOLD_REVIEW_CSV, TASKS_CSV
from .schemas import Bucket, Split, TaskSpec

TASK_CSV_FIELDS: list[str] = list(TaskSpec.model_fields)

#: Workbook headers -> model fields, so a sheet exported in Title_Case loads.
HEADER_ALIASES = {
    "task_id": "task_id",
    "split": "split",
    "bucket": "bucket",
    "domain": "domain",
    "url": "url",
    "instruction": "instruction",
    "expected_json": "expected_json",
    "gold": "expected_json",
    "expected_json/gold": "expected_json",
    "expected_rubric": "expected_rubric",
    "output_schema": "output_schema",
    "selectors": "selectors",
    "business_value": "business_value",
    "sla": "sla_max_latency_ms",
    "sla_max_latency_ms": "sla_max_latency_ms",
    "requires_js": "requires_js",
    "requires_interaction": "requires_interaction",
    "complexity": "complexity",
    "allowed_engines": "allowed_engines",
    "gold_approved": "gold_approved",
    "freshness_max_age_days": "freshness_max_age_days",
    "required_rows": "required_rows",
    "notes": "notes",
}

_JSON_FIELDS = {"expected_json", "output_schema", "selectors"}
_LIST_FIELDS = {"allowed_engines"}
_BOOL_FIELDS = {"requires_js", "requires_interaction", "gold_approved"}
_TRUTHY = {"y", "yes", "true", "1"}


def _normalize_header(header: str) -> Optional[str]:
    key = header.strip().casefold().replace(" ", "_")
    return HEADER_ALIASES.get(key)


def _parse_cell(field: str, raw: str) -> Any:
    raw = (raw or "").strip()
    if raw == "":
        return None
    if field in _JSON_FIELDS:
        return json.loads(raw)
    if field in _LIST_FIELDS:
        return [part.strip() for part in raw.split("|") if part.strip()]
    if field in _BOOL_FIELDS:
        return raw.casefold() in _TRUTHY
    return raw


def _format_cell(field: str, value: Any) -> str:
    if value is None:
        return ""
    if field in _JSON_FIELDS:
        return json.dumps(value, ensure_ascii=False)
    if field in _LIST_FIELDS:
        return "|".join(value)
    if isinstance(value, bool):
        return "Y" if value else "N"
    if isinstance(value, Enum):
        return str(value.value)
    return str(value)


def load_tasks(
    path: Optional[Path] = None,
    *,
    approved_only: bool = True,
    split: Optional[Split] = None,
) -> list[TaskSpec]:
    """Read the registry. Unapproved rows are excluded unless you ask for them,
    which is the point -- an unreviewed gold answer is not a benchmark task."""
    path = path or TASKS_CSV
    if not path.exists():
        return []

    tasks: list[TaskSpec] = []
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for line_no, row in enumerate(reader, start=2):
            data: dict[str, Any] = {}
            for header, raw in row.items():
                field = _normalize_header(header or "")
                if field is None:
                    continue
                parsed = _parse_cell(field, raw or "")
                if parsed is not None:
                    data[field] = parsed
            try:
                tasks.append(TaskSpec(**data))
            except Exception as exc:  # noqa: BLE001 - name the offending line
                raise ValueError(f"{path}:{line_no}: invalid task row -- {exc}") from exc

    if approved_only:
        tasks = [t for t in tasks if t.gold_approved]
    if split is not None:
        tasks = [t for t in tasks if t.split == split]
    return tasks


def save_tasks(tasks: Iterable[TaskSpec], path: Optional[Path] = None) -> Path:
    path = path or TASKS_CSV
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(TASK_CSV_FIELDS)
        for task in tasks:
            row = task.model_dump()
            writer.writerow([_format_cell(f, row[f]) for f in TASK_CSV_FIELDS])
    return path


# --------------------------------------------------------------------------
# Seeding (manual Prompt 4 and Appendix C)
# --------------------------------------------------------------------------

#: Appendix C. (bucket, train, holdout) -- 75/25, assigned before any result
#: exists so the split can never be chosen to flatter the router.
BUCKET_PLAN: list[tuple[Bucket, int, int]] = [
    (Bucket.STATIC_HTML, 15, 5),
    (Bucket.JS_HEAVY, 11, 4),
    (Bucket.DYNAMIC_TABLE, 8, 2),
    (Bucket.INFINITE_SCROLL, 8, 2),
    (Bucket.INTERACTION_HEAVY, 7, 3),
    (Bucket.STRUCTURED_EXTRACTION, 11, 4),
    (Bucket.PDF_DOCUMENT, 8, 2),
    (Bucket.AMBIGUOUS_MIXED, 7, 3),
]

_BUCKET_CODES = {
    Bucket.STATIC_HTML: "STA",
    Bucket.JS_HEAVY: "JSH",
    Bucket.DYNAMIC_TABLE: "TAB",
    Bucket.INFINITE_SCROLL: "SCR",
    Bucket.INTERACTION_HEAVY: "INT",
    Bucket.STRUCTURED_EXTRACTION: "STR",
    Bucket.PDF_DOCUMENT: "PDF",
    Bucket.AMBIGUOUS_MIXED: "AMB",
}


def seed_candidate_tasks() -> list[TaskSpec]:
    """Generate the 100-row skeleton: buckets and splits filled, gold empty.

    URL, instruction and gold are left blank on purpose. A generated gold answer
    is not a gold answer, and a benchmark built on invented expectations
    measures nothing.
    """
    tasks: list[TaskSpec] = []
    for bucket, train_n, holdout_n in BUCKET_PLAN:
        code = _BUCKET_CODES[bucket]
        for index in range(1, train_n + holdout_n + 1):
            split = Split.TRAIN if index <= train_n else Split.HOLDOUT
            tasks.append(
                TaskSpec(
                    task_id=f"{code}-{index:03d}",
                    split=split,
                    bucket=bucket,
                    domain="",
                    url="",
                    instruction="",
                    requires_js=bucket
                    in (Bucket.JS_HEAVY, Bucket.INFINITE_SCROLL, Bucket.INTERACTION_HEAVY),
                    requires_interaction=bucket
                    in (Bucket.INTERACTION_HEAVY, Bucket.INFINITE_SCROLL),
                    complexity=_default_complexity(bucket),
                    gold_approved=False,
                    notes="candidate row -- fill url/instruction/gold, then review",
                )
            )
    return tasks


def _default_complexity(bucket: Bucket) -> int:
    return {
        Bucket.STATIC_HTML: 1,
        Bucket.STRUCTURED_EXTRACTION: 2,
        Bucket.JS_HEAVY: 3,
        Bucket.DYNAMIC_TABLE: 3,
        Bucket.PDF_DOCUMENT: 3,
        Bucket.INFINITE_SCROLL: 4,
        Bucket.AMBIGUOUS_MIXED: 4,
        Bucket.INTERACTION_HEAVY: 5,
    }[bucket]


def write_gold_review(
    tasks: Iterable[TaskSpec], path: Optional[Path] = None
) -> Path:
    """The manual review queue. Set Approve to Y only after reading the page."""
    path = path or GOLD_REVIEW_CSV
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "task_id",
                "split",
                "bucket",
                "url",
                "instruction",
                "proposed_gold_json",
                "reviewer_notes",
                "approve_y_n",
            ]
        )
        for task in tasks:
            if task.gold_approved:
                continue
            writer.writerow(
                [
                    task.task_id,
                    task.split.value,
                    task.bucket.value,
                    task.url,
                    task.instruction,
                    json.dumps(task.expected_json, ensure_ascii=False)
                    if task.expected_json
                    else "",
                    "",
                    "N",
                ]
            )
    return path


def apply_gold_review(
    tasks: list[TaskSpec], review_path: Optional[Path] = None
) -> tuple[list[TaskSpec], int]:
    """Fold an approved review file back into the registry.

    Approval is the freeze: once a row comes back Y, its gold answer should not
    change without a new task id.
    """
    review_path = review_path or GOLD_REVIEW_CSV
    if not review_path.exists():
        raise FileNotFoundError(f"no gold review file at {review_path}")

    by_id = {t.task_id: t for t in tasks}
    approved = 0
    with review_path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            task = by_id.get((row.get("task_id") or "").strip())
            if task is None:
                continue
            gold_raw = (row.get("proposed_gold_json") or "").strip()
            if gold_raw:
                task.expected_json = json.loads(gold_raw)
            notes = (row.get("reviewer_notes") or "").strip()
            if notes:
                task.notes = notes
            for field in ("url", "instruction", "domain"):
                value = (row.get(field) or "").strip()
                if value:
                    setattr(task, field, value)
            if not task.domain and task.url:
                from urllib.parse import urlparse

                task.domain = urlparse(task.url).netloc

            if (row.get("approve_y_n") or "").strip().casefold() in _TRUTHY:
                if not task.expected_json and not task.expected_rubric:
                    raise ValueError(
                        f"{task.task_id} approved with no gold answer or rubric"
                    )
                if not task.url or not task.instruction:
                    raise ValueError(
                        f"{task.task_id} approved with no URL or instruction"
                    )
                task.gold_approved = True
                approved += 1
    return list(by_id.values()), approved
