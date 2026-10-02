-- Shared World Museum content. Existing test/localStorage data is intentionally
-- not migrated; this creates clean shared storage for the next app version.

create or replace function public.is_world_museum_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;
revoke all on function public.is_world_museum_teacher() from public, anon;
grant execute on function public.is_world_museum_teacher() to authenticated;

create table if not exists public.world_museum_site_content (
  id integer primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.world_museum_site_content (id, payload)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
alter table public.world_museum_site_content enable row level security;
revoke all on public.world_museum_site_content from public;
grant select on public.world_museum_site_content to anon, authenticated;
grant update on public.world_museum_site_content to authenticated;
drop policy if exists "Anyone can read museum site content" on public.world_museum_site_content;
create policy "Anyone can read museum site content" on public.world_museum_site_content
  for select to anon, authenticated using (true);
drop policy if exists "Admin1 can update museum site content" on public.world_museum_site_content;
create policy "Admin1 can update museum site content" on public.world_museum_site_content
  for update to authenticated using (public.is_world_museum_admin1())
  with check (public.is_world_museum_admin1());

create table if not exists public.world_museum_books (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.world_museum_books enable row level security;
revoke all on public.world_museum_books from public;
grant select on public.world_museum_books to anon, authenticated;
grant insert, update, delete on public.world_museum_books to authenticated;
drop policy if exists "Anyone can read published museum books" on public.world_museum_books;
create policy "Anyone can read published museum books" on public.world_museum_books
  for select to anon, authenticated using (true);
drop policy if exists "Owners can publish museum books" on public.world_museum_books;
create policy "Owners can publish museum books" on public.world_museum_books
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Owners and teachers can update museum books" on public.world_museum_books;
create policy "Owners and teachers can update museum books" on public.world_museum_books
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_world_museum_teacher())
  with check (owner_id = (select auth.uid()) or public.is_world_museum_teacher());
drop policy if exists "Owners and teachers can delete museum books" on public.world_museum_books;
create policy "Owners and teachers can delete museum books" on public.world_museum_books
  for delete to authenticated using (public.is_world_museum_admin1());

create table if not exists public.world_museum_notes (
  id uuid primary key default gen_random_uuid(),
  floor text not null check (floor in ('3f', '4f')),
  artist_index smallint check (artist_index between 0 and 2),
  book_id uuid references public.world_museum_books(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_username text not null,
  owner_role text not null check (owner_role in ('student', 'author', 'teacher')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_museum_note_target check (
    (floor = '3f' and artist_index is not null and book_id is null)
    or (floor = '4f' and artist_index is null and book_id is not null)
  )
);
alter table public.world_museum_notes enable row level security;
revoke all on public.world_museum_notes from public;
grant select on public.world_museum_notes to anon, authenticated;
grant insert, update, delete on public.world_museum_notes to authenticated;
drop policy if exists "Anyone can read museum notes" on public.world_museum_notes;
create policy "Anyone can read museum notes" on public.world_museum_notes
  for select to anon, authenticated using (true);
drop policy if exists "Signed-in users can add their own notes" on public.world_museum_notes;
create policy "Signed-in users can add their own notes" on public.world_museum_notes
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "Owners and teachers can edit museum notes" on public.world_museum_notes;
create policy "Owners and teachers can edit museum notes" on public.world_museum_notes
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_world_museum_teacher())
  with check (owner_id = (select auth.uid()) or public.is_world_museum_teacher());
drop policy if exists "Owners and teachers can delete museum notes" on public.world_museum_notes;
create policy "Owners and teachers can delete museum notes" on public.world_museum_notes
  for delete to authenticated using (owner_id = (select auth.uid()) or public.is_world_museum_teacher());

create or replace function public.wm_stamp_museum_note_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.username, p.role into new.owner_username, new.owner_role
  from public.profiles p where p.id = (select auth.uid());
  if new.owner_username is null then raise exception 'A valid signed-in profile is required.'; end if;
  new.owner_id := (select auth.uid());
  return new;
end;
$$;
revoke all on function public.wm_stamp_museum_note_author() from public, anon, authenticated;
drop trigger if exists stamp_world_museum_note_author on public.world_museum_notes;
create trigger stamp_world_museum_note_author
  before insert on public.world_museum_notes
  for each row execute function public.wm_stamp_museum_note_author();
