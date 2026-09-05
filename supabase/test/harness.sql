-- Minimal stand-ins for the Supabase-managed objects the migrations depend on.
--
-- This exists so the row-level security policies can be exercised against a real Postgres
-- in CI and locally, without a Supabase project. It creates only what the migrations
-- reference: the auth and storage schemas, auth.uid(), and the three Supabase roles.
--
-- It is never applied to a real database — supabase/migrations is the deployed set.

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the subject out of the request's JWT claims. In tests the same value is
-- set with `set local request.jwt.claim.sub = '<uuid>'`, and left unset for an
-- unauthenticated caller.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name      text not null,
  owner     uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant select on auth.users to authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Supabase grants table privileges to the API roles; RLS is what actually constrains them.
alter default privileges in schema public grant all on tables to anon, authenticated;
