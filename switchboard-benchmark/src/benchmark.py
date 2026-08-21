"""Command line entry point.

    python -m src.benchmark init            # inputs, engine catalog, task skeleton
    python -m src.benchmark doctor          # what is configured, what is guessed
    python -m src.benchmark run --strategy single:http --split Train
    python -m src.benchmark summarize       # rebuild JobSummary + reconcile
    python -m src.benchmark freeze-policy   # fit heuristic rules on Train, freeze
    python -m src.benchmark holdout         # formal comparison + decision memo

The order is the manual's order, and the commands refuse to skip it: `holdout`
will not run without a frozen policy, and `run` will not touch unapproved gold.
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional, Sequence

from dotenv import load_dotenv

from .config import (
    FROZEN_POLICY_JSON,
    GOLD_REVIEW_CSV,
    JOB_SUMMARY_CSV,
    REPORTS_DIR,
    RUN_LOG_CSV,
    TASKS_CSV,
    BenchmarkInputs,
    GateThresholds,
)
from .economics import (
    RunLogWriter,
    build_job_summaries,
    load_run_log,
    reconcile,
    strategies_in,
    summarize_by_bucket,
    summarize_strategy,
    write_job_summaries,
)
from .engines import ENGINE_CLASSES, build_engines
from .gates import evaluate_gates, render_decision_memo, write_decision_memo
from .pricing import EngineCatalog
from .router import RouterPolicy, build_strategy
from .runner import JobRunner, new_run_id
from .schemas import Split, StrategySummary
from .tasks import (
    apply_gold_review,
    load_tasks,
    save_tasks,
    seed_candidate_tasks,
    write_gold_review,
)


# --------------------------------------------------------------------------
# Output helpers
# --------------------------------------------------------------------------


def _fmt_money(value: Optional[float]) -> str:
    return "n/a" if value is None else f"${value:.6f}"


def print_summary_table(summaries: Sequence[StrategySummary], title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))
    header = (
        f"{'strategy':<24} {'jobs':>5} {'correct%':>9} {'cost':>12} "
        f"{'cost/correct':>14} {'att':>5} {'p95 ms':>9} {'sla%':>7}"
    )
    print(header)
    print("-" * len(header))
    for s in summaries:
        print(
            f"{s.strategy:<24} {s.jobs:>5} {s.correct_pct:>8.1f}% "
            f"{s.total_cost_usd:>12.6f} {_fmt_money(s.cost_per_correct_usd):>14} "
            f"{s.avg_attempts:>5.2f} {s.p95_latency_ms:>9.0f} {s.sla_met_pct:>6.1f}%"
        )
    print()


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def cmd_init(args: argparse.Namespace) -> int:
    inputs = BenchmarkInputs.load()
    inputs.save()
    print(f"wrote {inputs.save()}")

    catalog = EngineCatalog.load()
    print(f"wrote {catalog.save()}")

    if TASKS_CSV.exists() and not args.force:
        print(f"{TASKS_CSV} already exists; pass --force to overwrite the skeleton")
    else:
        tasks = seed_candidate_tasks()
        save_tasks(tasks)
        write_gold_review(tasks)
        print(f"wrote {TASKS_CSV} ({len(tasks)} candidate rows, 75 Train / 25 Holdout)")
        print(f"wrote {GOLD_REVIEW_CSV} (fill url/instruction/gold, then approve)")

    print(
        "\nNext: fill in 10 tasks by hand (5 static, 3 JS-heavy, 2 structured), "
        "approve them, then\n  python -m src.benchmark run --strategy single:http"
    )
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    inputs = BenchmarkInputs.load()
    catalog = EngineCatalog.load()
    engines = build_engines(inputs, catalog)

    print("Engines")
    print("-------")
    for name, engine in engines.items():
        available, why = engine.is_available()
        pricing = catalog.get(name)
        flag = "ok " if available else "OFF"
        price = (
            "local compute"
            if pricing.is_local
            else f"${pricing.cost_per_attempt_usd:.6f}/attempt"
        )
        verified = "verified" if pricing.price_verified else "PLACEHOLDER PRICE"
        print(f"  [{flag}] {name:<14} {price:<22} {verified}" + (f"  -- {why}" if why else ""))

    missing_adapter = [n for n in catalog.names() if n not in ENGINE_CLASSES]
    if missing_adapter:
        print(f"\n  catalog entries with no adapter: {', '.join(missing_adapter)}")

    all_tasks = load_tasks(approved_only=False)
    approved = [t for t in all_tasks if t.gold_approved]
    print("\nTasks")
    print("-----")
    print(f"  {len(all_tasks)} rows, {len(approved)} gold-approved")
    for split in (Split.TRAIN, Split.HOLDOUT):
        n = sum(1 for t in approved if t.split == split)
        print(f"  {split.value}: {n} approved")

    print("\nInputs")
    print("------")
    print(f"  validation threshold      {inputs.validation_threshold}")
    print(f"  quality floor             {inputs.quality_floor_correct_pct}%")
    print(f"  min cost savings          {inputs.min_cost_savings_pct}%")
    print(f"  jobs/month for scaling    {inputs.jobs_per_month:,}")
    print(f"  robots.txt respected      {inputs.respect_robots}")
    print(f"  domain delay              {inputs.min_domain_delay_s}-{inputs.max_domain_delay_s}s")

    print(f"\n  frozen policy: {'yes' if FROZEN_POLICY_JSON.exists() else 'no'}")

    unverified = catalog.unverified_engines()
    if unverified:
        print(
            "\nWARNING: placeholder prices for "
            + ", ".join(unverified)
            + "\n  Any savings number derived from these is a guess until you"
            "\n  reconcile it against a provider invoice (manual section 9)."
        )
    return 0


def cmd_apply_gold(args: argparse.Namespace) -> int:
    tasks = load_tasks(approved_only=False)
    if not tasks:
        print(f"no tasks in {TASKS_CSV}; run `init` first", file=sys.stderr)
        return 1
    tasks, approved = apply_gold_review(tasks)
    save_tasks(tasks)
    print(f"approved {approved} task(s); wrote {TASKS_CSV}")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    inputs = BenchmarkInputs.load()
    catalog = EngineCatalog.load()

    split = Split(args.split) if args.split else None
    tasks = load_tasks(approved_only=True, split=split)
    if args.limit:
        tasks = tasks[: args.limit]
    if not tasks:
        print(
            "no gold-approved tasks match. Approve tasks before running a formal "
            "benchmark (manual section 8).",
            file=sys.stderr,
        )
        return 1

    engine_names = args.engines.split(",") if args.engines else None
    engines = build_engines(inputs, catalog, engine_names)

    policy = RouterPolicy.load() if args.strategy == "heuristic" else None
    strategy = build_strategy(
        args.strategy, policy=policy, require_frozen=split is Split.HOLDOUT
    )

    unverified = catalog.unverified_engines()
    if unverified:
        print(f"NOTE: placeholder prices in use for {', '.join(unverified)}\n")

    if args.dry_run:
        print(f"Plan for strategy {strategy.name} over {len(tasks)} task(s):\n")
        for task in tasks:
            print(f"  {task.task_id} [{task.bucket.value}]")
            for hop, route in enumerate(strategy.plan(task, engines, catalog), start=1):
                print(f"    {hop}. {route.engine:<14} {route.reason}")
        return 0

    run_id = args.run_id or new_run_id()
    runner = JobRunner(inputs, catalog, engines, run_id=run_id, writer=RunLogWriter())
    print(f"run_id={run_id}  strategy={strategy.name}  tasks={len(tasks)}")

    attempts = []
    for index, task in enumerate(tasks, start=1):
        rows = runner.run_job(task, strategy)
        attempts.extend(rows)
        won = next((r for r in rows if r.validated_correct), None)
        cost = sum(r.total_attempt_cost_usd for r in rows)
        status = f"OK via {won.engine}" if won else "FAILED"
        print(
            f"  [{index:>3}/{len(tasks)}] {task.task_id:<10} {status:<22} "
            f"{len(rows)} attempt(s)  ${cost:.6f}"
        )

    print(f"\nappended {len(attempts)} attempt row(s) to {RUN_LOG_CSV}")
    print("next: python -m src.benchmark summarize")
    return 0


def cmd_summarize(args: argparse.Namespace) -> int:
    attempts = load_run_log()
    if not attempts:
        print(f"{RUN_LOG_CSV} is empty; run a benchmark first", file=sys.stderr)
        return 1

    tasks = {t.task_id: t for t in load_tasks(approved_only=False)}
    jobs = build_job_summaries(attempts, tasks)
    write_job_summaries(jobs)
    print(f"wrote {JOB_SUMMARY_CSV} ({len(jobs)} job rows from {len(attempts)} attempts)")

    problems = reconcile(attempts, jobs)
    if problems:
        print("\nRECONCILIATION FAILED -- do not trust these economics:")
        for problem in problems[:20]:
            print(f"  {problem}")
        if len(problems) > 20:
            print(f"  ... and {len(problems) - 20} more")
        return 2
    print("reconciliation clean: every job total equals the sum of its RunLog attempts")

    for split in (None, "Train", "Holdout"):
        rows = [
            summarize_strategy(jobs, strategy, split=split)
            for strategy in strategies_in(jobs)
        ]
        rows = [r for r in rows if r.jobs]
        if rows:
            print_summary_table(rows, f"Strategy economics ({split or 'all splits'})")

    if args.by_bucket:
        for strategy in strategies_in(jobs):
            rows = [s for s in summarize_by_bucket(jobs, strategy) if s.jobs]
            if rows:
                print(f"\nBucket detail: {strategy}")
                for s in rows:
                    print(
                        f"  {s.bucket:<32} {s.jobs:>3} jobs  {s.correct_pct:>6.1f}% "
                        f"correct  {_fmt_money(s.cost_per_correct_usd)}/correct"
                    )
    return 0


def cmd_freeze_policy(args: argparse.Namespace) -> int:
    attempts = load_run_log()
    tasks = {t.task_id: t for t in load_tasks(approved_only=False)}
    if not attempts:
        print("no RunLog to fit a policy from", file=sys.stderr)
        return 1

    policy = RouterPolicy.build(attempts, tasks)
    if policy.train_attempts == 0:
        print(
            "no Train attempts in the RunLog. Router rules must be designed on "
            "Train data only (manual section 13).",
            file=sys.stderr,
        )
        return 1

    if FROZEN_POLICY_JSON.exists() and not args.force:
        print(
            f"{FROZEN_POLICY_JSON} already exists. Re-freezing after seeing holdout "
            "results invalidates the holdout -- pass --force only if you are also "
            "creating a new holdout set.",
            file=sys.stderr,
        )
        return 1

    path = policy.freeze()
    print(f"froze heuristic policy at {path}")
    print(f"  fitted on {policy.train_attempts} Train attempts")
    print(f"  engines with evidence: {', '.join(sorted(policy.priors.overall))}")
    return 0


def cmd_holdout(args: argparse.Namespace) -> int:
    inputs = BenchmarkInputs.load()
    catalog = EngineCatalog.load()
    thresholds = GateThresholds.from_inputs(inputs)

    attempts = load_run_log()
    tasks = {t.task_id: t for t in load_tasks(approved_only=False)}
    jobs = build_job_summaries(attempts, tasks)

    baseline_name = args.baseline or inputs.selected_baseline
    candidate_name = args.candidate or inputs.selected_candidate

    baseline = summarize_strategy(jobs, baseline_name, split="Holdout")
    candidate = summarize_strategy(jobs, candidate_name, split="Holdout")

    if not baseline.jobs or not candidate.jobs:
        print(
            f"missing holdout results: baseline `{baseline_name}` has {baseline.jobs} "
            f"jobs, candidate `{candidate_name}` has {candidate.jobs}. Run both over "
            "--split Holdout first.",
            file=sys.stderr,
        )
        return 1

    problems = reconcile(attempts, jobs)
    if problems:
        print(
            f"RECONCILIATION FAILED ({len(problems)} problems). Fix the accounting "
            "before reading a verdict.",
            file=sys.stderr,
        )
        return 2

    result = evaluate_gates(
        baseline,
        candidate,
        thresholds,
        max_reliability_cost_multiple=args.reliability_cost_multiple,
        unverified_engines=catalog.unverified_engines(),
    )

    print_summary_table([baseline, candidate], "Holdout comparison")
    print(f"VERDICT: {result.verdict.value} -- {result.headline}")
    for reason in result.reasons:
        print(f"  - {reason}")
    for warning in result.warnings:
        print(f"  ! {warning}")

    memo = render_decision_memo(
        result,
        baseline_buckets=summarize_by_bucket(jobs, baseline_name, split="Holdout"),
        candidate_buckets=summarize_by_bucket(jobs, candidate_name, split="Holdout"),
        external_router_notes=args.external_router_notes,
        next_test=args.next_test,
    )
    path = write_decision_memo(memo, REPORTS_DIR / "decision_memo.md")
    print(f"\nwrote {path}")
    return 0


def cmd_reconcile(args: argparse.Namespace) -> int:
    attempts = load_run_log()
    tasks = {t.task_id: t for t in load_tasks(approved_only=False)}
    jobs = build_job_summaries(attempts, tasks)
    problems = reconcile(attempts, jobs)
    if problems:
        print(f"{len(problems)} problem(s):")
        for problem in problems:
            print(f"  {problem}")
        return 2
    print(f"clean: {len(jobs)} jobs reconcile against {len(attempts)} attempts")
    return 0


# --------------------------------------------------------------------------
# Parser
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="switchboard",
        description="Economics-first extraction benchmark and router.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="write inputs, engine catalog and task skeleton")
    p_init.add_argument("--force", action="store_true", help="overwrite data/tasks.csv")
    p_init.set_defaults(func=cmd_init)

    p_doctor = sub.add_parser("doctor", help="show what is configured and what is guessed")
    p_doctor.set_defaults(func=cmd_doctor)

    p_gold = sub.add_parser("apply-gold", help="fold data/gold_review.csv into tasks.csv")
    p_gold.set_defaults(func=cmd_apply_gold)

    p_run = sub.add_parser("run", help="run one strategy over the task set")
    p_run.add_argument("--strategy", required=True, help="single:<engine>|cheapest_first|heuristic")
    p_run.add_argument("--split", choices=[s.value for s in Split])
    p_run.add_argument("--limit", type=int, help="only the first N tasks")
    p_run.add_argument("--engines", help="comma-separated subset of adapters to enable")
    p_run.add_argument("--run-id", help="reuse an existing run id")
    p_run.add_argument("--dry-run", action="store_true", help="print the plan, execute nothing")
    p_run.set_defaults(func=cmd_run)

    p_sum = sub.add_parser("summarize", help="rebuild JobSummary and reconcile totals")
    p_sum.add_argument("--by-bucket", action="store_true")
    p_sum.set_defaults(func=cmd_summarize)

    p_freeze = sub.add_parser("freeze-policy", help="fit heuristic rules on Train and freeze")
    p_freeze.add_argument("--force", action="store_true")
    p_freeze.set_defaults(func=cmd_freeze_policy)

    p_hold = sub.add_parser("holdout", help="formal comparison and decision memo")
    p_hold.add_argument("--baseline", help="defaults to inputs.selected_baseline")
    p_hold.add_argument("--candidate", help="defaults to inputs.selected_candidate")
    p_hold.add_argument(
        "--reliability-cost-multiple",
        type=float,
        default=2.0,
        help="max candidate cost/correct as a multiple of baseline for a reliability-led win",
    )
    p_hold.add_argument("--external-router-notes", default="not yet benchmarked")
    p_hold.add_argument("--next-test", default="")
    p_hold.set_defaults(func=cmd_holdout)

    p_rec = sub.add_parser("reconcile", help="check JobSummary against RunLog")
    p_rec.set_defaults(func=cmd_reconcile)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    load_dotenv()
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
