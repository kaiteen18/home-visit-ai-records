-- RLS: org members visibility, admin CRUD, org + profiles read for same org
-- SECURITY DEFINER RPC: admin upsert member (1 user = 1 org via unique user_id)

alter table public.organizations enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  using (
    id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "organization_members_select_same_org" on public.organization_members;
create policy "organization_members_select_same_org"
  on public.organization_members for select
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "organization_members_insert_admin" on public.organization_members;
create policy "organization_members_insert_admin"
  on public.organization_members for insert
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'admin'
    )
  );

drop policy if exists "organization_members_update_admin" on public.organization_members;
create policy "organization_members_update_admin"
  on public.organization_members for update
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'admin'
    )
  )
  with check (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'admin'
    )
  );

drop policy if exists "organization_members_delete_admin" on public.organization_members;
create policy "organization_members_delete_admin"
  on public.organization_members for delete
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'admin'
    )
  );

drop policy if exists "profiles_select_same_org_peers" on public.profiles;
create policy "profiles_select_same_org_peers"
  on public.profiles for select
  using (
    id in (
      select om.user_id from public.organization_members om
      where om.organization_id in (
        select organization_id from public.organization_members
        where user_id = auth.uid()
      )
    )
  );

create or replace function public.admin_upsert_organization_member(
  p_user_id uuid,
  p_organization_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_org uuid;
begin
  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'invalid_role';
  end if;

  select om.organization_id
  into v_admin_org
  from public.organization_members om
  where om.user_id = auth.uid()
    and om.role = 'admin'
  limit 1;

  if v_admin_org is null then
    raise exception 'not_admin';
  end if;

  if p_organization_id is distinct from v_admin_org then
    raise exception 'org_mismatch';
  end if;

  insert into public.organization_members (user_id, organization_id, role)
  values (p_user_id, p_organization_id, p_role)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        role = excluded.role;
end;
$$;

revoke all on function public.admin_upsert_organization_member(uuid, uuid, text) from public;
grant execute on function public.admin_upsert_organization_member(uuid, uuid, text) to authenticated;

comment on function public.admin_upsert_organization_member is
  'Admin adds or updates a member in their organization (single membership per user).';

create or replace function public.admin_lookup_user_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  select exists(
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role = 'admin'
  )
  into v_is_admin;

  if not v_is_admin then
    raise exception 'not_admin';
  end if;

  select u.id
  into v_uid
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  return v_uid;
end;
$$;

revoke all on function public.admin_lookup_user_by_email(text) from public;
grant execute on function public.admin_lookup_user_by_email(text) to authenticated;

comment on function public.admin_lookup_user_by_email is
  'Admin resolves auth.users.id from email.';
