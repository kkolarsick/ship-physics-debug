-- SubLedger — initial schema.
--
-- Two conventions run through every table, both from brief §11:
--
--   * Money is a whole number of cents in a BIGINT column, never NUMERIC and never a
--     float. Rates, experience mods, and percentages are likewise stored as scaled
--     integers (see the column comments for each scale) so that a figure written in
--     March reads back identically in November.
--   * Dates that describe a calendar day — a payment date, a policy term boundary, a
--     certificate effective date — are DATE, never TIMESTAMPTZ. Only event timestamps
--     are instants.
--
-- Row-level security is keyed on org_id on every table. Certificates carry third
-- parties' business information; a cross-tenant leak is fatal to this product.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.orgs (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) > 0),
  fiscal_year_end  date,
  created_at       timestamptz not null default now()
);

create table public.org_members (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- SECURITY DEFINER so the policies below can read membership without recursing
-- through org_members' own RLS policy.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = target_org and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Policy term
-- ---------------------------------------------------------------------------

create table public.policies (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references public.orgs(id) on delete cascade,
  carrier_name                  text,
  policy_number                 text,
  term_start                    date not null,
  term_end                      date not null,
  -- Experience modification factor scaled by 1,000. A mod of 1.050 is stored as 1050.
  experience_mod_thousandths    bigint not null default 1000 check (experience_mod_thousandths >= 0),
  -- Estimated annual premium, in cents. The base for the non-compliance surcharge.
  estimated_annual_premium_cents bigint not null default 0 check (estimated_annual_premium_cents >= 0),
  -- Surcharge percentage scaled by 10,000. 5% is stored as 50000. User-entered from
  -- their own policy; defaults to zero because most policies do not carry one.
  noncompliance_surcharge_pct_ten_thousandths bigint not null default 0
    check (noncompliance_surcharge_pct_ten_thousandths >= 0),
  governing_class_code          text,
  -- Premium dollars per $100 of payroll, scaled by 10,000. A rate of 12.40 is 124000.
  governing_rate_ten_thousandths bigint not null default 0 check (governing_rate_ten_thousandths >= 0),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint policies_term_ordered check (term_end >= term_start)
);

create index policies_org_idx on public.policies (org_id, term_start desc);

create table public.class_code_rates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  policy_id  uuid not null references public.policies(id) on delete cascade,
  class_code text not null,
  -- Same scale as policies.governing_rate_ten_thousandths.
  rate_ten_thousandths bigint not null check (rate_ten_thousandths >= 0),
  label      text,
  created_at timestamptz not null default now(),
  unique (policy_id, class_code)
);

create index class_code_rates_org_idx on public.class_code_rates (org_id);

-- ---------------------------------------------------------------------------
-- Subcontractors
-- ---------------------------------------------------------------------------

create type public.entity_type as enum (
  'unknown', 'corporation', 'llc', 'partnership', 'sole_proprietor'
);

create type public.triage_decision as enum (
  'undecided', 'subcontractor', 'supplier', 'not_applicable'
);

create table public.subcontractors (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs(id) on delete cascade,
  -- The name exactly as it appears in the ledger. Never rewritten.
  name                   text not null,
  normalized_name        text not null,
  entity_type            public.entity_type not null default 'unknown',
  trade                  text,
  triage                 public.triage_decision not null default 'undecided',
  class_code_override_id uuid references public.class_code_rates(id) on delete set null,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (org_id, name)
);

create index subcontractors_org_idx on public.subcontractors (org_id);
create index subcontractors_normalized_trgm_idx
  on public.subcontractors using gist (normalized_name gist_trgm_ops);

-- A pairing a human confirmed, so the same question is never asked twice (§5).
create table public.subcontractor_aliases (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  subcontractor_id  uuid not null references public.subcontractors(id) on delete cascade,
  alias             text not null,
  normalized_alias  text not null,
  created_at        timestamptz not null default now(),
  unique (org_id, normalized_alias)
);

