-- Jurisdiction rules profiles, work periods, rate provenance, and audit compliance.
--
-- Four modelling errors are corrected here, and each needed a schema change:
--
--   1. A policy now names the jurisdiction and rating bureau whose rules govern it, and
--      may pin an exact ruleset id and version. Without a jurisdiction the engine
--      produces no estimate at all rather than falling back to a national default.
--   2. Audit noncompliance is its own set of inputs. It used to be a single percentage
--      that the engine applied whenever any subcontractor carried exposure, which
--      conflated two unrelated mechanisms. The percentage survives — some profiles read
--      it off the insured's own policy — but it only applies when an audit condition is
--      actually recorded.
--   3. Payments carry the period the work was performed. Coverage is tested against that
--      period; the payment date is a labelled proxy used only where a profile permits it.
--   4. A subcontractor can carry the rate an auditor actually applied on a prior audit,
--      and an explicit category (equipment with operator, owner-operator, and so on), so
--      the engine stops falling through to the governing rate as if it were known.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.policies
  -- ISO 3166-2 style, e.g. 'US-TN'. Null means no estimate can be produced.
  add column if not exists jurisdiction text,
  add column if not exists rating_bureau text,
  -- Set to pin a term to one ruleset so its figures stay reproducible after a profile
  -- version ships. Null means "resolve the current profile for the jurisdiction".
  add column if not exists ruleset_id text,
  add column if not exists ruleset_version text,
  -- The audit compliance state of the term. None of these is "a sub had no certificate".
  add column if not exists audit_endorsement_on_policy boolean not null default false,
  add column if not exists audit_records_furnished boolean not null default true,
  add column if not exists audit_permitted boolean not null default true,
  add column if not exists audit_estimated_issued boolean not null default false;

-- The old column name said "surcharge that applies"; it is really the percentage printed
-- on the insured's own policy, which some rules profiles use and others ignore.
alter table public.policies
  rename column noncompliance_surcharge_pct_ten_thousandths
  to carrier_configured_noncompliance_pct_ten_thousandths;

comment on column public.policies.carrier_configured_noncompliance_pct_ten_thousandths is
  'Audit noncompliance percentage from the insured''s own policy, scaled by 10,000. Applied only when the rules profile uses a carrier-configured percentage AND an audit condition is recorded.';

create index if not exists policies_jurisdiction_idx on public.policies (org_id, jurisdiction);

-- ---------------------------------------------------------------------------
-- Subcontractors
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'special_category') then
    create type public.special_category as enum (
      'sole_proprietor_no_employees',
      'owner_operator_vehicle',
      'equipment_with_operator',
      'licensed_professional',
      'labor_only_no_materials'
    );
  end if;
end;
$$;

alter table public.subcontractors
  -- The class and rate an auditor actually applied to this subcontractor previously.
  -- Stronger evidence than any proxy this product could choose.
  add column if not exists prior_audit_class_code text,
  add column if not exists prior_audit_rate_ten_thousandths bigint
    check (prior_audit_rate_ten_thousandths is null or prior_audit_rate_ten_thousandths >= 0),
  add column if not exists special_category public.special_category,
  add constraint subcontractors_prior_audit_complete check (
    (prior_audit_class_code is null) = (prior_audit_rate_ten_thousandths is null)
  );

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

alter table public.payments
  -- When the work was performed. Both or neither: half a period is not a period.
  add column if not exists work_from date,
  add column if not exists work_to date,
  add constraint payments_work_period_complete check (
    (work_from is null) = (work_to is null)
  ),
  add constraint payments_work_period_ordered check (
    work_from is null or work_to is null or work_to >= work_from
  );

comment on column public.payments.work_from is
  'Start of the period the work was performed. Coverage is tested against this period; where it is null the payment date is used as a labelled proxy.';

create index if not exists payments_work_period_idx on public.payments (org_id, work_from, work_to);

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'match_method') then
    create type public.match_method as enum ('manual', 'alias', 'auto_trigram', 'unmatched');
  end if;
end;
$$;

alter table public.certificates
  add column if not exists match_method public.match_method not null default 'unmatched';

comment on column public.certificates.match_method is
  'How this certificate came to be attached to its subcontractor. A trigram auto-match is a machine judgement and lowers the confidence of every figure that depends on it.';

update public.certificates
set match_method = 'manual'
where subcontractor_id is not null and match_method = 'unmatched';

-- ---------------------------------------------------------------------------
-- Saved calculations
-- ---------------------------------------------------------------------------

alter table public.exposure_snapshots
  add column if not exists ruleset_id text,
  add column if not exists jurisdiction text,
  add column if not exists rating_bureau text,
  add column if not exists confidence_level text,
  -- Inputs, assumptions, ruleset, confidence flags, and the documents behind the figure.
  add column if not exists provenance jsonb;

comment on table public.exposure_snapshots is
  'Append-only record of figures the user was shown or exported. Rows are never rewritten by a later ruleset: each carries the ruleset id and version that produced it, and re-resolving that pair reproduces the same profile.';

-- A snapshot is history. Nothing may edit or delete one, including a future migration
-- that adds a rules profile version.
create rule exposure_snapshots_no_update as on update to public.exposure_snapshots do instead nothing;
create rule exposure_snapshots_no_delete as on delete to public.exposure_snapshots do instead nothing;
