-- ════════════════════════════════════════════════════════════════════
-- AkinsMedia — Supabase Setup
-- Run this in your Supabase SQL Editor after creating your project.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Videos table ──────────────────────────────────────────────────
create table if not exists public.videos (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null,
  description  text        not null default '',
  url          text        not null,
  storage_path text        not null,
  user_id      uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── 2. Row-Level Security ─────────────────────────────────────────────
alter table public.videos enable row level security;

-- All authenticated users can view all videos (LMS model)
create policy "Authenticated users can read videos"
  on public.videos for select
  using (auth.role() = 'authenticated');

-- Any authenticated user can insert — further restricted in the API layer
-- (the upload API already checks for admin status before inserting)
create policy "Authenticated users can insert videos"
  on public.videos for insert
  with check (auth.uid() = user_id);

-- Users can delete only their own videos
create policy "Users can delete own videos"
  on public.videos for delete
  using (auth.uid() = user_id);

-- ── 3. Storage bucket ────────────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → New bucket:
--   Name:    training-videos
--   Public:  true  (so videos can be streamed without signed URLs)
--
-- Or via SQL (requires pg_net extension):
-- insert into storage.buckets (id, name, public)
-- values ('training-videos', 'training-videos', true)
-- on conflict (id) do nothing;

-- Storage RLS — allow authenticated users to read (for playback)
create policy "Public read for training videos"
  on storage.objects for select
  using (bucket_id = 'training-videos');

-- Allow authenticated users to upload (API layer enforces admin-only)
create policy "Authenticated upload for training videos"
  on storage.objects for insert
  with check (bucket_id = 'training-videos' and auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════════════
-- After running this SQL:
--  1. Go to Supabase → Authentication → Providers and enable Email
--  2. (Optional) Disable email confirmation for local dev:
--     Authentication → Settings → Disable "Confirm email"
--  3. Copy SUPABASE_URL and SUPABASE_ANON_KEY from
--     Settings → API into your .env file
--  4. Set ADMIN_EMAIL to admin@akinsmedia.com in your .env file
--  5. (Optional) Add RESEND_API_KEY from resend.com for email alerts
-- ════════════════════════════════════════════════════════════════════
