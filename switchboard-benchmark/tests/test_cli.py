"""CLI smoke tests.

Run as a subprocess against a throwaway data directory, so these exercise the
real argument parsing and the real file layout without touching the repo's own
data/ or reports/.
"""

from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent


@pytest.fixture
def cli(tmp_path):
    env = dict(os.environ)
    env["SWITCHBOARD_DATA_DIR"] = str(tmp_path / "data")
    env["SWITCHBOARD_REPORTS_DIR"] = str(tmp_path / "reports")
    env["PYTHONPATH"] = str(REPO)
    env.pop("FIRECRAWL_API_KEY", None)
    env.pop("BROWSER_USE_API_KEY", None)

    def run(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, "-m", "src.benchmark", *args],
            cwd=REPO,
            env=env,
            capture_output=True,
            text=True,
        )

    run.data_dir = tmp_path / "data"  # type: ignore[attr-defined]
    run.reports_dir = tmp_path / "reports"  # type: ignore[attr-defined]
    return run


def test_init_creates_the_full_skeleton(cli):
    result = cli("init")
    assert result.returncode == 0, result.stderr

    data = cli.data_dir
    assert (data / "inputs.json").exists()
    assert (data / "engines.json").exists()
    assert (data / "tasks.csv").exists()
    assert (data / "gold_review.csv").exists()

    rows = list(csv.DictReader((data / "tasks.csv").open()))
    assert len(rows) == 100
    assert sum(1 for r in rows if r["split"] == "Holdout") == 25


def test_init_does_not_clobber_an_existing_registry(cli):
    cli("init")
    (cli.data_dir / "tasks.csv").write_text("task_id\nMINE\n")
    cli("init")
    assert (cli.data_dir / "tasks.csv").read_text() == "task_id\nMINE\n"


def test_doctor_reports_engines_and_flags_placeholder_prices(cli):
    cli("init")
    result = cli("doctor")

    assert result.returncode == 0, result.stderr
    assert "firecrawl" in result.stdout
    assert "FIRECRAWL_API_KEY is not set" in result.stdout
    assert "PLACEHOLDER PRICE" in result.stdout
    assert "reconcile it against a provider invoice" in result.stdout


def test_run_refuses_to_use_unapproved_gold(cli):
    cli("init")
    result = cli("run", "--strategy", "single:http")

    assert result.returncode == 1
    assert "gold-approved" in result.stderr


def test_holdout_refuses_without_results(cli):
    cli("init")
    result = cli("holdout")

    assert result.returncode == 1
    assert "missing holdout results" in result.stderr


def test_freeze_policy_refuses_without_train_data(cli):
    cli("init")
    result = cli("freeze-policy")

    assert result.returncode == 1
    assert "no RunLog" in result.stderr


def test_dry_run_prints_a_plan_without_executing(cli):
    cli("init")
    _approve_one_task(cli.data_dir / "tasks.csv")

    result = cli("run", "--strategy", "cheapest_first", "--dry-run")

    assert result.returncode == 0, result.stderr
    assert "cheapest eligible engine" in result.stdout
    assert not (cli.data_dir / "run_log.csv").exists()


def test_summarize_requires_a_run_log(cli):
    cli("init")
    result = cli("summarize")
    assert result.returncode == 1
    assert "empty" in result.stderr


def _approve_one_task(path: Path) -> None:
    rows = list(csv.DictReader(path.open()))
    rows[0].update(
        {
            "domain": "example.com",
            "url": "https://example.com/p/1",
            "instruction": "Get the price.",
            "expected_json": json.dumps({"price": 19.99}),
            "output_schema": json.dumps({"price": "number"}),
            "selectors": json.dumps({"price": "span.price"}),
            "gold_approved": "Y",
        }
    )
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
