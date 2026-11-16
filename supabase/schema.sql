create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 resume text not null default '',
 filename text not null default '',
 repos jsonb not null default '[]'::jsonb
);
create table public.applications (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 company text not null,
 role text not null,
 jd text not null,
 original text not null,
 result jsonb not null,
 template text not null default 'modern',
 status text not null default 'Draft' check(status in ('Draft','Applied','Interview','Offer','Closed')),
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
create policy "own profile" on public.profiles for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "own applications" on public.applications for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index applications_user_created on public.applications(user_id,created_at desc);

-- Explicit access for signed-in users; RLS still limits every row to its owner.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.applications to authenticated;
revoke all on public.profiles, public.applications from anon;
