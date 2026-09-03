-- ============================================================================
-- Phase 1.1 · Makeup Bag purchase pipeline
-- ============================================================================
-- Idempotent. Safe to re-run after db/002_phase1.sql.
--
-- PostgREST upsert needs a UNIQUE constraint on the conflict columns, not
-- only the expression index `coalesce(shade_key, '')`. Clients always write
-- shade_key as '' (never NULL), so a plain unique constraint is valid.

alter table public.makeup_bags
  add column if not exists is_default boolean not null default true;

create unique index if not exists makeup_bags_one_default_idx
  on public.makeup_bags (user_id)
  where is_default;

update public.makeup_bag_items
   set shade_key = ''
 where shade_key is null;

alter table public.makeup_bag_items
  alter column shade_key set default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'makeup_bag_items_bag_product_shade_key'
  ) then
    alter table public.makeup_bag_items
      add constraint makeup_bag_items_bag_product_shade_key
      unique (bag_id, product_key, shade_key);
  end if;
end $$;
