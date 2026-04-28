-- =============================================================================
-- Admin organization management
-- - Admins can create organizations.
-- - Initial admin is linked when an organization is created.
-- - Admins can add/update members for any organization.
--
-- Current schema has UNIQUE(user_id) on organization_members, so adding a user
-- to a different organization moves that user to the selected organization.
-- =============================================================================

create or replace function public.admin_is_any_organization_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.user_id = auth.uid()
      and om.role = 'admin'
  );
$$;

revoke all on function public.admin_is_any_organization_admin() from public;
grant execute on function public.admin_is_any_organization_admin() to authenticated;

create or replace function public.admin_list_organizations()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  admin_count bigint,
  member_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.admin_is_any_organization_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    o.id,
    o.name,
    o.created_at,
    count(om.user_id) filter (where om.role = 'admin') as admin_count,
    count(om.user_id) as member_count
  from public.organizations o
  left join public.organization_members om
    on om.organization_id = o.id
  group by o.id, o.name, o.created_at
  order by o.created_at desc;
end;
$$;

revoke all on function public.admin_list_organizations() from public;
grant execute on function public.admin_list_organizations() to authenticated;

create or replace function public.admin_create_organization(
  p_name text,
  p_admin_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if not public.admin_is_any_organization_admin() then
    raise exception 'not_admin';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;

  insert into public.organizations (name)
  values (trim(p_name))
  returning id into v_org_id;

  insert into public.organization_members (user_id, organization_id, role)
  values (p_admin_user_id, v_org_id, 'admin')
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        role = 'admin';

  return v_org_id;
end;
$$;

revoke all on function public.admin_create_organization(text, uuid) from public;
grant execute on function public.admin_create_organization(text, uuid) to authenticated;

create or replace function public.admin_list_organization_members(
  p_organization_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  organization_id uuid,
  role text,
  created_at timestamptz,
  display_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.admin_is_any_organization_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    om.id,
    om.user_id,
    om.organization_id,
    om.role,
    om.created_at,
    p.display_name
  from public.organization_members om
  left join public.profiles p
    on p.id = om.user_id
  where om.organization_id = p_organization_id
  order by om.created_at asc;
end;
$$;

revoke all on function public.admin_list_organization_members(uuid) from public;
grant execute on function public.admin_list_organization_members(uuid) to authenticated;

create or replace function public.admin_upsert_member_for_organization(
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
  v_exists boolean;
begin
  if not public.admin_is_any_organization_admin() then
    raise exception 'not_admin';
  end if;

  if p_role is null or p_role not in ('member', 'admin') then
    raise exception 'invalid_role';
  end if;

  select exists(
    select 1 from public.organizations o where o.id = p_organization_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'organization_not_found';
  end if;

  insert into public.organization_members (user_id, organization_id, role)
  values (p_user_id, p_organization_id, p_role)
  on conflict (user_id) do update
    set organization_id = excluded.organization_id,
        role = excluded.role;
end;
$$;

revoke all on function public.admin_upsert_member_for_organization(uuid, uuid, text) from public;
grant execute on function public.admin_upsert_member_for_organization(uuid, uuid, text) to authenticated;

comment on function public.admin_create_organization(text, uuid) is
  'Admin creates an organization and links the initial admin user.';
comment on function public.admin_upsert_member_for_organization(uuid, uuid, text) is
  'Admin adds or updates a member for a selected organization.';
