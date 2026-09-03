-- Storage for the documents behind every figure.
--
-- Two buckets, both private. Objects are keyed by org id as the first path segment
-- (`<org_id>/<uuid>.pdf`) and the policies below refuse anything else, so a signed URL
-- can only ever be minted for a file inside the caller's own org.

insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('ledger-imports', 'ledger-imports', false)
on conflict (id) do nothing;

create or replace function public.storage_path_org(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return (split_part(object_name, '/', 1))::uuid;
exception
  when others then return null;
end;
$$;

create policy "org members read their own documents"
  on storage.objects for select
  using (
    bucket_id in ('certificates', 'ledger-imports')
    and public.is_org_member(public.storage_path_org(name))
  );

create policy "org members write their own documents"
  on storage.objects for insert
  with check (
    bucket_id in ('certificates', 'ledger-imports')
    and public.is_org_member(public.storage_path_org(name))
  );

create policy "org members replace their own documents"
  on storage.objects for update
  using (
    bucket_id in ('certificates', 'ledger-imports')
    and public.is_org_member(public.storage_path_org(name))
  );
