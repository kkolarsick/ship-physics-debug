-- Tenant isolation, exercised against a real Postgres with the real policies.
--
-- Certificates hold other businesses' insurance information. A cross-tenant read of one is
-- the failure that ends this product, so it is tested rather than reasoned about: two
-- accounts, two organizations, and every path one could take to reach the other's data.
--
-- Every assertion raises on failure, so a non-zero exit from psql means a real hole.

\set ON_ERROR_STOP on

create schema if not exists test;

-- Runs a statement as the current role and fails loudly if it *succeeds*.
create or replace function test.expect_denied(statement text, label text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'SECURITY FAILURE: % was permitted and must not be', label;
exception
  when others then
    if sqlerrm like 'SECURITY FAILURE%' then
      raise;
    end if;
end;
$$;

-- An UPDATE or DELETE that row-level security filters to nothing does not raise; it
-- simply affects no rows. That is the correct outcome and has to be asserted as such,
-- rather than as an error, or the test passes for the wrong reason.
create or replace function test.expect_no_rows_affected(statement text, label text)
returns void
language plpgsql
as $$
declare
  affected integer;
begin
  execute statement;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'SECURITY FAILURE: % affected % row(s) and must affect none', label, affected;
  end if;
exception
  when others then
    -- An outright error is also an acceptable denial.
    if sqlerrm like 'SECURITY FAILURE%' then
      raise;
    end if;
end;
$$;

create or replace function test.assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if not condition then
    raise exception 'SECURITY FAILURE: %', label;
  end if;
end;
$$;

grant usage on schema test to public;
grant execute on all functions in schema test to public;

-- ---------------------------------------------------------------------------
-- Two accounts
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'ada@northgate.example'),
  ('22222222-2222-4222-8222-222222222222', 'ben@rival.example'),
  ('33333333-3333-4333-8333-333333333333', 'cy@northgate.example');

-- ---------------------------------------------------------------------------
-- An unauthenticated caller cannot bootstrap anything
-- ---------------------------------------------------------------------------

set role anon;
set request.jwt.claim.sub = '';

select test.expect_denied(
  $$select public.create_org_for_current_user('Anonymous Co')$$,
  'anonymous org bootstrap'
);
select test.expect_denied(
  $$insert into public.orgs (name) values ('Direct insert')$$,
  'anonymous direct insert into orgs'
);
select test.expect_denied(
  $$insert into public.org_members (org_id, user_id, role)
    values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'owner')$$,
  'anonymous direct insert into org_members'
);

reset role;

-- ---------------------------------------------------------------------------
-- Ada creates her organization and becomes its owner
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select public.create_org_for_current_user('Northgate Construction') as org_a \gset

select test.assert(
  (select count(*) from public.org_members where org_id = :'org_a' and role = 'owner') = 1,
  'the bootstrap created exactly one owner membership'
);
select test.assert(public.is_org_owner(:'org_a'), 'Ada is an owner of her own org');

-- She still cannot insert memberships directly; the bootstrap is the only path in.
select test.expect_denied(
  format(
    $$insert into public.org_members (org_id, user_id, role) values (%L, %L, 'owner')$$,
    :'org_a', '22222222-2222-4222-8222-222222222222'
  ),
  'direct membership insert by an owner'
);

-- Some data for Ben to try to reach.
insert into public.policies (org_id, carrier_name, term_start, term_end, jurisdiction)
values (:'org_a', 'Cornerstone Casualty', '2025-01-01', '2025-12-31', 'US-TN');

insert into public.subcontractors (org_id, name, normalized_name)
values (:'org_a', 'Kowalczyk Framing', 'KOWALCZYK FRAMING');

insert into public.certificates (org_id, file_path, named_insured, wc_present)
values (:'org_a', :'org_a' || '/cert-a.pdf', 'Kowalczyk Framing & Carpentry LLC', true);

insert into storage.buckets (id, name, public) values ('certificates', 'certificates', false)
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name) values ('certificates', :'org_a' || '/cert-a.pdf');

reset role;

-- ---------------------------------------------------------------------------
-- Ben creates his own organization
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select public.create_org_for_current_user('Rival Builders') as org_b \gset

select test.assert(:'org_a' <> :'org_b', 'the two organizations are distinct');

