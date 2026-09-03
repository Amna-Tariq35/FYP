-- ============================================================================
-- Phase 1 · Favourites, Makeup Bag, Beauty Profile
-- ============================================================================
--
-- Run in the Supabase SQL editor AFTER db/001_phase0_rls.sql.
-- Idempotent: safe to re-run.
--
-- Verify afterwards with:
--     npm run verify:phase1
--
-- ── Why every table here is owner-only ──────────────────────────────────────
--
-- Phase 0's tables were a public catalog and shareable looks, so they had a
-- public read. Nothing in this file is like that. A favourites list, a makeup
-- bag and a beauty profile are all personal: they say what someone owns, wants,
-- and what their skin is like. There is no share link to support, so there is no
-- reason for anyone but the owner to read a single row.
--
-- Both clients talk to Supabase with the anon key, which is public. RLS is the
-- only thing enforcing any of this.
--
-- ============================================================================


-- ============================================================================
-- 1 · user_favourites
-- ============================================================================
--
-- shade_key is nullable on purpose: a heart can mean "this lipstick" or "this
-- lipstick in Ritzy Red". The app hearts a specific shade (the try-on screen
-- knows exactly which shade is on the user's face); the web product page hearts
-- at product level before a shade is chosen.

create table if not exists public.user_favourites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  product_key text not null references public.makeup_products (product_key)
                on delete cascade,
  shade_key   text,
  created_at  timestamptz not null default now()
);

-- A plain `unique (user_id, product_key, shade_key)` does NOT do the job here.
-- In Postgres two NULLs are not equal, so the same product could be hearted at
-- product level over and over, each row "unique". coalesce collapses that.
create unique index if not exists user_favourites_unique_idx
  on public.user_favourites (user_id, product_key, coalesce(shade_key, ''));

create index if not exists user_favourites_user_id_idx
  on public.user_favourites (user_id);

alter table public.user_favourites enable row level security;

drop policy if exists "user_favourites: owner read" on public.user_favourites;
create policy "user_favourites: owner read"
  on public.user_favourites
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_favourites: owner insert" on public.user_favourites;
create policy "user_favourites: owner insert"
  on public.user_favourites
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_favourites: owner delete" on public.user_favourites;
create policy "user_favourites: owner delete"
  on public.user_favourites
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No UPDATE policy: a favourite is created or removed, never edited. Leaving it
-- out means an update is refused rather than silently allowed.


-- ============================================================================
-- 2 · makeup_bags + makeup_bag_items
-- ============================================================================
--
-- Wishlist = "I want this". Cart = "I am buying this". Makeup Bag = "I own
-- this". Three different things; this is the third, and it is what powers the
-- try-on screen's "build a look from what I actually own" filter.

create table if not exists public.makeup_bags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null default 'My Makeup Bag',
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.makeup_bags
  add column if not exists is_default boolean not null default true;

-- `is_default boolean default true` on its own would let a user accumulate five
-- bags that all claim to be the default. This makes "one default per user" a
-- database rule rather than a hope.
create unique index if not exists makeup_bags_one_default_idx
  on public.makeup_bags (user_id)
  where is_default;

create index if not exists makeup_bags_user_id_idx
  on public.makeup_bags (user_id);

create table if not exists public.makeup_bag_items (
  id          uuid primary key default gen_random_uuid(),
  bag_id      uuid not null references public.makeup_bags on delete cascade,
  product_key text not null references public.makeup_products (product_key)
                on delete cascade,
  shade_key   text,
  -- Where the item came from. Worth recording: "added automatically after your
  -- order" and "added by hand" deserve different wording in the UI, and it makes
  -- the purchase → bag pipeline auditable when it misbehaves.
  source      text not null default 'manual'
                check (source in ('manual', 'purchase', 'try_on')),
  added_at    timestamptz not null default now()
);

-- Same NULL-uniqueness trap as favourites.
create unique index if not exists makeup_bag_items_unique_idx
  on public.makeup_bag_items (bag_id, product_key, coalesce(shade_key, ''));

create index if not exists makeup_bag_items_bag_id_idx
  on public.makeup_bag_items (bag_id);

alter table public.makeup_bags enable row level security;

drop policy if exists "makeup_bags: owner read" on public.makeup_bags;
create policy "makeup_bags: owner read"
  on public.makeup_bags
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "makeup_bags: owner insert" on public.makeup_bags;
create policy "makeup_bags: owner insert"
  on public.makeup_bags
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "makeup_bags: owner update" on public.makeup_bags;
create policy "makeup_bags: owner update"
  on public.makeup_bags
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  -- Without this, an owner could rename their bag *and* hand it to another
  -- user_id in the same statement.
  with check (user_id = (select auth.uid()));

drop policy if exists "makeup_bags: owner delete" on public.makeup_bags;
create policy "makeup_bags: owner delete"
  on public.makeup_bags
  for delete
  to authenticated
  using (user_id = (select auth.uid()));


alter table public.makeup_bag_items enable row level security;

