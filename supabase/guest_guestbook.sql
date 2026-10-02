-- Guest guestbook notes with per-window, unguessable edit capabilities.
begin;
alter table public.world_museum_notes alter column owner_id drop not null;
alter table public.world_museum_notes drop constraint if exists world_museum_notes_owner_role_check;
alter table public.world_museum_notes add constraint world_museum_notes_owner_role_check check (owner_role in ('student', 'author', 'teacher', 'guest'));

create table if not exists public.world_museum_guest_note_keys (
  note_id uuid primary key references public.world_museum_notes(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null default now() + interval '4 hours'
);
alter table public.world_museum_guest_note_keys enable row level security;
revoke all on public.world_museum_guest_note_keys from public, anon, authenticated;

create or replace function public.wm_stamp_museum_note_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_role = 'guest' and new.owner_id is null then
    new.owner_username := 'GUEST';
    return new;
  end if;
  select p.username, p.role into new.owner_username, new.owner_role from public.profiles p where p.id = (select auth.uid());
  if new.owner_username is null then raise exception 'A valid signed-in profile is required.'; end if;
  new.owner_id := (select auth.uid());
  return new;
end;
$$;

create or replace function public.wm_add_guest_note(p_floor text, p_artist_index smallint, p_book_id uuid, p_body text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.world_museum_notes;
begin
  if p_token is null or length(p_token) < 64 or length(p_token) > 128 then raise exception 'Invalid guest key.'; end if;
  insert into public.world_museum_notes(floor, artist_index, book_id, owner_id, owner_username, owner_role, body)
  values(p_floor, p_artist_index, p_book_id, null, 'GUEST', 'guest', trim(p_body)) returning * into saved;
  insert into public.world_museum_guest_note_keys(note_id, token_hash) values(saved.id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'));
  return to_jsonb(saved);
end;
$$;
create or replace function public.wm_update_guest_note(p_id uuid, p_body text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.world_museum_notes;
begin
  if not exists (select 1 from public.world_museum_guest_note_keys where note_id = p_id and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and expires_at > now()) then raise exception 'Guest editing session has ended.'; end if;
  update public.world_museum_notes set body = trim(p_body), updated_at = now() where id = p_id and owner_role = 'guest' returning * into saved;
  if saved.id is null then raise exception 'Guest note not found.'; end if;
  return to_jsonb(saved);
end;
$$;
create or replace function public.wm_delete_guest_note(p_id uuid, p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.world_museum_guest_note_keys where note_id = p_id and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and expires_at > now()) then raise exception 'Guest editing session has ended.'; end if;
  delete from public.world_museum_notes where id = p_id and owner_role = 'guest';
  return p_id;
end;
$$;
create or replace function public.wm_end_guest_note_session(p_id uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.world_museum_guest_note_keys where note_id = p_id and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
end;
$$;
revoke all on function public.wm_add_guest_note(text, smallint, uuid, text, text) from public;
revoke all on function public.wm_update_guest_note(uuid, text, text) from public;
revoke all on function public.wm_delete_guest_note(uuid, text) from public;
revoke all on function public.wm_end_guest_note_session(uuid, text) from public;
grant execute on function public.wm_add_guest_note(text, smallint, uuid, text, text) to anon;
grant execute on function public.wm_update_guest_note(uuid, text, text) to anon;
grant execute on function public.wm_delete_guest_note(uuid, text) to anon;
grant execute on function public.wm_end_guest_note_session(uuid, text) to anon;
commit;
