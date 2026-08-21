# Project Switchboard — economics-first extraction benchmark

Harness for the question in the v0.2 Operator Manual: **does cost-aware routing
materially reduce cost per validated correct result, while holding a quality and
latency floor?** If the data says no, the manual says don't build the SaaS — so
this code is built to make a "no" just as easy to read as a "yes".

The primary KPI is not success rate:

```
cost_per_validated_correct_result = total_strategy_cost / validated_correct_jobs
```

`total_strategy_cost` includes every attempt: retries, failed cheap hops, and
escalations. A later successful fallback never erases what the earlier failures
cost.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
cp .env.example .env                                  # add keys; .env is git-ignored

python -m src.benchmark init      # inputs.json, engines.json, 100-row task skeleton
python -m src.benchmark doctor    # what's configured, what's still a placeholder price
```

Then follow the first-night checklist below.

## The six commands, in the manual's order

| Command | What it does |
|---|---|
| `init` | Writes `data/inputs.json`, `data/engines.json`, and a 100-row task skeleton (75 Train / 25 Holdout) plus `data/gold_review.csv`. |
| `doctor` | Which engines are usable, which prices are still placeholders, how many tasks are gold-approved. |
| `apply-gold` | Folds an approved `gold_review.csv` back into `tasks.csv`. |
| `run --strategy S [--split Train\|Holdout]` | Runs one strategy; appends one RunLog row per attempt. `--dry-run` prints the plan without executing. |
| `summarize [--by-bucket]` | Rebuilds JobSummary, reconciles it against RunLog, prints strategy economics. |
| `freeze-policy` | Fits the heuristic router on **Train attempts only** and freezes it. |
| `holdout` | Formal baseline-vs-candidate comparison, applies the gates, writes `reports/decision_memo.md`. |

Strategy names: `single:<engine>`, `cheapest_first`, `heuristic`.

## What's in here

```
src/
  schemas.py      AttemptResult / JobSummary / StrategySummary / TaskSpec
  config.py       the Inputs sheet: thresholds, gates, politeness settings
  pricing.py      engine catalog, marginal vs fixed cost, volume model
  safety.py       robots.txt, per-domain throttle, User-Agent
  validate.py     gold-controlled scoring -> validated_correct
  economics.py    RunLog -> JobSummary -> StrategySummary, plus reconcile()
  router.py       single-provider / cheapest-first / heuristic strategies
  runner.py       executes a plan, writes RunLog
  gates.py        decision gates and the Appendix D memo
  tasks.py        task registry, seeding, gold review
  benchmark.py    CLI
  engines/        http, playwright, firecrawl, browser_use adapters