-- --- The hole 0003 closed: self-joining an arbitrary org --------------------

select test.expect_denied(
  format(
    $$insert into public.org_members (org_id, user_id, role) values (%L, %L, 'owner')$$,
    :'org_a', '22222222-2222-4222-8222-222222222222'
  ),
  'self-insert into another org as owner'
);
select test.expect_denied(
  format(
    $$insert into public.org_members (org_id, user_id, role) values (%L, %L, 'member')$$,
    :'org_a', '22222222-2222-4222-8222-222222222222'
  ),
  'self-insert into another org as member'
);
select test.expect_no_rows_affected(
  format($$update public.org_members set role = 'owner' where org_id = %L$$, :'org_a'),
  'escalating a role in another org'
);
select test.expect_no_rows_affected(
  format($$delete from public.org_members where org_id = %L$$, :'org_a'),
  'removing another org''s memberships'
);
select test.expect_denied(
  format($$select public.invite_org_member(%L, 'ben@rival.example', 'owner')$$, :'org_a'),
  'inviting oneself into another org through the RPC'
);

select test.assert(
  (select count(*) from public.org_members where org_id = :'org_a') = 0,
  'Ada''s memberships are invisible to Ben'
);
select test.assert(not public.is_org_member(:'org_a'), 'Ben is not a member of Ada''s org');

-- --- Reading another tenant's data ------------------------------------------

select test.assert(
  (select count(*) from public.orgs where id = :'org_a') = 0,
  'another org row is invisible'
);
select test.assert(
  (select count(*) from public.certificates) = 0,
  'CRITICAL: another org''s certificates are invisible'
);
select test.assert(
  (select count(*) from public.subcontractors) = 0,
  'another org''s subcontractors are invisible'
);
select test.assert(
  (select count(*) from public.policies) = 0,
  'another org''s policies are invisible'
);
select test.assert(
  (select count(*) from public.audit_events) = 0,
  'another org''s audit trail is invisible'
);

-- Naming the org id explicitly does not help: the policy is on membership, not obscurity.
select test.assert(
  (select count(*) from public.certificates where org_id = :'org_a') = 0,
  'CRITICAL: certificates are invisible even when the org id is known'
);

-- --- Writing into another tenant --------------------------------------------

select test.expect_denied(
  format(
    $$insert into public.certificates (org_id, file_path, named_insured)
      values (%L, 'x.pdf', 'Planted')$$, :'org_a'
  ),
  'planting a certificate in another org'
);
select test.expect_no_rows_affected(
  format($$update public.certificates set named_insured = 'Tampered' where org_id = %L$$, :'org_a'),
  'tampering with another org''s certificate'
);
select test.expect_no_rows_affected(
  format($$delete from public.subcontractors where org_id = %L$$, :'org_a'),
  'deleting another org''s subcontractors'
);
select test.expect_no_rows_affected(
  format($$update public.orgs set name = 'Taken over' where id = %L$$, :'org_a'),
  'renaming another org'
);
select test.expect_no_rows_affected(
  $$update public.certificates set named_insured = 'Tampered'$$,
  'a blanket update reaching another org'
);
select test.expect_no_rows_affected(
  $$delete from public.payments$$,
  'a blanket delete reaching another org'
);

-- --- Storage inherits the same membership rules -----------------------------

select test.assert(
  (select count(*) from storage.objects) = 0,
  'CRITICAL: another org''s stored documents are invisible'
);
select test.expect_denied(
  format(
    $$insert into storage.objects (bucket_id, name) values ('certificates', %L)$$,
    :'org_a' || '/planted.pdf'
  ),
  'writing a document under another org''s storage prefix'
);

-- A path that is not a UUID resolves to no org and is refused rather than defaulting open.
select test.expect_denied(
  $$insert into storage.objects (bucket_id, name) values ('certificates', 'no-org-prefix.pdf')$$,
  'writing a document with no org prefix'
);

-- Ben can write inside his own prefix.
insert into storage.objects (bucket_id, name) values ('certificates', :'org_b' || '/mine.pdf');
select test.assert(
  (select count(*) from storage.objects) = 1,
  'a caller sees exactly their own stored documents'
);

-- --- The matching RPC does not become a side channel ------------------------

