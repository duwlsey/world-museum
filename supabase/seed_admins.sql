-- Run after creating both Auth users in Supabase Dashboard.
-- Expected Auth emails: admin1@accounts.worldmuseum.invalid and admin2@accounts.worldmuseum.invalid
insert into public.profiles (id, username, role, security_question)
select
  id,
  lower(split_part(email, '@', 1)),
  'teacher',
  'Administrator-managed account'
from auth.users
where lower(email) in (
  'admin1@accounts.worldmuseum.invalid',
  'admin2@accounts.worldmuseum.invalid'
)
on conflict (username) do update
set role = 'teacher';