create index subcontractor_aliases_sub_idx on public.subcontractor_aliases (subcontractor_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create type public.material_evidence as enum (
  'none', 'original_invoice', 'contract_schedule'
);

-- The raw uploaded file is never discarded, and a batch can be rolled back wholesale.
create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  policy_id       uuid references public.policies(id) on delete set null,
  source_filename text not null,
  storage_path    text,
  preset          text,
  column_mapping  jsonb not null default '{}'::jsonb,
  row_count       integer not null default 0,
  imported_count  integer not null default 0,
  -- Counts and reasons for every row that did not become a payment (§4a).
  excluded        jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  rolled_back_at  timestamptz
);

create index import_batches_org_idx on public.import_batches (org_id, created_at desc);

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  subcontractor_id  uuid not null references public.subcontractors(id) on delete cascade,
  paid_on           date not null,
  -- Cents. Positive only: credits and voids are counted and reported, not imported.
  amount_cents      bigint not null check (amount_cents > 0),
  source_ref        text,
  -- Only set when a split invoice is on file. Cents.
  material_amount_cents bigint check (material_amount_cents >= 0),
  material_evidence public.material_evidence not null default 'none',
  imported_batch_id uuid references public.import_batches(id) on delete cascade,
  created_at        timestamptz not null default now(),
  constraint payments_material_needs_evidence check (
    material_amount_cents is null or material_evidence <> 'none'
  )
);

create index payments_org_sub_idx on public.payments (org_id, subcontractor_id, paid_on);
create index payments_batch_idx on public.payments (imported_batch_id);

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

create type public.certificate_status as enum (
  'pending', 'extracted', 'needs_review', 'matched', 'rejected'
);

create table public.certificates (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs(id) on delete cascade,
  -- Null until matched. An unmatched certificate is a signal, not a bug (§5).
  subcontractor_id       uuid references public.subcontractors(id) on delete set null,
  file_path              text not null,
  original_filename      text,
  status                 public.certificate_status not null default 'pending',
  named_insured          text,
  normalized_named_insured text,
  producer_name          text,
  producer_email         text,
  producer_phone         text,
  -- True only when the WC/EL section carries a policy number or limits.
  wc_present             boolean not null default false,
  wc_carrier             text,
  wc_policy_number       text,
  wc_effective           date,
  wc_expiration          date,
  wc_officer_exclusion_noted boolean not null default false,
  gl_present             boolean not null default false,
  certificate_holder     text,
  description_of_operations text,
  -- 0..1, scaled by 1,000. 0.85 is stored as 850.
  extraction_confidence_thousandths integer
    check (extraction_confidence_thousandths between 0 and 1000),
  raw_extraction         jsonb,
  extraction_error       text,
  reviewed_by_user_at    timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint certificates_wc_dates_ordered check (
    wc_effective is null or wc_expiration is null or wc_expiration >= wc_effective
  )
);

create index certificates_org_idx on public.certificates (org_id, status);
create index certificates_sub_idx on public.certificates (subcontractor_id);
create index certificates_named_insured_trgm_idx
  on public.certificates using gist (normalized_named_insured gist_trgm_ops);

-- ---------------------------------------------------------------------------
-- Chase loop
-- ---------------------------------------------------------------------------

create type public.chase_ask as enum (
  'certificate', 'split_invoice', 'agent_direct', 'entity_clarification'
);

create type public.chase_status as enum (
  'open', 'sent', 'responded', 'resolved', 'dead'
);

create table public.chase_items (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs(id) on delete cascade,
  policy_id                uuid not null references public.policies(id) on delete cascade,
  subcontractor_id         uuid not null references public.subcontractors(id) on delete cascade,
  ask                      public.chase_ask not null,
  -- Snapshot of the dollars at stake when the item opened. Cents.
  exposure_cents_at_open   bigint not null default 0,
  status                   public.chase_status not null default 'open',
  sent_to                  text,
  subject                  text,
  body                     text,
  provider_message_id      text,
  sent_at                  timestamptz,
  responded_at             timestamptz,
  resolved_at              timestamptz,
  resolution_note          text,
  -- Computed at resolution, from a recomputation rather than the snapshot. Cents.
  exposure_cents_removed   bigint,
  ruleset_version          text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (policy_id, subcontractor_id, ask)
);

create index chase_items_org_idx on public.chase_items (org_id, status);
create index chase_items_policy_idx on public.chase_items (policy_id, exposure_cents_at_open desc);

-- ---------------------------------------------------------------------------
-- Saved calculations and the audit trail
-- ---------------------------------------------------------------------------

