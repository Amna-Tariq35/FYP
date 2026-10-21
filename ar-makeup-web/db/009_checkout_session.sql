-- Optional checkout columns. The app still checks out if this file has not been applied:
-- it skips the missing columns instead of failing the request.
-- A stored session id stops a second Stripe Checkout session for the same order.

alter table public.orders
  add column if not exists stripe_checkout_session_id text,
  add column if not exists payment_method text,
  add column if not exists contact_email text;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in ('card', 'cash_on_delivery')
  );

create unique index if not exists orders_stripe_checkout_session_id_uidx
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
