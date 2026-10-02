-- Extend the existing assets bucket to accept administrator-uploaded music.
update storage.buckets
set allowed_mime_types = array(select distinct mime from unnest(coalesce(allowed_mime_types, array['image/jpeg','image/png','image/webp','application/pdf']) || array['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg','application/ogg','audio/webm']) as mime)
where id = 'museum-assets';
select id, file_size_limit, allowed_mime_types from storage.buckets where id='museum-assets';