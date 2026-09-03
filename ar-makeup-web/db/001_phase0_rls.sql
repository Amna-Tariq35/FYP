-- ============================================================================
-- Phase 0 · Row Level Security baseline
-- ============================================================================
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is idempotent: re-running it drops and recreates the policies, so it is
-- safe to apply again after editing.
--
-- Verify afterwards with:
--     npm run verify:phase0
--
-- ── Why this file exists ────────────────────────────────────────────────────
--
-- Both clients — the Flutter app and the Next.js browser code — talk to Supabase
-- with the **anon key**. The anon key is public by design; it identifies the
-- project and grants nothing on its own. Row Level Security is the only thing
-- standing between a stranger and this data.
--
-- That cuts both ways, and Phase 0 depends on getting both directions right:
--
--   * Too closed → the app's product cache comes back empty, and a shared look
--     link shows "Look not found" to everyone except its author.
--   * Too open   → anyone with the anon key (i.e. anyone who opens the site)
--     can rewrite other people's saved looks.
--
-- ============================================================================


-- ============================================================================
-- 1 · Public catalog: makeup_products, product_shades
-- ============================================================================
--
-- Read-only for everyone. The store is browsable without an account, the app's
-- ProductsCache warms up before sign-in, and the try-on screen needs shade hex
-- values while logged out.
--
-- Writes are admin-only and go through API routes that use the service-role key,
-- which bypasses RLS entirely — so there is deliberately no write policy here.

alter table public.makeup_products enable row level security;

drop policy if exists "makeup_products: public read" on public.makeup_products;
create policy "makeup_products: public read"
  on public.makeup_products
  for select
  to anon, authenticated
  using (true);


alter table public.product_shades enable row level security;

drop policy if exists "product_shades: public read" on public.product_shades;
create policy "product_shades: public read"
  on public.product_shades
  for select
  to anon, authenticated
  using (true);


-- ============================================================================
-- 2 · saved_looks
-- ============================================================================
--
-- Read: public. Write: owner only.
--
-- The public read is what makes the app's "Copy link" and "Share" actions work.
-- A recipient is a logged-out stranger, so an owner-only select policy would
-- turn every shared link into "Look not found".
--
-- This is the unlisted-link model: knowing the UUID is the permission. A look id
-- is a random v4 UUID, so it is not guessable — but it is also not a secret once
-- shared, and the row exposes look_name, tags and the preview image.
--
-- Section 5 below shows how to tighten this to opt-in sharing. Worth doing, but
-- it needs a share toggle in the app, so it belongs in Phase 1 rather than here.

alter table public.saved_looks enable row level security;

drop policy if exists "saved_looks: public read" on public.saved_looks;
create policy "saved_looks: public read"
  on public.saved_looks
  for select
  to anon, authenticated
  using (true);

-- `(select auth.uid())` rather than a bare `auth.uid()`: Postgres treats the
-- subquery as a stable scalar and evaluates it once per statement instead of
-- once per row. On a table scan that is the difference between a fast query and
-- a slow one.

drop policy if exists "saved_looks: owner insert" on public.saved_looks;
create policy "saved_looks: owner insert"
  on public.saved_looks
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "saved_looks: owner update" on public.saved_looks;
create policy "saved_looks: owner update"
  on public.saved_looks
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  -- Without this `with check`, an owner could reassign their look to someone
  -- else's user_id — the `using` clause alone only gates which rows are visible
  -- to the update, not what they may become.
  with check (user_id = (select auth.uid()));

drop policy if exists "saved_looks: owner delete" on public.saved_looks;
create policy "saved_looks: owner delete"
  on public.saved_looks
  for delete
  to authenticated
  using (user_id = (select auth.uid()));


-- ============================================================================
-- 3 · saved_look_items
-- ============================================================================
--
-- Same shape as saved_looks, but ownership is indirect: these rows have no
-- user_id, only a look_id. Every write policy therefore has to walk up to the
-- parent look and check *its* owner.
--
-- Read stays public for the same reason as the parent — a shared look is
-- useless without the products in it, which is also exactly what
-- "Buy this look" needs.

alter table public.saved_look_items enable row level security;

drop policy if exists "saved_look_items: public read" on public.saved_look_items;
create policy "saved_look_items: public read"
  on public.saved_look_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists "saved_look_items: owner insert" on public.saved_look_items;
