# RLS fix plan
Read `ar-makeup-web` and `AR-Makeup-Try-On` plus `db/*.sql`. Did not run SQL or write to Supabase. Live calls: two anon storage list GETs (`limit=1`). No service role key.
## 1. skin_analysis_logs

No browser or Flutter query hits this table. The results page (`results/[sessionId]/page.tsx:147`) calls `GET /api/skin-analysis/[id]`.

Service role: `api/skin-analysis/route.ts` select 89, update 116, insert 312; `api/skin-analysis/[id]/route.ts` select 25 (cookie client at 17 is `getUser` only); `api/generate-routine/route.ts` select 64 and 112, update 76 (cookie client at 105 is `getUser` only); `proxy.ts` select 154.

Cookie session, authenticated, own rows: `account/routines/page.tsx` select 58; `products/page.tsx` select 53; `product-profile-matching.ts` select 176 via `products/[product_key]/page.tsx:69` and `api/chat/route.ts:530` and `:654`.

With no anon policy, those four flows still work. Guests already use the service role. Signed-in reads use the owner select from `db/012` (`018` creates it only if missing). Nothing moves server-side first. Paste `018`, then test. No code deploy before SQL.

`db/004` names dropped: `owner or guest` read, insert, update (`to anon, authenticated`, `user_id is null`). `db/012` drops read and update only. `foundation_match_*` is authenticated owner-only, so it is not in `018`. `saved_looks` is unchanged.

## 2. saved_looks (design only)

`db/001` select `using (true)` for anon and authenticated. Not changed here.

By id: `looks/[id]/page.tsx:257` and items `:270` (browser client, share page); `proxy.ts:88` (anon, 404 guard); `saved_looks_screen.dart:291` (own items). Owner list: `my-looks/page.tsx:74`, `looks_cache.dart:145`. Writes stay owner policies: web `try-on/page.tsx:434` and `:450`; mobile favourite `:248`, deletes `:443` and `:447`, inserts `try_on_screen.dart:705` and `:2433`. `scripts/verify-phase0.ts` expects anon select.

Smallest fix: `SECURITY DEFINER` `get_look(id)` returns one look and its items; grant execute to anon and authenticated; replace public read with owner-only select. Change `looks/[id]/page.tsx`, `proxy.ts` (an empty anon row is a real 404, not fail-open), and `verify-phase0.ts`. `/auth/bridge` does not query the table; the share link keeps working only if the page calls `get_look`. Effort M. Not implemented.

## 3. Storage and lashes

No SQL defines buckets `looks` or `avatars` or their policies. The app calls `getPublicUrl` (`try_on_screen.dart` 698 and 2429, `edit_profile_screen.dart` 84), so it treats both as public. Anon list GET at each bucket root, `limit=1`: `looks` HTTP 400, `avatars` HTTP 400. No object count. Did not retry with POST.

`ar_lash_configs` has no RLS in `db/*.sql`. Mobile selects every row (`try_on_screen.dart:1475`). Do not run yet:

```sql
alter table public.ar_lash_configs enable row level security;
create policy "ar_lash_configs: public read" on public.ar_lash_configs for select to anon, authenticated using (true);
```

## 4. After you paste 018

1. Anon GET `skin_analysis_logs?select=id` with `Prefer: count=exact`. Expect 0. Do not record row bodies.
2. Guest questionnaire (this inserts a row) → results → generate routine → refresh results. Anon count still 0.
3. Signed-in questionnaire (second insert) → results → routine → refresh → `/account/routines` shows it.
4. Rollback: comment out the drops and the `do` block in `018`, uncomment the ROLLBACK block, and run that alone.
