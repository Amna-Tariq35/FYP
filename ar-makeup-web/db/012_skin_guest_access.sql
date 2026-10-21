-- ============================================================================
-- Guest skin reports: stop table-wide anon access
-- ============================================================================
-- Idempotent. Run in the Supabase SQL editor.
--
-- 004 let anon and authenticated clients SELECT and UPDATE every
-- skin_analysis_logs row whose user_id is null. That is the whole guest
-- table, not one unguessable id. Drop those policies.
--
-- Signed-in rows stay owner-only. Guest rows are not listed or updated by
-- the public client. The app reads and updates one report by id on the
-- server with the service role.
-- Photos stay unset (image_url is null). This file does not add a guest token.

alter table public.skin_analysis_logs enable row level security;

drop policy if exists "skin_analysis_logs: owner or guest read" on public.skin_analysis_logs;
drop policy if exists "skin_analysis_logs: owner or guest update" on public.skin_analysis_logs;

drop policy if exists "skin_analysis_logs: owner read" on public.skin_analysis_logs;
create policy "skin_analysis_logs: owner read"
  on public.skin_analysis_logs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "skin_analysis_logs: owner update" on public.skin_analysis_logs;
create policy "skin_analysis_logs: owner update"
  on public.skin_analysis_logs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
