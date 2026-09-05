# SubLedger

SubLedger is a workers' compensation premium-audit exposure tool for general contractors.
It turns subcontractor payments, certificates, policy inputs, and supporting documents into
an estimated audit exposure, shows the derivation behind the estimate, and ranks the actions
that may reduce it.

The product is intentionally **not** a generic COI compliance tracker. Its core object is the
dollar estimate and the evidence behind it.

## Status

**Pre-production.** Audit treatment is selected through a versioned jurisdiction rules
profile rather than a universal ruleset, and the engine fails closed: a policy whose
jurisdiction has no configured profile produces **no dollar figure at all**, not a figure
computed under someone else's rules.

The commercial footprint is six launch states — **New York, New Jersey, Pennsylvania,
Florida, California, Texas**. All six are *declared*: the product recognises each one, names
the authority that governs it, and lists what has to be transcribed before it will price
anything there. **None of the six is populated yet**, so each currently returns "estimate
unavailable". That is the intended state, not a gap in the plumbing — populating one is a
data change in `lib/rules/profiles/<state>.ts`, and the public state page, the supported-
states list, and the scan's state picker all follow automatically because they read the same
registry the engine does.

One profile does produce estimates today: `us-ncci-basic-manual`, a `draft` covering
NCCI states. Draft means nobody has checked it line by line against the Basic Manual, and
every figure it produces says so in the UI and in both exports. Do not present a `draft`
profile's output to a carrier as a transcription of the bureau's rule.

The seeded demo is deterministic and produces **$405,700** of added payroll and **$52,822**
of estimated additional premium under that profile.

## Stack

- Next.js / React / TypeScript
- Tailwind CSS
- Supabase Postgres, Auth, and private Storage
- Anthropic API for certificate field extraction
- Zod validation at ingestion/extraction boundaries
- PDFKit and ExcelJS exports
- Vitest unit tests
- Playwright E2E
- Resend for chase email

No queue, Redis, Docker, or microservices are required for the current prototype.

## Local development

```bash
npm install
npm run seed
npm run dev
```

Open `http://localhost:3000`.

Validation:

```bash
npm run check       # typecheck + eslint + copy lint + unit tests
npm run test:e2e    # Playwright happy path
```

## Core architecture

```text
lib/rules/        jurisdiction rules profiles and fail-closed resolution
lib/marketing/    public-page content derived from the rules registry
lib/exposure/     pure exposure/rating engine, driven by a rules profile
lib/money.ts      integer-cent and scaled-integer arithmetic
lib/dates.ts      calendar-date handling
lib/ingest/       CSV import and presets
lib/extraction/   certificate extraction + validation + review gate
lib/matching/     subcontractor/certificate matching
lib/chase/        ranked remediation asks and outbound drafts
lib/export/       audit workpaper PDF and XLSX detail
lib/db/           Supabase and local demo stores behind one interface
supabase/         schema, RLS, storage policies, migrations
app/(app)/        product UI, behind sign-in
app/(marketing)/  the public funnel: homepage, state pages, scan, trust pages
app/api/          API routes
```

### The rules layer

A policy names a `jurisdiction` and optionally a `ratingBureau`; `resolveRulesProfile()`
turns that into a versioned `RulesProfile`, or into a stated failure. There is deliberately
no catch-all profile and no national default — an unrecognised jurisdiction, a jurisdiction
whose rules have not been transcribed, a bureau that contradicts the jurisdiction, or a
pinned ruleset version that is not in the build all resolve to *estimate unavailable*.

A profile is data, not code. It decides:

| Rule | What it settles |
|---|---|
| `uninsuredSubcontractor` | Whether the full uncovered cost is payroll, or a deemed labor share of it, or nothing this build models |
| `laborMaterial` | Whether a labor/material split is permitted at all, which documents support one, and the cap |
| `classification` | Whether payroll is rated at the subcontractor's trade class or the governing class, and whether a governing-rate proxy is allowed |
| `specialCategories` | Equipment with an operator, owner-operators, sole proprietors, labor-only, licensed professionals |
| `coveragePeriod` | Whether the payment date may stand in for the work period, and how a straddling period is split |
| `payrollBasis` | Whether the subcontractor's own payroll records displace the contract price, which records count, and what the fallback is |
| `experienceMod` | Whether the experience mod applies to premium on the added payroll |
| `unsupportedConditions` | Scenarios the jurisdiction declines to estimate, which the engine turns into a refusal rather than a figure |
| `auditNoncompliance` | Which conditions can trigger a charge, and how the charge is computed |

Every rule family carries `citations` — an authority, a document, a section, a URL, and when
a person last checked it. There is no authority value that admits a blog post. `openQuestions`
records what still has to be sourced, and drives the "what SubLedger will not calculate"
copy on the public state page.

Adding a jurisdiction is a new file in `lib/rules/profiles/`. Two profiles in
`tests/fixtures/profiles.ts` disagree on every one of those axes, and the suite asserts they
produce materially different payroll and premium from identical inputs — the abstraction is
load-bearing, not decorative.

