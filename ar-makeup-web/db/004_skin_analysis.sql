-- ============================================================================
-- Skin analysis hardening
-- ============================================================================
-- Idempotent. Run in the Supabase SQL editor.
--
-- The app stores engine, confidence and concern scores inside
-- skin_analysis_logs.concern_scores, so it still works before this file is
-- applied. These policies stop a logged-in user's report from being readable
-- by every visitor, while guest reports stay available by their unguessable id.

alter table public.skin_analysis_logs
  add column if not exists engine text,
  add column if not exists confidence text,
  add column if not exists schema_version smallint default 2,
  add column if not exists routine_status text;

alter table public.skin_analysis_logs enable row level security;

drop policy if exists "skin_analysis_logs: owner or guest read" on public.skin_analysis_logs;
create policy "skin_analysis_logs: owner or guest read"
  on public.skin_analysis_logs
  for select
  to anon, authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())
  );

drop policy if exists "skin_analysis_logs: owner or guest insert" on public.skin_analysis_logs;
create policy "skin_analysis_logs: owner or guest insert"
  on public.skin_analysis_logs
  for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );

drop policy if exists "skin_analysis_logs: owner or guest update" on public.skin_analysis_logs;
create policy "skin_analysis_logs: owner or guest update"
  on public.skin_analysis_logs
  for update
  to anon, authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())
  )
  with check (
    user_id is null
    or user_id = (select auth.uid())
  );

-- New scans no longer store a photo. Clear old public URLs.
update public.skin_analysis_logs
   set image_url = null
 where image_url is not null;
