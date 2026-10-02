-- World Museum account foundation.
-- Run this in Supabase SQL Editor before enabling the app's Supabase auth flow.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  role text not null default 'student' check (role in ('teacher', 'author', 'student')),
  security_question text not null,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9]+$')
);

-- Remove the earlier prototype's collected nickname; display labels are derived from role and username.
alter table public.profiles drop column if exists nickname;

create table if not exists private.recovery_answers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answer_hash text not null
);
alter table private.recovery_answers enable row level security;
revoke all on private.recovery_answers from public, anon, authenticated;

create table if not exists private.auth_attempts (
  username text primary key,
  login_failures integer not null default 0,
  login_window_started_at timestamptz not null default now(),
  login_locked_until timestamptz,
  recovery_failures integer not null default 0,
  recovery_window_started_at timestamptz not null default now(),
  recovery_locked_until timestamptz
);
alter table private.auth_attempts enable row level security;
revoke all on private.auth_attempts from public, anon, authenticated;

create table if not exists public.site_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (setting_key, setting_value)
values ('support_email', 'duwlsey@naver.com')
on conflict (setting_key) do nothing;
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select, update on public.site_settings to authenticated;
grant select, update on public.site_settings to service_role;

drop trigger if exists on_world_museum_auth_user_created on auth.users;
drop function if exists private.create_world_museum_profile();

create or replace function public.is_world_museum_admin1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and username = 'admin1' and role = 'teacher'
  );
$$;
revoke all on function public.is_world_museum_admin1() from public, anon;
grant execute on function public.is_world_museum_admin1() to authenticated;

drop policy if exists "Admin1 can read site settings" on public.site_settings;
drop policy if exists "Admin1 can update site settings" on public.site_settings;
create policy "Admin1 can read site settings" on public.site_settings
  for select to authenticated using (public.is_world_museum_admin1());
create policy "Admin1 can update site settings" on public.site_settings
  for update to authenticated
  using (public.is_world_museum_admin1())
  with check (public.is_world_museum_admin1());

create or replace function public.world_museum_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(coalesce(candidate, ''))) ~ '^[a-z0-9]+$'
    and lower(trim(candidate)) not in ('admin1', 'admin2')
    and not exists (
      select 1 from public.profiles where username = lower(trim(candidate))
    );
$$;
revoke all on function public.world_museum_username_available(text) from public;
grant execute on function public.world_museum_username_available(text) to anon, authenticated, service_role;

create or replace function public.world_museum_username_exists(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where username = lower(trim(coalesce(candidate, '')))
  );
$$;
revoke all on function public.world_museum_username_exists(text) from public;
grant execute on function public.world_museum_username_exists(text) to anon, authenticated, service_role;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, update on public.profiles to service_role;
drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Admin1 can read account profiles" on public.profiles;
drop policy if exists "Admin1 can update account roles" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Admin1 can read account profiles" on public.profiles
  for select to authenticated using (public.is_world_museum_admin1());
create policy "Admin1 can update account roles" on public.profiles
  for update to authenticated
  using (public.is_world_museum_admin1())
  with check (public.is_world_museum_admin1());

comment on table public.profiles is 'Minimal account profile; passwords are managed only by Supabase Auth.';
comment on table private.recovery_answers is 'Password-hashed security answers; never exposed through the Data API.';
comment on table private.auth_attempts is 'Server-only rate-limit state for login and recovery flows.';

create table if not exists private.recovery_requests (
  username text primary key,
  last_sent_at timestamptz not null
);
alter table private.recovery_requests enable row level security;
revoke all on private.recovery_requests from public, anon, authenticated;

create or replace function public.wm_create_student_profile(p_user_id uuid, p_username text, p_question text, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text := lower(trim(coalesce(p_username, '')));
  normalized_answer text := lower(regexp_replace(coalesce(p_answer, ''), '\s+', '', 'g'));
begin
  if normalized_username !~ '^[a-z0-9]+$' or normalized_username in ('admin1', 'admin2') then
    raise exception 'Invalid username.';
  end if;
  if trim(coalesce(p_question, '')) = '' or normalized_answer = '' then
    raise exception 'Security question and answer are required.';
  end if;
  insert into public.profiles (id, username, role, security_question)
  values (p_user_id, normalized_username, 'student', trim(p_question));
  insert into private.recovery_answers (user_id, answer_hash)
  values (p_user_id, extensions.crypt(normalized_answer, extensions.gen_salt('bf', 12)));
end;
$$;
revoke all on function public.wm_create_student_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.wm_create_student_profile(uuid, text, text, text) to service_role;

create or replace function public.wm_login_is_locked(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select login_locked_until > now() from private.auth_attempts where username = lower(trim(p_username))), false);
$$;
revoke all on function public.wm_login_is_locked(text) from public, anon, authenticated;
grant execute on function public.wm_login_is_locked(text) to service_role;