create policy "saved_look_items: owner insert"
  on public.saved_look_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.saved_looks l
       where l.id = saved_look_items.look_id
         and l.user_id = (select auth.uid())
    )
  );

drop policy if exists "saved_look_items: owner update" on public.saved_look_items;
create policy "saved_look_items: owner update"
  on public.saved_look_items
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.saved_looks l
       where l.id = saved_look_items.look_id
         and l.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.saved_looks l
       where l.id = saved_look_items.look_id
         and l.user_id = (select auth.uid())
    )
  );

drop policy if exists "saved_look_items: owner delete" on public.saved_look_items;
create policy "saved_look_items: owner delete"
  on public.saved_look_items
  for delete
  to authenticated
  using (
    exists (
      select 1
        from public.saved_looks l
       where l.id = saved_look_items.look_id
         and l.user_id = (select auth.uid())
    )
  );

-- Those `exists` subqueries run per row. Without an index on look_id, deleting a
-- look's items degrades quickly as the table grows.
create index if not exists saved_look_items_look_id_idx
  on public.saved_look_items (look_id);

create index if not exists saved_looks_user_id_idx
  on public.saved_looks (user_id);


-- ============================================================================
-- 4 · Confirm what was applied
-- ============================================================================
-- Expect: rls_enabled = true for all four, and the policy counts below.
--   makeup_products   1   (select)
--   product_shades    1   (select)
--   saved_looks       4   (select + insert/update/delete)
--   saved_look_items  4   (select + insert/update/delete)

select
  c.relname                                as table_name,
  c.relrowsecurity                         as rls_enabled,
  count(p.polname)                         as policy_count
from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in (
    'makeup_products',
    'product_shades',
    'saved_looks',
    'saved_look_items'
  )
group by c.relname, c.relrowsecurity
order by c.relname;


-- ============================================================================
-- 5 · Phase 1 hardening — opt-in sharing (NOT part of Phase 0)
-- ============================================================================
--
-- Replaces "any look is readable if you know its id" with "a look is readable
-- once its owner shares it". Only apply this together with the app-side change,
-- or every existing share link breaks.
--
-- The default is `true` so looks saved before the toggle existed keep working;
-- flip it to `false` once the app sets the flag explicitly on share.
--
--   alter table public.saved_looks
--     add column if not exists is_public boolean not null default true;
--
--   drop policy if exists "saved_looks: public read" on public.saved_looks;
--   create policy "saved_looks: shared or owner read"
--     on public.saved_looks
--     for select
--     to anon, authenticated
--     using (is_public or user_id = (select auth.uid()));
--
--   drop policy if exists "saved_look_items: public read" on public.saved_look_items;
--   create policy "saved_look_items: shared or owner read"
--     on public.saved_look_items
--     for select
--     to anon, authenticated
--     using (
--       exists (
--         select 1
--           from public.saved_looks l
--          where l.id = saved_look_items.look_id
--            and (l.is_public or l.user_id = (select auth.uid()))
--       )
--     );


-- ============================================================================
-- 6 · Deliberately NOT covered here
-- ============================================================================
--
-- These tables are outside Phase 0 and are left untouched on purpose — guessing
-- at their policies could break checkout or the skin-analysis flow:
--
--   orders, order_items        Read from the browser in /my-orders, written by
--                              server routes and the Stripe webhook. Guest
--                              checkout means not every order has a user_id, so
--                              the correct policy depends on how guest orders
--                              are meant to be looked up. Audit before Phase 1.
--
--   skin_analysis_logs         Written server-side; the results page reads it
--                              from the browser by sessionId. Same
--                              unlisted-link question as saved_looks, but the
--                              content is personal, so it deserves a real answer.
--
--   user_skin_profiles         Personal data, and the source for Phase 1's
--                              Beauty Profile. Must end up owner-only —
--                              select/insert/update gated on
--                              `user_id = (select auth.uid())`.
--
-- Every new Phase 1 table (favourites, makeup bag, restock alerts) needs its
-- policies written in the same migration that creates it. A table with RLS
-- enabled and no policy returns nothing; a table with RLS disabled returns
-- everything to everyone. Neither failure is loud.
