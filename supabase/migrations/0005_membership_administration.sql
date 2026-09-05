-- An authorized path for membership changes.
--
-- 0003 closed the hole that let any authenticated user insert themselves into any org by
-- dropping the self-insert policy and routing org creation through a SECURITY DEFINER
-- function. That was the right fix, but it left no way to add a second person to an org at
-- all: with no INSERT, UPDATE or DELETE policy on org_members, every membership change was
-- denied outright.
--
-- This adds the missing path and keeps it narrow. Membership changes go through functions
-- that check the caller is an owner of the org being changed. There is still no client-side
-- INSERT policy on org_members, so possession of an org UUID remains worth nothing.

-- Owner check, SECURITY DEFINER for the same reason is_org_member is: the policies below
-- would otherwise recurse through org_members' own policy.
create or replace function public.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members
    where org_id = target_org and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_org_owner(uuid) from public;
grant execute on function public.is_org_owner(uuid) to authenticated;

-- Renaming the org is an owner's decision, not any member's.
drop policy if exists orgs_member_write on public.orgs;
create policy orgs_owner_write on public.orgs
  for update using (public.is_org_owner(id)) with check (public.is_org_owner(id));

-- Owners may see and remove memberships in their own org. There is deliberately no INSERT
-- policy: joining an org happens through invite_org_member below, which checks the caller.
drop policy if exists org_members_owner_delete on public.org_members;
create policy org_members_owner_delete on public.org_members
  for delete using (public.is_org_owner(org_id));

drop policy if exists org_members_owner_update on public.org_members;
create policy org_members_owner_update on public.org_members
  for update using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- Membership administration
-- ---------------------------------------------------------------------------

-- Add an existing account to an org. Only an owner of that org may call it, and the
-- caller cannot use it to add themselves anywhere they are not already an owner.
create or replace function public.invite_org_member(
  target_org uuid,
  member_email text,
  member_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_owner(target_org) then
    raise exception 'only an owner of this organization may add members';
  end if;

  if member_role not in ('owner', 'member') then
    raise exception 'role must be owner or member';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(btrim(member_email))
  limit 1;

  if target_user_id is null then
    raise exception 'no account exists for that email address';
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (target_org, target_user_id, member_role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  return target_user_id;
end;
$$;

revoke all on function public.invite_org_member(uuid, text, text) from public;
grant execute on function public.invite_org_member(uuid, text, text) to authenticated;

-- Remove a member. An org must always keep at least one owner, or its data becomes
-- unreachable and unadministrable.
create or replace function public.remove_org_member(target_org uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_owners integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_owner(target_org) then
    raise exception 'only an owner of this organization may remove members';
  end if;

  select count(*) into remaining_owners
  from public.org_members
  where org_id = target_org and role = 'owner' and user_id <> target_user;

  if remaining_owners = 0 then
    raise exception 'an organization must keep at least one owner';
  end if;

  delete from public.org_members where org_id = target_org and user_id = target_user;
end;
$$;

revoke all on function public.remove_org_member(uuid, uuid) from public;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;

comment on function public.invite_org_member(uuid, text, text) is
  'The only path by which an account joins an existing organization. Callers must already be an owner of that organization; there is no client-side INSERT policy on org_members.';

-- Bootstrap stays authenticated-only. Stated again here so a later grant cannot widen it
-- silently: an anonymous caller has no auth.uid() and the function raises regardless, but
-- the privilege should not be there in the first place.
revoke all on function public.create_org_for_current_user(text) from public, anon;
grant execute on function public.create_org_for_current_user(text) to authenticated;