### Adding a state

`tests/rules/scenarios.ts` holds the scenario matrix every supported state has to answer:
uninsured sub with no payroll records, actual payroll available, labor-and-material,
labor-only, equipment with an operator, piecework, sole proprietor, partial certificate
coverage, coverage lapsing mid-period, no work dates, known class, governing-rate proxy,
unsupported classification, and an audit noncompliance charge. The work is:

1. Source the rules from the governing manual and record the citations.
2. Fill in the rule families in `lib/rules/profiles/<state>.ts`.
3. Run the matrix and commit the resulting golden table.
4. Set `status`, `verifiedBy`, `verifiedAt`.

Nothing in the core engine changes, and no marketing page needs editing.

### Calculation engine

`computeExposure(sub, payments, certificates, policy, profile)`:

1. Builds coverage windows from the certificates on file.
2. Tests each payment against **the period the work was performed**. Where a payment carries
   no work dates, the payment date stands in only if the profile permits it, and the result
   is labelled a proxy in the UI, the exports, and the confidence model. A profile that
   refuses the proxy yields *estimate unavailable* rather than a guess from the check date.
3. Derives payroll under the profile's uninsured-subcontractor and labor/material rules,
   including deemed labor shares and special categories.
4. Selects a rate **with provenance** — the subcontractor's own class, a rate an auditor
   actually applied on a prior audit, a rules-derived governing class, a flagged
   governing-rate proxy, or none. Where there is none, it reports payroll and produces no
   premium figure at all.
5. Assesses the audit noncompliance charge from the audit conditions on the policy, never
   from the presence of uninsured subcontract cost.
6. Values each remediation action, and builds a confidence and provenance record.

Money is integer cents; rates and modifiers are scaled integers. Every saved figure carries
the ruleset id and version that produced it, and re-resolving that pair reproduces the same
profile — so a figure produced in March still computes to the same number in November after
the live profile has moved on.

### Estimate confidence

Deterministic arithmetic and uncertain inputs are kept apart. Every estimate carries an
`EstimateConfidence`: one factor per input class — rules profile, rules review, work period,
rate provenance, certificate reading, certificate match, category, triage, manual overrides
— each with what is *known* and, separately, what was *assumed*. The overall level is the
weakest factor, because one weak input is enough.

Every premium figure is therefore explainable as: inputs (the per-payment assessments),
assumptions (the confidence factors), ruleset (id, version, status), confidence flags, and
the documents behind it (certificate and payment ids on the provenance record).

## The public funnel

`lib/marketing/states.ts` derives every public claim about a state from its rules profile:
what SubLedger will calculate there, what it will not, which assumptions lower confidence,
and which ruleset and version apply. **No marketing page contains a hand-written claim about
coverage.** A state page cannot promise a jurisdiction the engine would refuse to price,
because both read the same registry.

`tests/marketing/copy-drift.test.ts` enforces that: it asserts a declared state's page says
nothing can be calculated, that two profiles which disagree about the rules produce different
sentences (proving the copy is generated rather than templated), that no page hard-codes a
state as supported, that nothing claims nationwide coverage, and that there is no "book a
demo" anywhere in the funnel.

The public routes, all reachable signed out:

```text
/                                   the number, and what it is not
/<state>/workers-comp-audit         one per recognised state, statically generated
/supported-states                   generated from the registry, split by whether it prices
/scan                               state selection first, then into the product
/waitlist                           for a state that has no ruleset yet
/methodology                        how the estimate is built, and its confidence model
/pricing                            free scan, one-time pre-audit analysis, later monitoring
/privacy  /security  /data-handling what is stored, who can see it, how to delete it
```

State selection happens before anything is asked for, so a contractor learns SubLedger
cannot price their state before uploading a ledger rather than three screens later.

## Compliance posture

SubLedger states document facts and produces estimates; it does not sell, place, recommend,
or determine insurance coverage. `lib/copy.ts` and `npm run lint:copy` enforce prohibited
coverage/advice language, and the disclaimer is included in customer-facing calculation and
export surfaces.

## Tenant security

Production mode uses the signed-in user's Supabase session and row-level security; request
handling does not use a service-role key. Documents are stored in private, org-scoped
buckets.

Migration `0003_secure_org_bootstrap.sql` closes the original workspace-bootstrap weakness:
clients can no longer self-insert arbitrary `org_members` rows. New organizations and owner
membership are created atomically through an authenticated `SECURITY DEFINER` function.

`0005_membership_administration.sql` supplies the path that fix left missing. There is still
no client-side `INSERT` policy on `org_members`; adding a member goes through
`invite_org_member()`, which requires the caller to already be an owner of that org, and
`remove_org_member()` refuses to remove an org's last owner. Renaming an org is
owner-only. Saved figures and the audit trail are append-only in the schema itself, so no
later migration or ruleset change can rewrite a figure the user was already shown.