data/             tasks.csv, run_log.csv, job_summary.csv, inputs.json, engines.json
reports/          decision_memo.md
tests/            133 tests, no network access required
```

Run the suite with `python -m pytest tests/ -q`.

## Five invariants the code enforces so you don't have to remember them

**1. Failed attempts stay on the bill.** `economics.build_job_summaries` sums
every attempt in a job, never just the winning one. `economics.reconcile()`
re-derives each job total from RunLog and reports any disagreement; `summarize`
and `holdout` both refuse to print a verdict when reconciliation fails. This is
the manual's "pick 5 jobs and sum them by hand" check, automated.

**2. API success is not correctness.** Only `validate.py` may set
`validated_correct`, scoring against a frozen gold answer across field accuracy
(0.60), schema validity (0.15), completeness (0.15) and freshness (0.10), with a
0.90 threshold. A 200 with the wrong price scores as spend, not as a result.
Tasks graded by rubric score 0.0 until a human overrides them — they can't drift
into being counted correct.

**3. Unreviewed gold never runs.** `load_tasks()` returns only
`gold_approved` rows by default, and approval is refused for a row with no gold
answer, URL or instruction. Seeded candidate rows deliberately ship with **no**
gold: a generated expected answer measures nothing.

**4. Holdout stays untouched.** `RouterPolicy.build()` filters to Train
attempts itself rather than trusting the caller. `freeze-policy` refuses to
overwrite an existing frozen policy without `--force`, and a Holdout run of the
heuristic router requires a frozen one. Changing rules after seeing holdout
results means a new holdout set, not a new policy file.

**5. A guess never passes as an invoice.** Every cost carries a `CostSource`
(`observed_api`, `reconciled_invoice`, `list_price`, `estimate`). `doctor` and
every decision memo name the engines still running on placeholder prices.

## Before you quote any savings number

**The shipped provider prices are placeholders.** `data/engines.json` ships with
plausible-looking numbers so the harness runs; they are marked
`price_verified: false` and every report says so. Replace them with observed
marginal cost from your own dashboards:

- Firecrawl: set `FIRECRAWL_USD_PER_CREDIT` (plan price ÷ credits included) and
  the adapter converts reported credit usage into real dollars per attempt.
- Browser Use: session cost *and* token cost — the adapter sums both when the
  API reports them.
- Local engines (`http`, `playwright`): billed as machine time via
  `LOCAL_COMPUTE_USD_PER_HOUR`. Deliberately non-zero, because a "free" local
  engine is the easiest way to manufacture a fake saving.

Keep fixed monthly platform fees in `fixed_monthly_fee_usd`. They are excluded
from marginal attempt cost and only applied later by `pricing.VolumeModel`, at a
stated volume.

## Safety rules, enforced in code

Every engine goes through `SafetyGate` before touching a URL: robots.txt is
honoured (with any declared crawl-delay), requests to the same domain are spaced
2–5 seconds with jitter, and a descriptive User-Agent is sent. Politeness sleeps
are excluded from measured latency, so a polite benchmark doesn't look like a
slow provider.

403 and 429 are recorded as `blocked` / `rate_limited` and the run moves on.
Only transient network faults are retried (2 max, exponential backoff). There is
no CAPTCHA bypass or access-control circumvention path in this codebase, and
none should be added.

## Task definitions

A task is URL + instruction/schema + a stable gold answer. Populate
`data/tasks.csv` (the loader also accepts the workbook's `Task_ID` /
`Expected_JSON/Gold` style headers).

The local engines don't guess — they use a small selector grammar, so a failure
means "this engine couldn't get the data", never "it invented something
plausible":

```
"h1.title"                first match, text
"a.perma@href"            first match, attribute
"table tbody tr td::all"  every match, list of text
"img.thumb::all@src"      every match, list of attributes
```

Interaction-heavy tasks carry a declarative script in `notes`, which keeps them
reproducible:

```
steps: click:button.load-more | scroll:3 | wait:1500 | waitfor:.results tr
```

## How the router decides

`cheapest_first` sorts eligible engines by marginal cost and escalates only
after a validation failure. It is deliberately naive.

`heuristic` orders by **expected cost to a correct result**:

```
expected_cost_to_correct = attempt_cost / p(correct | engine, bucket, domain)
```

That division is the whole idea. A nominally cheap engine that fails two times
in three isn't cheap, because the escalation is what you actually pay for.
Probabilities are Laplace-smoothed (one lucky attempt can't mint a 100% prior)
and fall back from domain → bucket → engine → 0.5.

Engines that can't meet the task SLA, or whose success probability is below the
open floor on enough evidence, are pushed to the back of the plan rather than
deleted — a slow engine still beats returning nothing.

There is no learned router, on purpose. If transparent economics-aware rules
can't find an edge, a model would hide the problem rather than solve it. Build
`heuristic` first, and only reach for learning once it has beaten the frozen
rules on holdout.

## Decision gates

`holdout` applies the manual's gates and writes a memo whose verdict is computed
before anyone reads it:

| Outcome | Verdict |
|---|---|
| ≥30% cost savings, ≤1 pp correctness degradation, quality floor (93%) met | **BUILD** (cost-led) |
| ≥10 pp correctness lift at ≤2× baseline cost/correct | **BUILD** (reliability-led) |
| 10–30% savings at equivalent quality | **NARROW** |
| <10% savings and negligible lift | **KILL** |
| Cost per correct undefined on either side | **INCONCLUSIVE** |

The manual leaves "reasonable incremental cost" for a reliability-led win in
prose; it's made explicit as `--reliability-cost-multiple` (default 2.0). Each
memo quotes the thresholds actually applied, so it can't describe a gate the run
didn't use.

Savings below the quality floor are reported as **fake savings**, not as a win.

## First night (manual Appendix B)

The win tonight is a measurement pipeline you trust, not 100 tasks. Bad
instrumentation × 100 tasks only produces confident nonsense.

- [ ] `pip install -r requirements.txt`, keys in `.env`, confirm `.env` is ignored by git
- [ ] `python -m src.benchmark init`
- [ ] Review `data/inputs.json`. Don't change thresholds yet.
- [ ] Define and approve **10** tasks: 5 static, 3 JS-heavy, 2 structured extraction
- [ ] `python -m src.benchmark run --strategy single:http --engines http`
- [ ] `python -m src.benchmark run --strategy single:playwright --engines playwright`
- [ ] `python -m src.benchmark summarize` — reconciliation must come back clean
- [ ] Only then add Firecrawl. Don't add Browser Use until the accounting is right.
- [ ] Stop when you can explain one complete job: task → attempts → correctness → total cost

Then: 100 tasks → single-provider baselines → `cheapest_first` → `freeze-policy`
→ `heuristic` on Train → `holdout` → decision memo.

## Not yet built

Honest list of what the manual asks for that this scaffold does not yet do:

- **Adapters for Zyte, Bright Data, Apify, Browserbase.** Priced in the catalog,
  no `run()` yet. A strategy routed to one of them records an
  `engine_ineligible` attempt row rather than silently skipping it.
- **External router baselines (gottem, ScrapeRouter).** Add them as engines once
  they can accept the same task definition; they then compare like any other.
- **Learned router (Strategy C).** Intentionally absent — see above.
- **Provider API drift.** The Firecrawl and Browser Use adapters are written
  against the v2 endpoint shapes and are overridable by env var. Verify the
  request/response shape against current docs before your first paid run; the
  mocked tests will tell you if a parsing change breaks anything.
- **The workbook itself.** This repo is the source of truth for execution; the
  xlsx remains yours for reading. `data/*.csv` columns map onto the sheets named
  in Appendix A.
