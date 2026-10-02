-- Save the original account ID in legacy book publication metadata.
update public.world_museum_books b
set payload = jsonb_set(b.payload, '{ownerUsername}', to_jsonb(p.username))
from public.profiles p
where p.id = b.owner_id and coalesce(b.payload->>'ownerUsername', '') = '';