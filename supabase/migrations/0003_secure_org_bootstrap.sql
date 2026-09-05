-- Close a tenant-isolation hole in the initial org bootstrap flow.
--
-- 0001 allowed any authenticated user to insert a row for themselves into
-- org_members for any org_id. Because every tenant policy trusts is_org_member(),
-- that made possession of another org UUID sufficient to self-join that tenant.
--
-- Org creation now goes through one SECURITY DEFINER function that atomically
-- creates the org and its owner membership for auth.uid(). Direct client-side
-- inserts into orgs/org_members are no longer allowed for bootstrap.

drop policy if exists org_members_self_insert on public.org_members;
drop policy if exists orgs_insert_any_authenticated on public.orgs;

create or replace function public.create_org_for_current_user(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_org_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if org_name is null or length(btrim(org_name)) = 0 then
    raise exception 'organization name is required';
  end if;

  insert into public.orgs (name)
  values (btrim(org_name))
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, current_user_id, 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_org_for_current_user(text) from public;
grant execute on function public.create_org_for_current_user(text) to authenticated;
