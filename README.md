# SubLedger

Tell a general contractor, today, in dollars, what their year-end workers' compensation
premium audit is going to cost them — and give them a ranked, trackable list of actions
that removes it.

```bash
npm install
npm run seed     # loads the golden fixtures into a local store
npm run dev      # http://localhost:3000
```

That produces a populated app with no cloud account: **$405,700** of added payroll and
**$52,822** of estimated additional premium, the figures the build brief's fixtures
specify.

---

## What this is, and what it is not

This is **not** a certificate-of-insurance tracker. There are no vendor compliance
workflows, no contractual requirement matrices, no tenant or vendor portals, and no broker
or carrier logins. That category is occupied and sells enterprise-down through brokers.

This is a **liability pricing tool that happens to read certificates**. Its reason to exist
is one number on the screen: the additional premium the carrier is likely to bill at audit.
Everything else is in service of moving that number down and proving it moved.

Two consequences show up throughout the code:

1. **The user is the insured, and only the insured.** Where the contractor's interest and a
   carrier's or broker's would differ, the code resolves for the contractor.
2. **It works with zero pre-existing infrastructure.** A certificate is never required in
   order to compute something. A sub with no certificate at all is the most important row
   in the table, not an error state.

---

## Compliance posture

The operator is not a licensed insurance producer, so the application states facts and does
arithmetic and never transacts or advises on insurance. That is enforced, not remembered:

- `lib/copy.ts` holds the required disclaimer verbatim and the vocabulary rules.
- `npm run lint:copy` fails the build on copy that recommends coverage, calls anything
  adequate or compliant, claims coverage was verified with an insurer, or presents output
  as a determination rather than an estimate. It runs as part of `npm run check`.
- `tests/copy/copy-rules.test.ts` tests the rules themselves in both directions — they must
  catch the forbidden phrasings and must leave the audit-facing language alone.

Coverage status is always stated against the document on file
(*"will be included in auditable payroll"*, not *"not compliant"*), and the disclaimer
appears on the dashboard, on the subcontractor detail page, and on every page of both
exports.

---

## Stack

Next.js (App Router) + TypeScript · Tailwind · Supabase (Postgres, auth, storage) ·
`@anthropic-ai/sdk` for extraction · Zod at every boundary · Vitest for the engine ·
Playwright for one happy-path E2E · Resend for outbound email.

No queue, no Redis, no microservices, no Docker. Certificate extraction runs after the
response via Next's `after()` and the client polls a status endpoint.

---

## Layout

```
lib/exposure/     the engine — pure functions, no I/O, the only place these sums exist
lib/money.ts      integer cents and BigInt rating arithmetic
lib/dates.ts      calendar dates as YYYY-MM-DD strings, compared lexically
lib/ingest/       CSV presets, header sniffing, import rules
lib/extraction/   ACORD 25 prompt, Zod validation, one retry, confidence gate
lib/matching/     name normalization and pg_trgm-compatible trigram similarity
lib/chase/        ask proposal, ranking, email templates
lib/export/       audit workpaper (PDF) and sub-level detail (XLSX)
lib/db/           one Store interface; Supabase and local JSON implementations
supabase/         schema, row-level security, storage policies
app/              the eight screens
```

### The engine

`lib/exposure/` is pure functions with no I/O, fully unit tested, and the only place the
calculations exist. `computeExposure(sub, payments, certificates, policy)`:

1. Builds coverage windows from the certificates on file and merges overlaps.
2. Splits payments by whether the payment date falls inside a window — **inclusive on both
   ends**.
3. Deducts material only against uncovered payments, only where an original invoice is on
   file, capped at half.
4. Rates the remainder at the class code rate per $100 of payroll times the experience mod.
5. Returns what each available action is worth in premium dollars removed.

Coverage is a **date-window** question, never a boolean. A certificate expiring 04/30 while
the sub worked through August covers the spring payments and not the summer ones, and the
exposure is only the uncovered slice. Partial coverage is the common real-world case, and
`components/CoverageTimeline.tsx` is where it becomes obvious.

Flags (`SOLE_PROPRIETOR_NO_EMPLOYEES`, `OFFICER_EXCLUSION_NOTED`, `CERT_EXPIRES_MID_TERM`,
`MATERIAL_CAP_BINDING`, `LARGE_UNMATCHED_VENDOR`, `GL_ONLY_CERTIFICATE`) are annotations —
questions worth putting to an auditor. None of them moves a dollar.

`RULESET` carries a version stamp that is written onto every saved calculation and every
export, so a figure produced in March can be explained in November.

---

## Engineering standards

- **TypeScript strict**, with `noUncheckedIndexedAccess`. No `any` in `lib/exposure/`.
- **All money is integer cents.** The rating multiply-and-divide runs in BigInt and rounds
  exactly once, at the end. `lib/money.ts` is the only place money arithmetic happens, and
  formatting only happens at the view layer.
- **All dates are `YYYY-MM-DD` strings compared lexically.** Nothing constructs a
  local-time `Date`, so a payment can never shift across a coverage boundary because of a
  server timezone.
