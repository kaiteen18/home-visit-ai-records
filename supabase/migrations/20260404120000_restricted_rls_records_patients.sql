-- =============================================================================
-- Restricted RLS: records & patients を「自分の organization のみ」に制限
-- 前提: クライアントはログイン済み JWT（Postgres ロール authenticated）
--       organization_members に user_id = auth.uid() の行があること
-- organization_id列は TEXT（UUID 文字列）想定。members 側 uuid と ::text で突合
-- =============================================================================

-- 旧: anon 向け全開放ポリシーを削除
drop policy if exists "records_insert" on public.records;
drop policy if exists "records_select" on public.records;
drop policy if exists "records_update" on public.records;
drop policy if exists "records_delete" on public.records;

drop policy if exists "patients_select" on public.patients;
drop policy if exists "patients_insert" on public.patients;
drop policy if exists "patients_update" on public.patients;
drop policy if exists "patients_delete" on public.patients;

alter table public.records enable row level security;
alter table public.patients enable row level security;

-- -----------------------------------------------------------------------------
-- records: SELECT / INSERT / UPDATE / DELETE（所属 organization の organization_id のみ）
-- -----------------------------------------------------------------------------
drop policy if exists "records_select_own_org" on public.records;
create policy "records_select_own_org"
  on public.records
  for select
  to authenticated
  using (
    organization_id is not null
    and organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "records_insert_own_org" on public.records;
create policy "records_insert_own_org"
  on public.records
  for insert
  to authenticated
  with check (
    organization_id is not null
    and organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "records_update_own_org" on public.records;
create policy "records_update_own_org"
  on public.records
  for update
  to authenticated
  using (
    organization_id is not null
    and organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  )
  with check (
    organization_id is not null
    and organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "records_delete_own_org" on public.records;
create policy "records_delete_own_org"
  on public.records
  for delete
  to authenticated
  using (
    organization_id is not null
    and organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- patients: SELECT / INSERT / UPDATE / DELETE（所属 organization の organization_id のみ）
-- -----------------------------------------------------------------------------
drop policy if exists "patients_select_own_org" on public.patients;
create policy "patients_select_own_org"
  on public.patients
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "patients_insert_own_org" on public.patients;
create policy "patients_insert_own_org"
  on public.patients
  for insert
  to authenticated
  with check (
    organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "patients_update_own_org" on public.patients;
create policy "patients_update_own_org"
  on public.patients
  for update
  to authenticated
  using (
    organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

drop policy if exists "patients_delete_own_org" on public.patients;
create policy "patients_delete_own_org"
  on public.patients
  for delete
  to authenticated
  using (
    organization_id in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = auth.uid()
    )
  );

comment on policy "records_select_own_org" on public.records is
  '認証ユーザーの所属 organization のレコードのみ参照可';
comment on policy "patients_select_own_org" on public.patients is
  '認証ユーザーの所属 organization の患者のみ参照可';