-- These rows carry no user_id, only a bag_id, so every policy has to walk up to
-- the parent bag and check its owner — the same shape as saved_look_items.

drop policy if exists "makeup_bag_items: owner read" on public.makeup_bag_items;
create policy "makeup_bag_items: owner read"
  on public.makeup_bag_items
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.makeup_bags b
       where b.id = makeup_bag_items.bag_id
         and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "makeup_bag_items: owner insert" on public.makeup_bag_items;
create policy "makeup_bag_items: owner insert"
  on public.makeup_bag_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.makeup_bags b
       where b.id = makeup_bag_items.bag_id
         and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "makeup_bag_items: owner update" on public.makeup_bag_items;
create policy "makeup_bag_items: owner update"
  on public.makeup_bag_items
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.makeup_bags b
       where b.id = makeup_bag_items.bag_id
         and b.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.makeup_bags b
       where b.id = makeup_bag_items.bag_id
         and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "makeup_bag_items: owner delete" on public.makeup_bag_items;
create policy "makeup_bag_items: owner delete"
  on public.makeup_bag_items
  for delete
  to authenticated
  using (
    exists (
      select 1
        from public.makeup_bags b
       where b.id = makeup_bag_items.bag_id
         and b.user_id = (select auth.uid())
    )
  );


-- ============================================================================
-- 3 · user_skin_profiles — Beauty Profile columns
-- ============================================================================
--
-- The table already exists and is upserted by the skin-analysis route
-- (src/app/api/skin-analysis/route.ts). That route uses the *user's* server
-- client and calls auth.getUser(), so auth.uid() is populated and the owner-only
-- policies below do not break it.
--
-- Everything added here is nullable. A user who has never run a skin analysis
-- and never filled the form in must still have a usable profile row.

alter table public.user_skin_profiles
  add column if not exists undertone text,
  add column if not exists depth_level text,
  -- Measured from a photo, e.g. '#E8C3A8'. Phase 2's foundation matcher writes
  -- this and reads it back to sort shades by ΔE distance.
  add column if not exists skin_tone_hex text,
  -- Monk Skin Tone Scale, 1..10. A published, citable scale — better in a report
  -- than an invented one.
  add column if not exists monk_scale smallint,
  add column if not exists coverage_preference text,
  -- Matches makeup_products.finish, so it can filter the catalog directly.
  add column if not exists finish_preference text,
  add column if not exists allergies text[],
  add column if not exists source text default 'manual';

-- Constraints are added separately from the columns: `add column ... check (...)`
-- fails on re-run, and there is no `add constraint if not exists`.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_undertone_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_undertone_chk
      check (undertone is null or undertone in ('cool','warm','neutral','olive'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_depth_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_depth_chk
      check (depth_level is null or depth_level in
        ('fair','light','medium','tan','deep','rich'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_monk_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_monk_chk
      check (monk_scale is null or monk_scale between 1 and 10);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_coverage_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_coverage_chk
      check (coverage_preference is null or coverage_preference in
        ('sheer','medium','full'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_finish_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_finish_chk
      check (finish_preference is null or finish_preference in
        ('matte','dewy','satin'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_skin_profiles_source_chk'
  ) then
    alter table public.user_skin_profiles
      add constraint user_skin_profiles_source_chk
      check (source is null or source in ('analysis','manual','both'));
  end if;
end $$;

alter table public.user_skin_profiles enable row level security;

drop policy if exists "user_skin_profiles: owner read" on public.user_skin_profiles;
create policy "user_skin_profiles: owner read"
  on public.user_skin_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_skin_profiles: owner insert" on public.user_skin_profiles;
create policy "user_skin_profiles: owner insert"
  on public.user_skin_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- The skin-analysis route upserts, which is an insert *or* an update, so both
-- policies are required or a second analysis silently fails.
drop policy if exists "user_skin_profiles: owner update" on public.user_skin_profiles;
create policy "user_skin_profiles: owner update"
  on public.user_skin_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ============================================================================
-- 4 · Confirm what was applied
-- ============================================================================
-- Expect rls_enabled = true for all four, with these policy counts:
--   user_favourites      3   (select, insert, delete)
--   makeup_bags          4   (select, insert, update, delete)
--   makeup_bag_items     4   (select, insert, update, delete)
--   user_skin_profiles   3   (select, insert, update)

select
  c.relname        as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in (
    'user_favourites',
    'makeup_bags',
    'makeup_bag_items',
    'user_skin_profiles'
  )
group by c.relname, c.relrowsecurity
order by c.relname;


-- ============================================================================
-- 5 · Not in this file
-- ============================================================================
--
-- Buy This Look needs no new table. The cart lives in localStorage, and the app
-- hands the session to the same browser via /auth/bridge, so the look's items
-- can be put straight into that cart — nothing to persist server-side.
--
-- Phase 3's product_restock_alerts and the stock_quantity columns are not here;
-- they belong with the inventory work, and adding them early would leave an
-- "out of stock" state that nothing can ever produce.
