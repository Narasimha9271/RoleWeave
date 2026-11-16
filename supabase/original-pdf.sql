-- Run once after the base schema. The bucket is private; users only access their own UUID folder.
alter table public.profiles add column if not exists original_file jsonb;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('resume-originals','resume-originals',false,5242880,array['application/pdf'])
on conflict(id) do nothing;
create policy "read own original resumes" on storage.objects for select to authenticated
using(bucket_id='resume-originals' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "upload own original resumes" on storage.objects for insert to authenticated
with check(bucket_id='resume-originals' and (storage.foldername(name))[1]=(select auth.uid())::text);
