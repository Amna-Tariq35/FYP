-- ============================================================================
-- Phase 2 · Foundation Shade Match — run log
-- ============================================================================
--
-- Run in the Supabase SQL editor AFTER db/002_phase1.sql.
-- Idempotent: safe to re-run.
--
-- Verify afterwards with:
--     npm run verify:foundation
--
-- ── What this file does and does not create ─────────────────────────────────
--
-- The measured skin tone itself lives in `user_skin_profiles`, which Phase 1
-- already extended with `undertone`, `depth_level`, `skin_tone_hex`, `monk_scale`
-- and `source`. The matcher writes those columns, so no new profile schema is
-- needed here. This file adds only the run log.
--
-- ── Why a log at all ────────────────────────────────────────────────────────
--
-- A shade recommendation is a claim about someone's face, and the one question
-- that always follows is "why did it say that?". Without a log the answer is
-- unavailable ten seconds after the screen closes: the reading is overwritten in
-- the profile on the next run, and the patches are never stored at all. The log
-- keeps the derived numbers — L*a*b*, ITA°, confidence, the winning shade and its
-- ΔE — so a disputed result can be reconstructed and, in aggregate, so the shade
-- coverage of the catalog can be measured against the complexions that actually
-- used it.
--
-- ── What is deliberately not stored ─────────────────────────────────────────
--
-- No image, and no per-patch colours. Only the aggregate reading is kept. The
-- device never uploads a photograph, so there is nothing here that could be used
-- to reconstruct a face; `regions_used` records only which regions contributed,
-- by name.
--
-- ── Insert-only, by design ─────────────────────────────────────────────────
--
-- There is no update policy and no delete policy for the owner. A log the subject
-- can rewrite is not a log. Deletion happens exactly once, by cascade, when the
-- account is deleted — which is also what the data-protection answer needs to be.
--
-- ============================================================================


create table if not exists public.foundation_match_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  -- ── What was measured ────────────────────────────────────────────────────
  skin_tone_hex   text not null,
  -- Stored as three numerics rather than one composite so aggregate queries
  -- ("what is the L* distribution of our users?") are plain SQL.
  skin_lab_l      numeric(6,2) not null,
  skin_lab_a      numeric(6,2) not null,
  skin_lab_b      numeric(6,2) not null,
  -- Individual Typology Angle (Chardon et al. 1991). Ranges roughly -90..90.
  ita_degrees     numeric(6,2),
  depth_level     text,
  undertone       text,
  monk_scale      smallint,

  -- ── How much the measurement can be trusted ──────────────────────────────
  confidence        numeric(4,3),
  confidence_label  text,
  -- Which of the five face regions survived sampling and outlier rejection.
  regions_used      text[] not null default '{}',
  -- Non-fatal observations shown to the user, e.g. a warm-light correction.
  warnings          text[] not null default '{}',

  -- ── What was recommended ─────────────────────────────────────────────────
  -- No foreign key to product_shades. A log entry records what was recommended
  -- at the time; if a shade is later discontinued and its row removed, the
  -- history must survive that, not cascade away with it.
  matched_product_key text,
  matched_shade_key   text,
  matched_shade_name  text,
  matched_shade_hex   text,
  -- ΔE2000 between the measured skin and the winning shade. Three decimals
  -- because differences below 0.1 decide ties in a dense catalog.
  delta_e             numeric(7,3),
  shades_considered   integer,

  created_at  timestamptz not null default now()
);


-- Value constraints mirror the ones on user_skin_profiles so the two can never
-- disagree about what a valid undertone or depth is. Wrapped in a do-block
-- because Postgres has no `add constraint if not exists`.
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


-- The only read pattern is "this user's runs, newest first" (the GET handler
-- takes the top 1). A composite index serves both the filter and the sort.
create index if not exists foundation_match_logs_user_created_idx
  on public.foundation_match_logs (user_id, created_at desc);


-- ============================================================================
-- RLS
-- ============================================================================
--
-- Both clients hold the anon key, which is public, so these policies are the
-- only thing standing between one user's readings and another's.

alter table public.foundation_match_logs enable row level security;

drop policy if exists "foundation_match_logs: owner read"
  on public.foundation_match_logs;
create policy "foundation_match_logs: owner read"
  on public.foundation_match_logs
  for select
  to authenticated
  -- (select auth.uid()) rather than auth.uid(): the subselect is evaluated once
  -- per statement instead of once per row.
  using (user_id = (select auth.uid()));

drop policy if exists "foundation_match_logs: owner insert"
  on public.foundation_match_logs;
create policy "foundation_match_logs: owner insert"
  on public.foundation_match_logs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- No update policy, no delete policy. See the header: an append-only log.


-- ============================================================================
-- Verification
-- ============================================================================
--
-- Expect exactly one row: foundation_match_logs, rls_enabled = true, policies = 2.

select
  c.relname          as table_name,
  c.relrowsecurity   as rls_enabled,
  count(p.polname)   as policies
from pg_class c
left join pg_policies p
  on p.tablename = c.relname and p.schemaname = 'public'
where c.relname = 'foundation_match_logs'
group by c.relname, c.relrowsecurity;
