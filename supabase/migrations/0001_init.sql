-- =========================================================
-- [APP_NAME] — initial database schema
-- Run this whole file once in Supabase: SQL Editor -> New query -> paste -> Run
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- auto-create a profile row whenever a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- folders ----------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade,
  color text,
  created_at timestamptz not null default now()
);

-- ---------- tags ----------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  unique (user_id, name)
);

-- ---------- notes ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  title text not null,                       -- the selected text
  body_json jsonb,                           -- rich text (Tiptap JSON) — used from Stage 2
  body_text text not null default '',        -- plain text of the note
  source_type text not null default 'web' check (source_type in ('web','pdf_online','pdf_local')),
  source_url text,
  page_title text,
  favicon_url text,
  pdf_fingerprint text,
  pdf_page_number int,
  anchor jsonb,                              -- {exact, prefix, suffix, start, end} for re-highlighting
  context_sentence text,
  highlight_color text default '#FFE58F',
  is_public boolean not null default false,
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body_text,''))
  ) stored
);

create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);
create index if not exists notes_user_url_idx on public.notes (user_id, source_url);
create index if not exists notes_search_idx on public.notes using gin (search);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------- note_tags ----------
create table if not exists public.note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

-- ---------- note_images ----------
create table if not exists public.note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null,
  width int,
  height int,
  created_at timestamptz not null default now()
);

-- ---------- pdf_files ----------
create table if not exists public.pdf_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null,
  fingerprint text,
  file_name text,
  created_at timestamptz not null default now()
);

-- ---------- shared_collections ----------
create table if not exists public.shared_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  share_slug text not null unique,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Row Level Security: every user sees only their own data
-- =========================================================
alter table public.profiles           enable row level security;
alter table public.folders            enable row level security;
alter table public.tags               enable row level security;
alter table public.notes              enable row level security;
alter table public.note_tags          enable row level security;
alter table public.note_images        enable row level security;
alter table public.pdf_files          enable row level security;
alter table public.shared_collections enable row level security;

-- profiles
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- simple owner-only tables
do $$
declare t text;
begin
  foreach t in array array['folders','tags','note_images','pdf_files','shared_collections'] loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format(
      'create policy "owner all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- notes: owner can do everything; anyone can read public notes
drop policy if exists "owner all" on public.notes;
create policy "owner all" on public.notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "public read" on public.notes;
create policy "public read" on public.notes for select using (is_public = true);

-- note_tags: allowed if you own the note
drop policy if exists "owner via note" on public.note_tags;
create policy "owner via note" on public.note_tags for all
  using (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from public.notes n where n.id = note_id and n.user_id = auth.uid()));

-- =========================================================
-- Storage buckets (for photos in Stage 2 and PDFs in Stage 4)
-- Files are stored under "<user_id>/..." so each user only touches their own folder
-- =========================================================
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', false), ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

drop policy if exists "own files read" on storage.objects;
create policy "own files read" on storage.objects for select
  using (bucket_id in ('note-images','pdfs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files write" on storage.objects;
create policy "own files write" on storage.objects for insert
  with check (bucket_id in ('note-images','pdfs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files update" on storage.objects;
create policy "own files update" on storage.objects for update
  using (bucket_id in ('note-images','pdfs') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own files delete" on storage.objects;
create policy "own files delete" on storage.objects for delete
  using (bucket_id in ('note-images','pdfs') and (storage.foldername(name))[1] = auth.uid()::text);
