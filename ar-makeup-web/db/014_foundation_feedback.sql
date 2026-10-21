-- ============================================================================
-- Foundation match feedback — votes only, no learning in this pass
-- ============================================================================
--
-- Paste this in the Supabase SQL editor. It is NOT applied automatically.
-- Idempotent: safe to re-run.
--
-- This file is self-contained. If public.foundation_match_logs does not exist
-- yet (db/004_foundation_match.sql was never run), the prelude below creates
-- it with the same columns, checks, index, and RLS as 004. Existing rows are
-- left in place. The feedback table's log_id foreign key is created after that.
--
-- Stores "too light / looks right / too dark" from the result screen.
-- Nothing in the matcher reads this table to change the swatch curve.
-- No photo, no patch colours.
-- ============================================================================


-- ============================================================================
-- Prelude: public.foundation_match_logs (same shape as db/004)
-- ============================================================================
--
-- Columns match the insert in src/app/api/foundation-match/route.ts (logRun)
-- and the GET select of the latest run.

create table if not exists public.foundation_match_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  skin_tone_hex   text not null,
  skin_lab_l      numeric(6,2) not null,
  skin_lab_a      numeric(6,2) not null,
  skin_lab_b      numeric(6,2) not null,
  ita_degrees     numeric(6,2),
  depth_level     text,
  undertone       text,
  monk_scale      smallint,

  confidence        numeric(4,3),
  confidence_label  text,
  regions_used      text[] not null default '{}',
  warnings          text[] not null default '{}',

  matched_product_key text,
  matched_shade_key   text,
  matched_shade_name  text,
  matched_shade_hex   text,
  delta_e             numeric(7,3),
  shades_considered   integer,

  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'foundation_match_logs_undertone_chk'
  ) then
    alter table public.foundation_match_logs
      add constraint foundation_match_logs_undertone_chk
      check (undertone is null or undertone in ('cool','warm','neutral','olive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'foundation_match_logs_depth_chk'
  ) then
    alter table public.foundation_match_logs
      add constraint foundation_match_logs_depth_chk
      check (depth_level is null or depth_level in
        ('fair','light','medium','tan','deep','rich'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'foundation_match_logs_monk_chk'
  ) then
    alter table public.foundation_match_logs
      add constraint foundation_match_logs_monk_chk
      check (monk_scale is null or monk_scale between 1 and 10);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'foundation_match_logs_confidence_chk'
  ) then
    alter table public.foundation_match_logs
      add constraint foundation_match_logs_confidence_chk
      check (confidence is null or confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'foundation_match_logs_hex_chk'
  ) then
    alter table public.foundation_match_logs
      add constraint foundation_match_logs_hex_chk
      check (skin_tone_hex ~* '^#[0-9a-f]{6}$');
  end if;
end $$;

create index if not exists foundation_match_logs_user_created_idx
  on public.foundation_match_logs (user_id, created_at desc);

alter table public.foundation_match_logs enable row level security;

drop policy if exists "foundation_match_logs: owner read"
  on public.foundation_match_logs;
create policy "foundation_match_logs: owner read"
  on public.foundation_match_logs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "foundation_match_logs: owner insert"
  on public.foundation_match_logs;
create policy "foundation_match_logs: owner insert"
  on public.foundation_match_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));


-- ============================================================================
-- Feedback votes
-- ============================================================================
--
-- Columns match the insert in handleFeedback: user_id, log_id, vote.

create table if not exists public.foundation_match_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  -- Nullable: the app does not currently receive the log id back.
  log_id      uuid references public.foundation_match_logs (id) on delete set null,
  vote        text not null,
  created_at  timestamptz not null default now(),
  constraint foundation_match_feedback_vote_chk
    check (vote in ('too_light', 'right', 'too_dark'))
);

create index if not exists foundation_match_feedback_user_created_idx
  on public.foundation_match_feedback (user_id, created_at desc);

alter table public.foundation_match_feedback enable row level security;

drop policy if exists "foundation_match_feedback: owner read"
  on public.foundation_match_feedback;
create policy "foundation_match_feedback: owner read"
  on public.foundation_match_feedback
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "foundation_match_feedback: owner insert"
  on public.foundation_match_feedback;
create policy "foundation_match_feedback: owner insert"
  on public.foundation_match_feedback
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
