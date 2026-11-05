-- ============================================================================
-- Close anon access to skin_analysis_logs
-- ============================================================================
-- NOT APPLIED. Paste in the Supabase SQL editor after reading RLS_FIX_PLAN.md.
--
-- db/004_skin_analysis.sql created three policies for anon and authenticated:
--   "skin_analysis_logs: owner or guest read"
--   "skin_analysis_logs: owner or guest insert"
--   "skin_analysis_logs: owner or guest update"
-- each allowing user_id is null OR user_id = auth.uid(). That lets the anon
-- key read and change every guest row, not one id.
--
-- db/012_skin_guest_access.sql drops the read and update policies and adds
-- owner read / owner update for authenticated. It never drops the insert
-- policy. This file drops all three 004 policies by those exact names.
--
-- Guest questionnaire, results, and routine generation already use the
-- service role on the server. They do not use the anon key on this table.
-- No application change has to ship before this file.
--
-- Does not change saved_looks, saved_look_items, or foundation_match_*.
-- Does not contain a service role key.

alter table public.skin_analysis_logs enable row level security;

drop policy if exists "skin_analysis_logs: owner or guest read" on public.skin_analysis_logs;
drop policy if exists "skin_analysis_logs: owner or guest insert" on public.skin_analysis_logs;
drop policy if exists "skin_analysis_logs: owner or guest update" on public.skin_analysis_logs;

-- Owner read and owner update already exist in db/012_skin_guest_access.sql.
-- Create them only when that file was never applied, so a signed-in cookie
-- session can still select and update its own rows. Do not replace them.
-- Owner insert is new: 004's insert policy covered anon as well, so dropping
-- it removes the authenticated insert unless this policy exists. The app
-- inserts with the service role (user_id null for guests). This check does
-- not allow a null user_id.

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'skin_analysis_logs'
       and policyname = 'skin_analysis_logs: owner read'
  ) then
    create policy "skin_analysis_logs: owner read"
      on public.skin_analysis_logs
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'skin_analysis_logs'
       and policyname = 'skin_analysis_logs: owner update'
  ) then
    create policy "skin_analysis_logs: owner update"
      on public.skin_analysis_logs
      for update
      to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'skin_analysis_logs'
       and policyname = 'skin_analysis_logs: owner insert'
  ) then
    create policy "skin_analysis_logs: owner insert"
      on public.skin_analysis_logs
      for insert
      to authenticated
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ============================================================================
-- ROLLBACK
-- Recreates exactly the three db/004 guest policies. Commented so running
-- this file does not re-open anon access.
--
-- To roll back: comment out the drops and the do $$ block above, uncomment
-- the block below, and run this file alone. Uncommenting without commenting
-- out the drops drops the policies and then creates them again.
-- ============================================================================
/*
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
*/
