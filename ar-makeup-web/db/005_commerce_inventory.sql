-- Phase 3.1: product inventory and restock alerts
-- Apply after confirming the existing orders/order_items schema in Supabase.

alter table public.makeup_products
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists low_stock_threshold integer not null default 5;

alter table public.makeup_products
  drop constraint if exists makeup_products_stock_quantity_check;
alter table public.makeup_products
  add constraint makeup_products_stock_quantity_check
  check (stock_quantity >= 0);

alter table public.makeup_products
  drop constraint if exists makeup_products_low_stock_threshold_check;
alter table public.makeup_products
  add constraint makeup_products_low_stock_threshold_check
  check (low_stock_threshold >= 0);

create table if not exists public.product_restock_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  email text,
  product_key text not null,
  shade_key text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_restock_alerts_recipient_check
    check (user_id is not null or email is not null),
  constraint product_restock_alerts_email_check
    check (email is null or position('@' in email) > 1)
);

create index if not exists product_restock_alerts_pending_idx
  on public.product_restock_alerts (product_key, shade_key, created_at)
  where notified_at is null;

create unique index if not exists product_restock_alerts_user_pending_uidx
  on public.product_restock_alerts (user_id, product_key, coalesce(shade_key, ''))
  where notified_at is null and user_id is not null;

create unique index if not exists product_restock_alerts_email_pending_uidx
  on public.product_restock_alerts (lower(email), product_key, coalesce(shade_key, ''))
  where notified_at is null and email is not null;

alter table public.product_restock_alerts enable row level security;

drop policy if exists "product_restock_alerts: owner read" on public.product_restock_alerts;
create policy "product_restock_alerts: owner read"
  on public.product_restock_alerts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Inserts and notification updates are server-side only. Guest alerts must not
-- be writable with the public anon key because email addresses are personal data.

create or replace function public.reserve_product_stock(
  p_product_key text,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  update public.makeup_products
     set stock_quantity = stock_quantity - p_quantity
   where product_key = p_product_key
     and is_active is distinct from false
     and stock_quantity >= p_quantity
  returning stock_quantity into remaining;

  if not found then
    raise exception 'insufficient stock' using errcode = 'P0001';
  end if;

  return remaining;
end;
$$;

revoke all on function public.reserve_product_stock(text, integer) from public, anon, authenticated;
grant execute on function public.reserve_product_stock(text, integer) to service_role;

create or replace function public.release_product_stock(
  p_product_key text,
  p_quantity integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  update public.makeup_products
     set stock_quantity = stock_quantity + p_quantity
   where product_key = p_product_key
  returning stock_quantity into current_stock;

  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  return current_stock;
end;
$$;

revoke all on function public.release_product_stock(text, integer) from public, anon, authenticated;
grant execute on function public.release_product_stock(text, integer) to service_role;

-- Real product ratings and reviews. verified_purchase is derived by the API
-- from paid/completed orders and is intentionally not stored from the client.
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  product_key text not null,
  rating integer not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_key)
);

create index if not exists product_reviews_product_idx
  on public.product_reviews (product_key, created_at desc);

alter table public.product_reviews enable row level security;

drop policy if exists "product_reviews: public read" on public.product_reviews;
create policy "product_reviews: public read"
  on public.product_reviews for select
  to anon, authenticated using (true);

drop policy if exists "product_reviews: owner insert" on public.product_reviews;
create policy "product_reviews: owner insert"
  on public.product_reviews for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "product_reviews: owner update" on public.product_reviews;
create policy "product_reviews: owner update"
  on public.product_reviews for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "product_reviews: owner delete" on public.product_reviews;
create policy "product_reviews: owner delete"
  on public.product_reviews for delete
  to authenticated
  using (user_id = (select auth.uid()));
