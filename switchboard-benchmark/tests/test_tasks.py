"""The task registry and the gold-approval gate."""

from __future__ import annotations

import csv

import pytest

from src.schemas import Bucket, Split, TaskSpec
from src.tasks import (
    BUCKET_PLAN,
    apply_gold_review,
    load_tasks,
    save_tasks,
    seed_candidate_tasks,
    write_gold_review,
)


def test_seed_matches_appendix_c(tmp_path):
    tasks = seed_candidate_tasks()
    assert len(tasks) == 100
    assert sum(1 for t in tasks if t.split is Split.TRAIN) == 75
    assert sum(1 for t in tasks if t.split is Split.HOLDOUT) == 25

    for bucket, train_n, holdout_n in BUCKET_PLAN:
        rows = [t for t in tasks if t.bucket is bucket]
        assert len(rows) == train_n + holdout_n
        assert sum(1 for t in rows if t.split is Split.TRAIN) == train_n


def test_seeded_rows_carry_no_gold(tmp_path):
    """A generated gold answer is not a gold answer."""
    tasks = seed_candidate_tasks()
    assert all(t.expected_json is None for t in tasks)
    assert all(not t.gold_approved for t in tasks)


def test_csv_round_trip(tmp_path):
    path = tmp_path / "tasks.csv"
    original = TaskSpec(
        task_id="STA-001",
        split=Split.HOLDOUT,
        bucket=Bucket.STATIC_HTML,
        domain="example.com",
        url="https://example.com/p/1",
        instruction="Get the price.",
        expected_json={"price": 19.99},
        output_schema={"price": "number"},
        selectors={"price": "span.price"},
        allowed_engines=["http", "firecrawl"],
        gold_approved=True,
        required_rows=10,
        notes="steps: click:button.more",
    )
    save_tasks([original], path)

    loaded = load_tasks(path)
    assert len(loaded) == 1
    assert loaded[0] == original


def test_load_excludes_unapproved_rows_by_default(tmp_path):
    path = tmp_path / "tasks.csv"
    approved = TaskSpec(
        task_id="A", bucket=Bucket.STATIC_HTML, domain="d", url="u",
        instruction="i", expected_json={"a": 1}, gold_approved=True,
    )
    pending = TaskSpec(
        task_id="B", bucket=Bucket.STATIC_HTML, domain="d", url="u",
        instruction="i", gold_approved=False,
    )
    save_tasks([approved, pending], path)

    assert [t.task_id for t in load_tasks(path)] == ["A"]
    assert len(load_tasks(path, approved_only=False)) == 2


def test_load_can_filter_by_split(tmp_path):
    path = tmp_path / "tasks.csv"
    save_tasks(
        [
            TaskSpec(task_id="A", split=Split.TRAIN, bucket=Bucket.STATIC_HTML,
                     domain="d", url="u", instruction="i", expected_json={"a": 1},
                     gold_approved=True),
            TaskSpec(task_id="B", split=Split.HOLDOUT, bucket=Bucket.STATIC_HTML,
                     domain="d", url="u", instruction="i", expected_json={"a": 1},
                     gold_approved=True),
        ],
        path,
    )
    assert [t.task_id for t in load_tasks(path, split=Split.HOLDOUT)] == ["B"]


def test_workbook_style_headers_are_accepted(tmp_path):
    """A sheet exported with the manual's Title_Case headers must load."""
    path = tmp_path / "tasks.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            ["Task_ID", "Split", "Bucket", "Domain", "URL", "Instruction",
             "Expected_JSON/Gold", "Requires_JS", "Gold_Approved", "SLA"]
        )
        writer.writerow(
            ["STA-001", "Train", "Static HTML", "example.com", "https://example.com",
             "Get the price.", '{"price": 19.99}', "Y", "Y", "9000"]
        )

    tasks = load_tasks(path)
    assert tasks[0].task_id == "STA-001"
    assert tasks[0].expected_json == {"price": 19.99}
    assert tasks[0].requires_js is True
    assert tasks[0].sla_max_latency_ms == 9000


def test_a_bad_row_names_its_line_number(tmp_path):
    path = tmp_path / "tasks.csv"
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["Task_ID", "Bucket", "Domain", "URL", "Instruction"])
        writer.writerow(["STA-001", "Not A Bucket", "example.com", "u", "i"])

    with pytest.raises(ValueError, match=r"tasks\.csv:2"):
        load_tasks(path, approved_only=False)


def test_gold_review_queue_lists_only_unapproved(tmp_path):
    review = tmp_path / "gold_review.csv"
    tasks = [
        TaskSpec(task_id="A", bucket=Bucket.STATIC_HTML, domain="d", url="u",
                 instruction="i", expected_json={"a": 1}, gold_approved=True),
        TaskSpec(task_id="B", bucket=Bucket.STATIC_HTML, domain="d", url="u",
                 instruction="i"),
    ]
    write_gold_review(tasks, review)

    rows = list(csv.DictReader(review.open()))
    assert [r["task_id"] for r in rows] == ["B"]


def test_apply_gold_review_approves_and_attaches_gold(tmp_path):
    review = tmp_path / "gold_review.csv"
    tasks = [
        TaskSpec(task_id="B", bucket=Bucket.STATIC_HTML, domain="d", url="u", instruction="i")
    ]
    write_gold_review(tasks, review)

    rows = list(csv.DictReader(review.open()))
    rows[0]["proposed_gold_json"] = '{"price": 19.99}'
    rows[0]["approve_y_n"] = "Y"
    with review.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    updated, approved = apply_gold_review(tasks, review)
    assert approved == 1
    assert updated[0].gold_approved is True
    assert updated[0].expected_json == {"price": 19.99}


def test_approving_a_row_with_no_gold_is_refused(tmp_path):
    review = tmp_path / "gold_review.csv"
    tasks = [
        TaskSpec(task_id="B", bucket=Bucket.STATIC_HTML, domain="d", url="u", instruction="i")
    ]
    write_gold_review(tasks, review)

    rows = list(csv.DictReader(review.open()))
    rows[0]["approve_y_n"] = "Y"  # approved, but no gold answer supplied
    with review.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    with pytest.raises(ValueError, match="no gold answer"):
        apply_gold_review(tasks, review)


def test_approving_a_row_with_no_url_is_refused(tmp_path):
    """A candidate skeleton must be filled in before it can be approved."""
    review = tmp_path / "gold_review.csv"
    tasks = seed_candidate_tasks()[:1]
    write_gold_review(tasks, review)

    rows = list(csv.DictReader(review.open()))
    rows[0]["proposed_gold_json"] = '{"price": 19.99}'
    rows[0]["approve_y_n"] = "Y"
    with review.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    with pytest.raises(ValueError, match="no URL or instruction"):
        apply_gold_review(tasks, review)


def test_review_can_fill_in_url_and_instruction(tmp_path):
    review = tmp_path / "gold_review.csv"
    tasks = seed_candidate_tasks()[:1]
    write_gold_review(tasks, review)

    rows = list(csv.DictReader(review.open()))
    rows[0].update(
        {
            "url": "https://example.com/p/1",
            "instruction": "Get the price.",
            "proposed_gold_json": '{"price": 19.99}',
            "approve_y_n": "Y",
        }
    )
    with review.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    updated, approved = apply_gold_review(tasks, review)
    assert approved == 1
    assert updated[0].url == "https://example.com/p/1"
    assert updated[0].domain == "example.com"  # derived from the URL
