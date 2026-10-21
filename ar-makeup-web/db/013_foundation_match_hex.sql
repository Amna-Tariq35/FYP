-- ============================================================================
-- Foundation match colours — optional real swatch hex
-- ============================================================================
--
-- Paste this in the Supabase SQL editor. It is NOT applied automatically.
-- Idempotent: safe to re-run.
--
-- Do NOT update shade_hex or shade_key. AR try-on, the makeup bag, and saved
-- looks all key off those columns. This file only adds two nullable columns
-- the shade ranker reads when they exist:
--
--   match_hex   the colour to rank against (real product swatch, when known)
--   hex_source  where that hex came from, e.g. 'pudding-mit' or 'manual'
--
-- Until a row has match_hex, ranking uses shade_hex exactly as before.
-- ============================================================================

alter table public.product_shades
  add column if not exists match_hex text;

alter table public.product_shades
  add column if not exists hex_source text;

-- Loose shape check. Null stays allowed so existing rows need no backfill.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_shades_match_hex_chk'
  ) then
    alter table public.product_shades
      add constraint product_shades_match_hex_chk
      check (match_hex is null or match_hex ~* '^#[0-9a-f]{6}$');
  end if;
end $$;
