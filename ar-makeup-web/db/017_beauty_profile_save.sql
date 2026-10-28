-- ============================================================================
-- Beauty profile save — columns the questionnaire writes
-- ============================================================================
-- Idempotent. Safe to re-run. Adds columns only; it does not update or delete
-- existing rows.
--
-- The Flutter save and POST /api/beauty-profile write:
--   user_id, skin_type, undertone, depth_level, skin_tone_hex, monk_scale,
--   coverage_preference, finish_preference, allergies, concerns, source,
--   updated_at
-- user_id is the existing row key. db/002_phase1.sql adds the measured
-- columns (including depth_level), but a database that never ran that
-- section still rejects the save with a schema-cache error. This file adds
-- every written column the original table may lack.
--
-- Other routes still upsert with onConflict user_id. That needs a unique
-- user_id. The index is skipped, not forced, when duplicate user_id rows
-- already exist, so this file can still add the columns.
--
-- NOTIFY reloads PostgREST's schema cache so the new columns are visible
-- without waiting for the cache to expire.

alter table public.user_skin_profiles
  add column if not exists skin_type text,
  add column if not exists undertone text,
  add column if not exists depth_level text,
  add column if not exists skin_tone_hex text,
  add column if not exists monk_scale numeric,
  add column if not exists coverage_preference text,
  add column if not exists finish_preference text,
  add column if not exists allergies text[],
  add column if not exists concerns text[],
  add column if not exists source text default 'manual',
  add column if not exists updated_at timestamptz default now();

do $$
begin
  create unique index if not exists user_skin_profiles_user_id_uidx
    on public.user_skin_profiles (user_id);
exception
  when unique_violation then
    raise notice 'user_skin_profiles.user_id has duplicates; unique index skipped';
end $$;

notify pgrst, 'reload schema';