- **Every calculated figure is traceable.** The dashboard links each figure to the
  subcontractor page, which shows the derivation line by line and the documents behind it.
- **Row-level security on `org_id` on every table.** Certificates hold third parties'
  business information; a cross-tenant leak would be fatal. Queries run as the signed-in
  user — the service role key is never used in request handling.
- **`AuditEvent` is append-only**, enforced with rules as well as policy. Every change to a
  number is recorded with its before and after.

---

## Development

```bash
npm run seed        # load the golden fixtures into .data/demo.json
npm run dev
npm run check       # typecheck + eslint + copy lint + 194 unit tests
npm run test:e2e    # Playwright happy path (seeds, builds, and starts the app)
```

`npm run check` is what should gate a commit.

### Running against Supabase

Copy `.env.example` to `.env.local` and fill in the Supabase pair. Then apply the
migrations:

```bash
supabase db push          # or: psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
                          #          psql "$DATABASE_URL" -f supabase/migrations/0002_storage.sql
```

With those variables set, the app requires sign-in (an emailed link), creates an org and a
membership on first sign-in, and every read and write goes through row-level security. With
them unset it falls back to the local JSON store — a development and demo affordance only.

Certificate extraction additionally needs `ANTHROPIC_API_KEY`; outbound chase email needs
`RESEND_API_KEY` and `CHASE_FROM_EMAIL`. Both degrade to a clearly-labelled no-op rather
than a crash: a certificate uploaded with no API key is still stored and still lands in the
review queue for a human.

---

## Build order

The brief's sequence, each step independently demonstrable:

| # | Step | State |
|---|------|-------|
| 1 | Exposure engine + golden tests | Done — 194 Vitest cases |
| 2 | Setup, CSV import, triage, manual coverage → dashboard | Done |
| 3 | Export to PDF / XLSX | Done |
| 4 | Certificate upload, extraction, review queue | Done |
| 5 | Matching + aliases | Done |
| 6 | Coverage-window timeline | Done |
| 7 | Chase loop, email, eliminated-to-date | Done |
| 8 | Multi-policy-term history | Terms are stored, switchable, and each carries its own figures. There is no term-over-term comparison view yet. |

Steps 4 and 5 are built but, per the brief's own warning, they are the expensive and least
differentiated part — step 2 is the sellable product and does not depend on extraction
working at all. The manual coverage-entry path on the subcontractor page exists for exactly
that reason.

---

## Where this implementation departs from the brief

Each of these is a deliberate call, not an oversight.

**Money and rate columns are scaled integers, not `NUMERIC`.** §3 sketches `NUMERIC`
columns; §11 requires integer cents and no floating-point arithmetic on dollars. The
standard wins: money is `BIGINT` cents in `*_cents` columns, and rates, experience mods,
and percentages are scaled integers with the scale named in the column and documented in
the migration. This keeps a figure byte-identical from the database to the PDF.

**The material cap is applied against the uncovered total, not the total paid.** §6a's prose
says "50% of the total paid to that subcontractor"; §6b's algorithm caps at
`uncoveredTotal * MATERIAL_CAP`. The executable spec wins — capping against total paid
would let a mostly-covered sub erase its entire uncovered slice with materials from
payments that were already covered. For every fixture in §6d the two readings agree.

**A scanned PDF is sent to the model as a document, not rasterized locally.** §4b says to
rasterize and send pages as images. A PDF with a text layer is still read directly with
`pdf-parse`, which is faster and exact; one without goes to the model as a base64 document
block and photographs of printouts go as image blocks. This keeps a rasterizer and its
native dependencies out of a serverless deployment for no loss in what the model sees.

**Extraction uses `after()` rather than a separate background function.** The brief asks for
a Vercel background function with status polled from the client. The upload route stores
the file and creates the row synchronously — so nothing is lost if extraction fails — then
runs extraction after the response, and the client polls `/api/certificates/status`. Same
UX, one fewer moving part, consistent with "no queue system".

**There is a local JSON store alongside Supabase.** Not in the brief. It exists so
`npm run seed && npm run dev` produces a working, populated app with no cloud account,
which is what §11's seed-script requirement and the E2E run both need. It implements the
same `Store` interface, so the figures come out of the same code path; it never runs when
Supabase is configured.

**The extraction model is the one the brief names.** `claude-sonnet-4-6`, overridable with
`ANTHROPIC_EXTRACTION_MODEL`. The prompt and schema are model-independent.

**This repository previously held an unrelated Roblox prototype.** Its files are untouched
under `src/` and its README is preserved at `docs/roblox-prototype.md`. Nothing in this app
reads them, and they are excluded from typecheck and lint.

---

## Out of scope, deliberately

Contractual insurance requirement matrices. Tenant or vendor self-service portals. Broker or
carrier logins. Additional-insured or waiver-of-subrogation endorsement analysis. General
liability exposure. Certificate issuance. Direct carrier verification. Multi-state class
code libraries. Anything that touches a bank, credit union, or other federally supervised
financial institution as a customer, data source, or partner.