create or replace function public.wm_record_login_failure(p_username text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_username text := lower(trim(p_username));
declare result_lock timestamptz;
begin
  insert into private.auth_attempts(username, login_failures, login_window_started_at, login_locked_until)
  values (normalized_username, 1, now(), null)
  on conflict(username) do update set
    login_failures = case when private.auth_attempts.login_window_started_at < now() - interval '15 minutes' then 1 else private.auth_attempts.login_failures + 1 end,
    login_window_started_at = case when private.auth_attempts.login_window_started_at < now() - interval '15 minutes' then now() else private.auth_attempts.login_window_started_at end,
    login_locked_until = case
      when private.auth_attempts.login_window_started_at < now() - interval '15 minutes' then null
      when private.auth_attempts.login_failures + 1 >= 5 then now() + interval '15 minutes'
      else private.auth_attempts.login_locked_until
    end
  returning login_locked_until into result_lock;
  return result_lock;
end;
$$;
revoke all on function public.wm_record_login_failure(text) from public, anon, authenticated;
grant execute on function public.wm_record_login_failure(text) to service_role;

create or replace function public.wm_clear_login_failures(p_username text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.auth_attempts set login_failures = 0, login_locked_until = null, login_window_started_at = now()
  where username = lower(trim(p_username));
$$;
revoke all on function public.wm_clear_login_failures(text) from public, anon, authenticated;
grant execute on function public.wm_clear_login_failures(text) to service_role;

create or replace function public.wm_recovery_question(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select security_question from public.profiles where username = lower(trim(p_username));
$$;
revoke all on function public.wm_recovery_question(text) from public, anon, authenticated;
grant execute on function public.wm_recovery_question(text) to service_role;

create or replace function public.wm_verify_recovery_answer(p_username text, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text := lower(trim(p_username));
  target_user uuid;
  answer_hash text;
  failed_count integer;
  locked_until timestamptz;
  normalized_answer text := lower(regexp_replace(coalesce(p_answer, ''), '\s+', '', 'g'));
begin
  insert into private.auth_attempts(username) values (normalized_username) on conflict do nothing;
  select recovery_locked_until into locked_until from private.auth_attempts where username = normalized_username;
  if locked_until is not null and locked_until > now() then return 'locked'; end if;
  select p.id, r.answer_hash into target_user, answer_hash
    from public.profiles p join private.recovery_answers r on r.user_id = p.id
    where p.username = normalized_username;
  if target_user is null then return 'not_found'; end if;
  if extensions.crypt(normalized_answer, answer_hash) = answer_hash then
    update private.auth_attempts set recovery_failures = 0, recovery_locked_until = null, recovery_window_started_at = now()
      where username = normalized_username;
    return 'verified';
  end if;
  update private.auth_attempts set
    recovery_failures = case when recovery_window_started_at < now() - interval '30 minutes' then 1 else recovery_failures + 1 end,
    recovery_window_started_at = case when recovery_window_started_at < now() - interval '30 minutes' then now() else recovery_window_started_at end,
    recovery_locked_until = case
      when recovery_window_started_at < now() - interval '30 minutes' then null
      when recovery_failures + 1 >= 5 then now() + interval '30 minutes'
      else recovery_locked_until
    end
  where username = normalized_username
  returning recovery_failures, recovery_locked_until into failed_count, locked_until;
  if locked_until is not null and locked_until > now() then return 'locked'; end if;
  return 'incorrect';
end;
$$;
revoke all on function public.wm_verify_recovery_answer(text, text) from public, anon, authenticated;
grant execute on function public.wm_verify_recovery_answer(text, text) to service_role;

create or replace function public.wm_recovery_email_allowed(p_username text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select not exists (select 1 from private.recovery_requests where username = lower(trim(p_username)) and last_sent_at > now() - interval '1 hour');
$$;
revoke all on function public.wm_recovery_email_allowed(text) from public, anon, authenticated;
grant execute on function public.wm_recovery_email_allowed(text) to service_role;

create or replace function public.wm_mark_recovery_email_sent(p_username text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.recovery_requests(username, last_sent_at) values (lower(trim(p_username)), now())
  on conflict(username) do update set last_sent_at = now();
$$;
revoke all on function public.wm_mark_recovery_email_sent(text) from public, anon, authenticated;
grant execute on function public.wm_mark_recovery_email_sent(text) to service_role;
