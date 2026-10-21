-- Account deletion for the phone app.
--
-- The Flutter Privacy screen calls supabase.rpc('delete_user') with no
-- arguments. Paste this into the Supabase SQL editor yourself. Nothing in
-- the app or this repo applies it to a live database.
--
-- If public.delete_user() already exists, this script leaves that function
-- alone. Drop it yourself before pasting again only if you intend to replace
-- it. The expected signature is delete_user() with no parameters.
--
-- The function deletes only auth.uid(). It does not change row level security
-- on any table. Tables that reference auth.users ON DELETE CASCADE are removed
-- with the user. Run it as a role that can delete from auth.users (the
-- dashboard SQL editor).

do $outer$
begin
  if to_regprocedure('public.delete_user()') is null then
    execute $fn$
      create function public.delete_user()
      returns void
      language plpgsql
      security definer
      set search_path = public, auth
      as $body$
      declare
        uid uuid := auth.uid();
      begin
        if uid is null then
          raise exception 'not authenticated' using errcode = '42501';
        end if;

        -- Only the caller. These deletes are skipped when a table or column
        -- is absent, so a schema difference cannot block the auth delete.
        -- Order items go first so a non-cascading order foreign key cannot
        -- keep this account.
        begin
          delete from public.order_items
           where order_id in (
             select id from public.orders where user_id = uid
           );
        exception
          when undefined_table or undefined_column then null;
        end;

        begin
          delete from public.orders where user_id = uid;
        exception
          when undefined_table or undefined_column then null;
        end;

        begin
          delete from public.product_reviews where user_id = uid;
        exception
          when undefined_table or undefined_column then null;
        end;

        delete from auth.users where id = uid;
      end;
      $body$;
    $fn$;
  end if;
end
$outer$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