-- Every figure the user has been shown or exported, with the ruleset that produced it.
create table public.exposure_snapshots (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  policy_id         uuid not null references public.policies(id) on delete cascade,
  ruleset_version   text not null,
  total_exposure_cents bigint not null,
  added_payroll_cents  bigint not null,
  surcharge_cents      bigint not null default 0,
  detail            jsonb not null,
  reason            text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index exposure_snapshots_policy_idx
  on public.exposure_snapshots (policy_id, created_at desc);

-- Append-only. The output of this tool gets handed to a carrier's auditor in a dispute,
-- so every figure must be traceable to a document and a timestamp.
create table public.audit_events (
  id          bigserial primary key,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  actor       text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id   text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index audit_events_org_idx on public.audit_events (org_id, at desc);
create index audit_events_entity_idx on public.audit_events (org_id, entity_type, entity_id, at desc);

create rule audit_events_no_update as on update to public.audit_events do instead nothing;
create rule audit_events_no_delete as on delete to public.audit_events do instead nothing;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger policies_touch before update on public.policies
  for each row execute function public.touch_updated_at();
create trigger subcontractors_touch before update on public.subcontractors
  for each row execute function public.touch_updated_at();
create trigger certificates_touch before update on public.certificates
  for each row execute function public.touch_updated_at();
create trigger chase_items_touch before update on public.chase_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Matching RPC (§5)
-- ---------------------------------------------------------------------------

-- Ranked candidates for a certificate's named insured. A confirmed alias short-circuits
-- the score; otherwise trigram similarity decides the band the caller applies.
create or replace function public.match_subcontractors(
  target_org uuid,
  normalized_target text,
  max_results integer default 10
)
returns table (
  subcontractor_id uuid,
  name text,
  normalized_name text,
  score real,
  via_alias boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with alias_hit as (
    select s.id, s.name, s.normalized_name, 1.0::real as score, true as via_alias
    from public.subcontractor_aliases a
    join public.subcontractors s on s.id = a.subcontractor_id
    where a.org_id = target_org and a.normalized_alias = normalized_target
    limit 1
  ),
  scored as (
    select s.id, s.name, s.normalized_name,
           similarity(s.normalized_name, normalized_target) as score,
           false as via_alias
    from public.subcontractors s
    where s.org_id = target_org
      and similarity(s.normalized_name, normalized_target) > 0
    order by score desc, s.name asc
    limit max_results
  )
  select * from alias_hit
  union all
  select * from scored where not exists (select 1 from alias_hit)
  order by score desc;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.orgs                  enable row level security;
alter table public.org_members           enable row level security;
alter table public.policies              enable row level security;
alter table public.class_code_rates      enable row level security;
alter table public.subcontractors        enable row level security;
alter table public.subcontractor_aliases enable row level security;
alter table public.import_batches        enable row level security;
alter table public.payments              enable row level security;
alter table public.certificates          enable row level security;
alter table public.chase_items           enable row level security;
alter table public.exposure_snapshots    enable row level security;
alter table public.audit_events          enable row level security;

create policy orgs_member_read on public.orgs
  for select using (public.is_org_member(id));
create policy orgs_member_write on public.orgs
  for update using (public.is_org_member(id)) with check (public.is_org_member(id));
create policy orgs_insert_any_authenticated on public.orgs
  for insert with check (auth.uid() is not null);

create policy org_members_self_read on public.org_members
  for select using (user_id = auth.uid() or public.is_org_member(org_id));
create policy org_members_self_insert on public.org_members
  for insert with check (user_id = auth.uid() or public.is_org_member(org_id));

do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'policies', 'class_code_rates', 'subcontractors', 'subcontractor_aliases',
    'import_batches', 'payments', 'certificates', 'chase_items', 'exposure_snapshots'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))',
      scoped_table || '_org_scoped', scoped_table
    );
  end loop;
end;
$$;

-- Audit events are readable by the org and insertable by the org, never updated or
-- deleted (the rules above make that structural, not just a policy).
create policy audit_events_org_read on public.audit_events
  for select using (public.is_org_member(org_id));
create policy audit_events_org_insert on public.audit_events
  for insert with check (public.is_org_member(org_id));
