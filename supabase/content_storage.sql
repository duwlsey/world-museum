-- Public delivery for museum assets, with uploads and removal restricted to admin1.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'museum-assets',
  'museum-assets',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'application/ogg', 'audio/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view museum assets" on storage.objects;
create policy "Anyone can view museum assets" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'museum-assets');

drop policy if exists "Admin1 can upload museum assets" on storage.objects;
create policy "Admin1 can upload museum assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'museum-assets' and public.is_world_museum_admin1());

drop policy if exists "Admin1 can replace museum assets" on storage.objects;
create policy "Admin1 can replace museum assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'museum-assets' and public.is_world_museum_admin1())
  with check (bucket_id = 'museum-assets' and public.is_world_museum_admin1());

drop policy if exists "Admin1 can delete museum assets" on storage.objects;
create policy "Admin1 can delete museum assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'museum-assets' and public.is_world_museum_admin1());
