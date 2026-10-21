-- Owner and guest access for orders. Does not drop policies other than the
-- names created here, so it is safe to re-run. Guest lookup matches the app:
-- header x-guest-token and get_order_id_by_guest_token(p_token).

create or replace function public.current_guest_token()
returns text
language plpgsql
stable
as $$
declare
  headers json;
  token text;
begin
  begin
    headers := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  token := headers->>'x-guest-token';
  if token is null or btrim(token) = '' then
    return null;
  end if;
  return btrim(token);
end;
$$;

revoke all on function public.current_guest_token() from public;
grant execute on function public.current_guest_token() to anon, authenticated, service_role;

create or replace function public.get_order_id_by_guest_token(p_token uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
    from public.orders
   where guest_token = p_token
   limit 1;
$$;

revoke all on function public.get_order_id_by_guest_token(uuid) from public;
grant execute on function public.get_order_id_by_guest_token(uuid) to anon, authenticated, service_role;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "orders: owner read" on public.orders;
create policy "orders: owner read"
  on public.orders
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "orders: owner insert" on public.orders;
create policy "orders: owner insert"
  on public.orders
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "orders: guest insert" on public.orders;
create policy "orders: guest insert"
  on public.orders
  for insert
  to anon
  with check (user_id is null and guest_token is not null);

drop policy if exists "orders: guest read" on public.orders;
create policy "orders: guest read"
  on public.orders
  for select
  to anon
  using (
    user_id is null
    and guest_token is not null
    and guest_token::text = public.current_guest_token()
  );

drop policy if exists "order_items: owner read" on public.order_items;
create policy "order_items: owner read"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.orders o
       where o.id = order_items.order_id
         and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "order_items: owner insert" on public.order_items;
create policy "order_items: owner insert"
  on public.order_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.orders o
       where o.id = order_items.order_id
         and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "order_items: guest read" on public.order_items;
create policy "order_items: guest read"
  on public.order_items
  for select
  to anon
  using (
    exists (
      select 1
        from public.orders o
       where o.id = order_items.order_id
         and o.user_id is null
         and o.guest_token is not null
         and o.guest_token::text = public.current_guest_token()
    )
  );

drop policy if exists "order_items: guest insert" on public.order_items;
create policy "order_items: guest insert"
  on public.order_items
  for insert
  to anon
  with check (
    exists (
      select 1
        from public.orders o
       where o.id = order_items.order_id
         and o.user_id is null
         and o.guest_token is not null
         and o.guest_token::text = public.current_guest_token()
    )
  );
