-- Stop the browser anon/authenticated roles from writing product_reviews.
-- Review writes stay on the service-role API. Public reads keep rating columns
-- and hide user_id. Safe to run more than once.

revoke insert, update, delete on table public.product_reviews from public, anon, authenticated;
revoke select (user_id) on table public.product_reviews from public, anon, authenticated;

grant select (id, product_key, rating, body, created_at, updated_at)
  on table public.product_reviews
  to anon, authenticated;

drop policy if exists "product_reviews: owner insert" on public.product_reviews;
drop policy if exists "product_reviews: owner update" on public.product_reviews;
drop policy if exists "product_reviews: owner delete" on public.product_reviews;

drop policy if exists "product_reviews: public read" on public.product_reviews;
create policy "product_reviews: public read"
  on public.product_reviews
  for select
  to anon, authenticated
  using (true);

create or replace view public.product_reviews_public
with (security_invoker = true) as
select
  id,
  product_key,
  rating,
  body,
  created_at,
  updated_at
from public.product_reviews;

grant select on public.product_reviews_public to anon, authenticated;
