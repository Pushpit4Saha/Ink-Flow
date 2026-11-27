-- =========================================================
-- [APP_NAME] — Stages 2–8 database changes
-- Run AFTER 0001_init.sql: SQL Editor -> New query -> paste -> Run
-- Safe to run more than once.
-- =========================================================

-- ---------- settings on the profile (AI, highlight colour) ----------
alter table public.profiles add column if not exists ai_enabled boolean not null default true;
alter table public.profiles add column if not exists ai_language text not null default 'English';
alter table public.profiles add column if not exists highlight_color text not null default '#C5777C';
alter table public.profiles add column if not exists title_font text not null default 'Lobster';
alter table public.profiles add column if not exists body_font text not null default 'Inter';

-- profile row may be missing for users created before 0001 ran
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

-- ---------- faster lookups ----------
create index if not exists notes_user_fp_idx on public.notes (user_id, pdf_fingerprint);
create index if not exists notes_folder_idx on public.notes (folder_id);
create index if not exists note_images_note_idx on public.note_images (note_id);

-- ---------- photos: public-read bucket (file names are random, so links are unguessable) ----------
update storage.buckets set public = true where id = 'note-images';

-- ---------- sharing ----------
-- Is this note inside a folder or tag that its owner shared publicly?
-- (security definer avoids an RLS loop between notes and note_tags)
create or replace function public.note_in_public_collection(p_note_id uuid, p_folder_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shared_collections sc
    where sc.is_public and sc.user_id = p_user_id
      and (
        (sc.folder_id is not null and sc.folder_id = p_folder_id)
        or (sc.tag_id is not null and exists (
              select 1 from note_tags nt where nt.note_id = p_note_id and nt.tag_id = sc.tag_id))
      )
  );
$$;

drop policy if exists "collection read" on public.notes;
create policy "collection read" on public.notes for select
  using (public.note_in_public_collection(id, folder_id, user_id));

drop policy if exists "public read" on public.shared_collections;
create policy "public read" on public.shared_collections for select using (is_public);

drop policy if exists "public read" on public.folders;
create policy "public read" on public.folders for select
  using (exists (select 1 from public.shared_collections sc where sc.is_public and sc.folder_id = folders.id));

drop policy if exists "public read" on public.tags;
create policy "public read" on public.tags for select
  using (exists (select 1 from public.shared_collections sc where sc.is_public and sc.tag_id = tags.id));

drop policy if exists "public tag read" on public.note_tags;
create policy "public tag read" on public.note_tags for select
  using (exists (select 1 from public.shared_collections sc where sc.is_public and sc.tag_id = note_tags.tag_id));

-- images of any note you are allowed to see
drop policy if exists "visible note read" on public.note_images;
create policy "visible note read" on public.note_images for select
  using (exists (select 1 from public.notes n where n.id = note_id));

-- ---------- AI usage (daily limit) ----------
create table if not exists public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists "owner all" on public.ai_usage;
create policy "owner all" on public.ai_usage for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- adds 1 to today's count and returns the new total
create or replace function public.bump_ai_usage()
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  insert into ai_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count into n;
  return n;
end;
$$;

-- ---------- delete my account (Settings page) ----------
-- (the Settings page deletes the user's files through the Storage API first,
--  then calls this; all database rows are removed by "on delete cascade")
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not logged in'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