This is verified against a real Postgres rather than reasoned about:

```bash
npm run test:db     # applies every migration from zero, then attempts cross-tenant access
```

`supabase/test/tenant-isolation.test.sql` creates two accounts and two organizations and
tries every route from one to the other: self-inserting membership, escalating a role,
reading and tampering with certificates, reaching stored documents, using the matching RPC
as a side channel, rewriting a saved figure, and rewriting the audit trail. Every assertion
raises on failure. The suite has been checked against a deliberately reintroduced hole and
fails when the old self-insert policy is put back.

`tests/security/policies.test.ts` is the cheap tripwire that runs in `npm run check` without
a database: it walks the migrations in order and fails if the dangerous policies reappear,
if a `SECURITY DEFINER` function loses its pinned `search_path`, or if a service-role key
ever shows up in application code.

## Supabase

Copy `.env.example` to `.env.local`, configure the Supabase URL/anon key, and apply all
migrations in order:

```bash
supabase db push
```

The migration set is:

```text
0001_init.sql                             schema, RLS, append-only audit trail
0002_storage.sql                          private org-scoped buckets
0003_secure_org_bootstrap.sql             closes the self-join hole
0004_rules_profiles_and_provenance.sql    jurisdiction, work periods, rate provenance,
                                          audit-compliance inputs, snapshot immutability
0005_membership_administration.sql        owner-gated membership changes
```

With Supabase unset, the application uses the local JSON demo store.

Optional integrations:

- `ANTHROPIC_API_KEY` — certificate extraction
- `ANTHROPIC_EXTRACTION_MODEL` — extraction model override
- `RESEND_API_KEY` / `CHASE_FROM_EMAIL` — outbound chase email

## What is built

- Policy-term setup and history
- CSV payment ingestion
- Vendor/subcontractor triage
- Exposure dashboard and subcontractor drill-down
- Certificate upload and extraction review queue
- Coverage-window visualization
- Matching and remembered aliases
- Ranked chase workflow
- PDF audit workpaper
- XLSX subcontractor detail
- Local deterministic seed/demo
- Supabase authentication and tenant storage
- Copy-safety linting
- Unit and happy-path E2E tests

## Production gates

Gates 1–6 below are closed. The engine no longer assumes a universal ruleset, no longer
treats the payment date as the work date, no longer conflates audit noncompliance with
uninsured subcontract cost, and no longer presents a governing-rate proxy as a known rate.
Tenant isolation is tested against a live database.

| # | Gate | State |
|---|---|---|
| 1 | Jurisdiction rules profiles, versioned, fail-closed | Closed — `lib/rules/` |
| 2 | Labor/material treatment is per-jurisdiction, not a universal 50% | Closed — profile-driven, two divergent profiles under test |
| 3 | Coverage tested against the work period, proxy disclosed | Closed — `lib/exposure/coverage.ts` |
| 4 | Audit noncompliance modelled from its own triggers | Closed — `lib/exposure/noncompliance.ts` |
| 5 | Explicit rate provenance, no silent governing-rate fallback | Closed — `lib/exposure/rating.ts` |
| 6 | Cross-tenant security tests against a real database | Closed — `npm run test:db` |
| 7 | CI/CD gates on every change | **Open** |
| 8 | Third-party data handling disclosures and retention controls | Pages written; the provider-terms wording needs a legal read before launch |
| 9 | Six launch-state rules profiles populated and verified | **Open** — all six declared, none populated |
| 10 | Funnel analytics, checkout, and the paid report artifact | **Open** |

Two things still bound what this build should be used for:

**No launch state is populated.** All six are declared and fail closed. The only profile
producing estimates is the NCCI one, and it is a draft nobody has checked against the Basic
Manual. Sourcing the six is the critical path to commercial launch, and it is research work
rather than engineering work — the architecture, the scenario matrix, the state pages, and
the scan all already accommodate it.

**Coverage status is still document-derived.** The app reads certificates; it does not
confirm with any carrier that a policy was in force.

## Where this implementation departs from a naive reading

**There is no universal ruleset constant.** The old `RULESET` is gone. Anything that needs
treatment takes a `RulesProfile`, and anything that needs to produce a figure has to resolve
one first.

**A missing rate produces no premium, not a zero and not a proxy.** `addedPremium` is
`number | null`. Unrated payroll is reported separately on the dashboard, in the workpaper,
and in the workbook, so it is visible rather than quietly absorbed into a total.

**Confidence is scoped to the figures that exist.** A vendor triaged out as a material
supplier contributes nothing to the total, so the quality of its class code and work dates
does not drag the estimate's confidence down. A vendor priced at zero *because its
certificates cover the work* does count — a misread date there would move the number.

**The material cap is applied against the uncovered total, not everything paid** — under
profiles whose cap is `share_of_uncovered`. Capping against total paid would let a mostly
covered subcontractor erase its uncovered slice using materials from payments that were
already covered. Profiles can specify either basis; the shipped NCCI profile uses the former.
