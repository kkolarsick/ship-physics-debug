# SubLedger

SubLedger is a workers' compensation premium-audit exposure tool for general contractors.
It turns subcontractor payments, certificates, policy inputs, and supporting documents into
an estimated audit exposure, shows the derivation behind the estimate, and ranks the actions
that may reduce it.

The product is intentionally **not** a generic COI compliance tracker. Its core object is the
dollar estimate and the evidence behind it.

## Status

**Pre-production prototype.** The application, ingestion, document workflow, calculation
engine, exports, and test harness are built. The current calculation rules are modeled
assumptions and are **not yet jurisdiction-complete**. Do not use the current ruleset as a
live customer billing estimate across states until jurisdiction-specific audit profiles are
implemented and validated against the applicable rating bureau/carrier rules.

The seeded demo is deterministic and currently produces **$405,700** of added payroll and
**$52,822** of estimated additional premium.

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
lib/exposure/     pure exposure/rating engine
lib/money.ts      integer-cent and scaled-integer arithmetic
lib/dates.ts      calendar-date handling
lib/ingest/       CSV import and presets
lib/extraction/   certificate extraction + validation + review gate
lib/matching/     subcontractor/certificate matching
lib/chase/        ranked remediation asks and outbound drafts
lib/export/       audit workpaper PDF and XLSX detail
lib/db/           Supabase and local demo stores behind one interface
supabase/         schema, RLS, storage policies, migrations
app/              product UI and API routes
```

### Calculation engine

`computeExposure()` currently:

1. Builds workers' compensation coverage windows from certificates on file.
2. Splits in-term subcontractor payments into covered and uncovered amounts.
3. Applies the configured material-treatment assumption where supported by evidence.
4. Rates the resulting payroll basis at the configured class-code rate and experience mod.
5. Calculates counterfactual dollar values for remediation actions.

Money is integer cents; rates and modifiers are scaled integers. Calculations are versioned
with a ruleset identifier and every displayed/exported number is intended to be traceable to
its inputs.

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

## Supabase

Copy `.env.example` to `.env.local`, configure the Supabase URL/anon key, and apply all
migrations in order:

```bash
supabase db push
```

The migration set is:

```text
0001_init.sql
0002_storage.sql
0003_secure_org_bootstrap.sql
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

The next work should be correctness and control work, not feature expansion.

1. **Jurisdiction profiles.** Add policy jurisdiction/rating-bureau identity and versioned
   rule profiles. The current single ruleset must not be treated as universal.
2. **Exposure period semantics.** Coverage should ultimately be tested against the period
   work was performed (or another defensible audit exposure basis), not silently assume the
   payment date is the work date.
3. **Subcontract type/payroll basis.** Model actual subcontractor payroll when available and
   jurisdiction-specific treatment for labor/material, labor-only, piecework, equipment,
   and other categories.
4. **Audit noncompliance charges.** Separate ordinary subcontractor exposure from any formal
   audit-noncompliance charge and model the actual endorsement/trigger conditions.
5. **Class-code treatment.** Make the applied classification/rate explicit and auditable at
   the subcontractor level instead of relying on a governing-rate fallback as a production
   assumption.
6. **Security regression tests.** Add database/RLS integration tests, including explicit
   cross-tenant denial tests.
7. **CI/CD and deployment hardening.** Run typecheck, lint, unit, E2E, migration, and security
   gates on every change before production deployment.
8. **Third-party data handling.** Finalize customer disclosures and retention/processing
   controls for certificate documents sent to the extraction provider.

Until those gates are closed, SubLedger should be treated as a strong prototype and audit-
preparation workflow, not a universal premium determination engine.
