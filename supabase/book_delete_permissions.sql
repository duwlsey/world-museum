-- Restrict published-book deletion to the museum administrator.
-- Student owners retain update access; guestbook policies remain unchanged.
drop policy if exists "Owners and teachers can delete museum books" on public.world_museum_books;
create policy "Owners and teachers can delete museum books" on public.world_museum_books
  for delete to authenticated using (public.is_world_museum_admin1());
