-- Aggregated review stats. The catalog reads this view when it exists and
-- falls back to batched product_reviews reads when PostgREST says it is missing.
-- Paste this file in the Supabase SQL editor to turn on the fast path.

create or replace view public.product_review_stats
with (security_invoker = true) as
select
  product_key,
  round(avg(rating)::numeric, 1) as average,
  count(*)::integer as count
from public.product_reviews
group by product_key;

grant select on public.product_review_stats to anon, authenticated;