select test.assert(
  (select count(*) from public.match_subcontractors(:'org_a', 'KOWALCZYK FRAMING', 10)) = 0,
  'CRITICAL: the matching RPC leaks nothing across tenants'
);

reset role;

-- ---------------------------------------------------------------------------
-- The authorized path works
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select public.invite_org_member(:'org_a', 'cy@northgate.example', 'member') as invited \gset

select test.assert(
  (select count(*) from public.org_members where org_id = :'org_a') = 2,
  'an owner can add a member to their own org'
);

select test.expect_denied(
  format($$select public.invite_org_member(%L, 'nobody@example.com', 'member')$$, :'org_a'),
  'inviting an address with no account'
);
select test.expect_denied(
  format($$select public.invite_org_member(%L, 'cy@northgate.example', 'superuser')$$, :'org_a'),
  'inviting with an unknown role'
);
select test.expect_denied(
  format($$select public.remove_org_member(%L, %L)$$, :'org_a', '11111111-1111-4111-8111-111111111111'),
  'removing the last owner'
);
select test.expect_denied(
  format($$select public.remove_org_member(%L, %L)$$, :'org_b', '22222222-2222-4222-8222-222222222222'),
  'removing a member of an org the caller does not own'
);

reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';

select test.assert(
  (select count(*) from public.certificates) = 1,
  'an invited member sees the org''s certificates'
);
select test.assert(not public.is_org_owner(:'org_a'), 'a member is not an owner');
select test.expect_denied(
  format($$select public.invite_org_member(%L, 'ben@rival.example', 'member')$$, :'org_a'),
  'a plain member inviting someone else'
);
select test.expect_no_rows_affected(
  format($$update public.orgs set name = 'Renamed by a member' where id = %L$$, :'org_a'),
  'a plain member renaming the org'
);
select test.expect_no_rows_affected(
  format($$delete from public.org_members where org_id = %L$$, :'org_a'),
  'a plain member removing memberships'
);

reset role;

-- An owner can remove a member once another owner remains.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select public.remove_org_member(:'org_a', '33333333-3333-4333-8333-333333333333');
select test.assert(
  (select count(*) from public.org_members where org_id = :'org_a') = 1,
  'an owner can remove a member'
);
reset role;

-- ---------------------------------------------------------------------------
-- History cannot be rewritten
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.exposure_snapshots
  (org_id, policy_id, ruleset_id, ruleset_version, total_exposure_cents, added_payroll_cents, detail)
select :'org_a', p.id, 'us-ncci-basic-manual', '2026.1.0', 5282214, 40570000, '[]'::jsonb
from public.policies p where p.org_id = :'org_a' limit 1;

update public.exposure_snapshots set total_exposure_cents = 1, ruleset_version = '9.9.9';
select test.assert(
  (select total_exposure_cents from public.exposure_snapshots limit 1) = 5282214,
  'a saved figure cannot be rewritten, including by a later ruleset'
);
select test.assert(
  (select ruleset_version from public.exposure_snapshots limit 1) = '2026.1.0',
  'a saved figure keeps the ruleset version that produced it'
);

delete from public.exposure_snapshots;
select test.assert(
  (select count(*) from public.exposure_snapshots) = 1,
  'a saved figure cannot be deleted'
);

insert into public.audit_events (org_id, actor, entity_type, action)
values (:'org_a', 'test', 'policy', 'create');

update public.audit_events set action = 'rewritten';
delete from public.audit_events;
select test.assert(
  (select count(*) from public.audit_events where action = 'create') = 1,
  'the audit trail is append-only'
);

-- Everything Ben attempted left Ada's data exactly as it was.
select test.assert(
  (select named_insured from public.certificates limit 1) = 'Kowalczyk Framing & Carpentry LLC',
  'the victim''s certificate is byte-for-byte unchanged after every attempt'
);
select test.assert(
  (select name from public.orgs where id = :'org_a') = 'Northgate Construction',
  'the victim''s org name is unchanged'
);
select test.assert(
  (select count(*) from public.subcontractors where org_id = :'org_a') = 1,
  'the victim''s subcontractors are all still there'
);
select test.assert(
  (select count(*) from storage.objects) = 1,
  'the victim sees only their own stored document, and it survived'
);

reset role;
reset request.jwt.claim.sub;

select 'tenant isolation: all assertions passed' as result;
