-- =============================================================================
-- Auth + organization_members 基盤（アプリは anon + ユーザーセッションで接続）
-- RLS を restricted にしたとき: auth.uid() と organization_members で行を制限する
-- =============================================================================

-- 既存の organizations が無い場合の例（既にある場合はスキップまたは ALTER のみ）
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 公開プロフィール（auth.users のミラー。表示名など）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ユーザー ↔ 組織（1ユーザー1組織の例。複数組織なら UNIQUE(user_id) を外す）
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

create index if not exists organization_members_org_id_idx
  on public.organization_members (organization_id);

-- 新規サインアップ時に profiles を自動作成（任意）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS（restricted 運用の例）
-- 開発中は Supabase で「RLS を一時的に緩める」場合はポリシーを調整すること
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

-- profiles: 本人のみ読み取り・更新
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- organization_members: 自分の行のみ参照可能（アプリが org を解決する用途）
drop policy if exists "organization_members_select_own" on public.organization_members;
create policy "organization_members_select_own"
  on public.organization_members for select
  using (user_id = auth.uid());

-- 管理者用の INSERT は service_role または Dashboard のみ想定の場合、anon には付けない
-- 例: service_role のみバイパス（Supabase 既定）

-- patients / records は既存テーブル想定。方針例:
-- organization_id = ユーザーの所属組織に限定
/*
alter table public.patients enable row level security;
create policy "patients_org_access"
  on public.patients for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

alter table public.records enable row level security;
create policy "records_org_access"
  on public.records for all
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );
*/

comment on table public.organization_members is
  'ログインユーザーと organization の対応。アプリの requireAuth が参照する。';
