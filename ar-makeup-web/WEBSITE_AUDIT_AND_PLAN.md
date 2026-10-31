# Website audit and plan

Scope: `ar-makeup-web` only. No application source was changed. The Next.js dev server was already running at `http://localhost:3000`. There is no browser tool in this session, so nothing was clicked. Results below are from HTTP against that server, or from reading code. Camera permission, layout on a real phone, and the Stripe hosted page were not exercised. No payment was created.

Stripe keys in `.env.local` are test-mode (`sk_test` / `pk_test`). Secret values are not copied here.

Shared with the phone app (not modified): the app opens `/auth/bridge#at=…&rt=…&next=/looks/{id}` (`src/app/auth/bridge/page.tsx` lines 7–9). Looks are the Supabase `saved_looks` rows. `/api/foundation-match` and `/api/beauty-profile` accept the app bearer token via `resolveRequestAuth`. Help for the app is the public `/support` page.

## 1. Feature inventory

**Pages**

| Route | Role |
| --- | --- |
| `/` | Home: catalog, skin analysis, saved looks. No link to `/try-on`. |
| `/products`, `/products/[product_key]` | Catalog and product detail. Shades, stock, reviews, restock alert, add to cart. |
| `/cart` | Local cart. Checkout continues at `/checkout/shipping`. |
| `/checkout` | No page. HTTP 404. |
| `/checkout/shipping`, `/checkout/payment` | Address, then card or cash on delivery. |
| `/checkout/success`, `/checkout/cancel` | After Stripe or a cancelled card session. COD also lands on success with `payment=cod`. |
| `/try-on` | Browser DeepAR for lipstick and blush only. Not linked from the nav, home, or footer. |
| `/skin-analysis` | Chooser. |
| `/skin-analysis/scan` | Camera or upload, MediaPipe check, then photo API. |
| `/skin-analysis/questionnaire` | Questions, no photo. |
| `/skin-analysis/results/[sessionId]` | Profile, AM/PM routine, add one product or the routine to the cart. |
| `/auth/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` | Supabase email auth. |
| `/auth/bridge` | App session handoff. `noindex`. |
| `/account` | Hub. Public even when signed out. |
| `/account/favourites` | Wishlist (`user_favourites`, guest localStorage until sign-in). |
| `/account/routines`, `/alerts`, `/repeats` | Past routines, restock alerts, reorder. |
| `/my-orders`, `/my-orders/[id]` | Signed-in orders. |
| `/order/track` | Guest tracking. |
| `/makeup-bag` | Everyday bag. |
| `/my-looks`, `/looks/[id]` | Saved looks, copy link, buy the look. |
| `/support`, `/privacy`, `/terms` | Help and the student-demo legal pages. |
| `/admin`, `/admin/orders`, `/admin/orders/[id]`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Admin UI. Data APIs check a bearer token. |

**APIs**

- Catalog: `GET /api/catalog/products`, `GET /api/catalog/lookup`
- Orders: `POST /api/orders`, `GET/POST` under `/api/orders`, `/api/orders/guest`, `/api/orders/cancel`, `/api/orders/[id]`, `/api/orders/[id]/buy-again`
- Pay: `POST /api/checkout`, `POST /api/checkout/verify`, `POST /api/stripe/webhook`, `POST /api/send-order-email`
- Skin: `POST /api/skin-analysis`, `GET /api/skin-analysis/[id]`, `POST /api/generate-routine`
- Chat: `POST /api/chat`
- Account-ish: `/api/beauty-profile`, `/api/product-reviews`, `/api/product-restock-alerts`, `/api/account/repeats`, `/api/makeup-bag/from-order`
- Phone-oriented, no website screen: `POST/GET /api/foundation-match` (colour samples, not a photo)
- Admin: `/api/admin/dashboard`, `/api/admin/orders`, `/api/admin/orders/status`, `/api/admin/orders/[id]`, `/api/admin/products/create|update|toggle`, `/api/admin/products/restock-notify`

Catalog census (HTTP, all pages of `/api/catalog/products`): 1,123 products, makeup and skincare, max price 370, 149 brand facet strings, stock 953 in stock and 170 at zero. Image URLs: 0 blank, 0 Open Beauty Facts, 0 picsum, 0 placeholder, 1,123 other hosts. A sample of 8 image URLs returned HTTP 206.

## 2. Test report

No row is browser-verified.

| ID | Feature | Scenario | Expected vs Actual | Severity | Suggested fix | Verified-by |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Chat | Empty `messages: []`, then one 4,000-character user message | Empty input should be ignored in the widget, and a real message should get a short product answer or the public failure sentence. Empty POST returned HTTP 200 in ~10ms with “I could not answer just now. Please try again.” (`src/lib/chat/public-error.ts` line 2). The long POST also returned that sentence (HTTP 200, ~27s). Server log: Gemini `gemini-3.8-flash` HTTP 503, then Groq `qwen-3.6-27b` HTTP 404 “model does not exist”. Widget disables empty send (`Chatbot.tsx` lines 228–233, 431). Limit is 12/min (`src/app/api/chat/route.ts` line 248). | High | Point Groq at a model this key can call. Keep the one-sentence failure. Gemini 503 is not retried in chat (routine retry is separate). | HTTP |
| T02 | Skin photo | Garbage `imageBase64` (`aaaa`) | A bad image should say the photo cannot be read, and offer the questionnaire. Face++ returned `IMAGE_ERROR_UNSUPPORTED_FORMAT` (`src/app/api/skin-analysis/route.ts` lines 354–372). That string does not match `IMAGE_FILE`, so it is not turned into `FACE_NOT_CLEAR`. Gemini vision then called the default `gemini-2.5-flash` (`route.ts` line 384; `GEMINI_VISION_MODEL` is unset) and Google returned 404, telling the caller to use `gemini-3.8-flash`. Public result was HTTP 503 `PHOTO_ANALYSIS_UNAVAILABLE` (“busy”), not a bad-photo error. The scan page would show the questionnaire fallback for that code (`scan/page.tsx` lines 117–122). A real face photo was not sent. | High | Default the vision fallback to `gemini-3.8-flash`. Treat unsupported-image errors as `FACE_NOT_CLEAR` (400), not as “busy”. | HTTP |
| T03 | Checkout | Guest with no email | The form should not send a guest order the server will reject. Email is optional (`ShippingForm.tsx` lines 121–124). Payment copy says an email is only for tracking (`PaymentPanel.tsx` lines 255–268). `POST /api/orders` requires an email when there is no user (`src/app/api/orders/route.ts` lines 191–192). | High | Require email for guests on the shipping step, matching the server. | code-only |
| T04 | Catalog | `/products/not-a-real-key` | HTTP 404 and the not-found page. `notFound()` runs (`src/app/products/[product_key]/page.tsx` line 37) and the RSC payload is the “Product not found” heading, but the status was HTTP 200. `/no-such-route` was a real 404. | Medium | Make the missing-product response a 404. | HTTP |
| T05 | Looks and skin report | Direct bad ids | A missing look or report should not look like a successful page to a crawler. Both URLs were HTTP 200 shells. The look “not found” UI is client-side after Supabase (`src/app/looks/[id]/page.tsx` lines 490–501). `GET /api/skin-analysis/not-a-real-id` was HTTP 404; the page then shows “Could not load this report” (`results/[sessionId]/page.tsx` lines 324–331). That second step was not clicked. | Medium | Return 404 from the server once the id is known to be missing. | HTTP for status; code-only for the client message |
| T06 | Catalog filters | Brand list | One entry per brand. Facets include both `Clinique` and `CLINIQUE`, and the same for Becca, Estée Lauder, Shiseido, Smashbox, Supergoop!, Too Faced. Brands are stored with `Set.add` and no case fold (`src/lib/catalog/listing.ts` line 267). | Medium | Fold brand keys when building facets, and filter with the same fold. | HTTP |
| T07 | Admin | Open `/admin` with no session | A locked screen. The HTML is HTTP 200. `GET /api/admin/dashboard` and `GET /api/admin/orders` returned 401. The page still finishes loading and keeps zeroed stats when the response is not ok (`src/app/admin/page.tsx` lines 51–64). Admin identity is `user.email === "admin@makeup.com"` (`src/lib/adminAuth.ts` line 22). | Medium | If the dashboard call is 401/403, render a sign-in gate instead of a zero dashboard. | HTTP |
| T08 | Guest order | `GET /api/orders/guest?guest_token=not-a-token` | “Order not found” and nothing else. Actual body included `details`: `invalid input syntax for type uuid`. That is `orderErr.message` (`src/app/api/orders/guest/route.ts` lines 52–55). | Medium | Drop `details` from the public JSON. | HTTP |
| T09 | Try-on | Camera denied, no camera, or the page is hard to find | A shopper should find try-on, and a denied camera should still show shades. Nav links are only Home, Products, and Skin Analysis (`Navbar.tsx` lines 56–62). Home and support say the full camera is the Android app (`MobileCTA.tsx` lines 17–20, `support/page.tsx` lines 21–27). `/try-on` is HTTP 200 and is not linked. On init failure the overlay is “Could not initialize camera” plus retry (`try-on/page.tsx` lines 178–182 and 430). There is no still-image shade preview. DeepAR is lipstick and blush only. The license key is hardcoded in the client component (lines 37–38). The key is not repeated here. This path was not clicked. | Medium | Either link `/try-on` and label it “lipstick and blush preview”, or remove it from the demo story. Keep the phone as the live AR. On camera failure, keep the shade list usable. Move the license to an env var. | code-only (route HTTP 200) |
| T10 | Skin scan | Camera denied or a file that is not a face | Denied camera offers upload (`scan/page.tsx` lines 296–304). A non-image fails image decode and shows “The photo could not be read” (lines 139–141). A 400 from the API, including a clear face error, is replaced with that same generic sentence (lines 124–125). Not clicked. | Medium | Show the server’s face-not-clear sentence when the status is 400. | code-only |
| T11 | Checkout | Empty cart, invalid fields, double submit, out of stock, payment failure | Empty `POST /api/orders` with `{}` was HTTP 400 “Missing shipping info.” `POST /api/checkout` with `{}` was 400 “Missing orderId”. A fake order id was 404 “Order not found.” No Stripe session was created. The shipping form blocks empty required fields (`ShippingForm.tsx` lines 29–45, 86–99). Empty cart is a client redirect (`CheckoutGuard.tsx` lines 24–29) while `GET /checkout/shipping` is still HTTP 200. Double submit is blocked with `placingRef` during the request, then cleared in `finally` before navigation (`PaymentPanel.tsx` lines 49–50 and 174–176). Out of stock is a 409 after `reserve_product_stock` fails (`orders/route.ts` lines 198–214, `db/005_commerce_inventory.sql` lines 81–82). A failed Stripe create returns `stripeError.message` to the browser (`checkout/route.ts` lines 122–123). Stock and Stripe failure were not executed, so no order row was reserved. | Medium for the raw Stripe message and the empty-cart HTTP 200; the guards themselves match the code | Keep stock checks. Return a fixed sentence for Stripe failures. Optional: don’t serve the shipping form until the cart has a selection. | HTTP for the empty and unknown-order calls; code-only for stock, double submit, and Stripe text |
| T12 | SEO | Titles, robots, sharing | Home `<title>` is “AR Makeup” and the description is “Try shades on a live camera…”. No `og:` tags (`src/app/layout.tsx` lines 17–19). `/robots.txt` and `/sitemap.xml` are 404. Product, cart, and account routes reuse the root title. Support, privacy, and terms set their own titles. | Low | Unique titles on product and skin results. Add a short robots file if the demo will be public. | HTTP |
| T13 | Chat widget | Narrow screen and keyboard access | The panel is `w-[360px]` inside `fixed bottom-6 right-6` (`Chatbot.tsx` line 243), so it is wider than a 320px screen. The open and send buttons have no accessible name (lines 260–263 and 443–447). | Low | Cap width with `w-[min(360px,calc(100vw-2rem))]` and add `aria-label`s. | code-only |
| T14 | Chat and skin limits | Burst traffic | Limits are in-memory (`src/lib/skin-analysis/rate-limit.ts` line 4): chat 12/min, skin 10/min, routine 8/min. A dev-server restart clears them. Not load-tested. | Low | Fine for one demo machine. Don’t describe it as a shared quota. | code-only |

Routine chain was read, not run, so it did not spend a Gemini call: `gemini-3.8-flash`, a second call only on 503, then Groq `openai/gpt-oss-120b` with the compact payload, then the rules routine (`src/lib/skin-analysis/ai-engine.ts` lines 92–112 and 198–247). A skin log insert sets `image_url: null` (`skin-analysis/route.ts` lines 306–309). Privacy copy matches that (`privacy/page.tsx` lines 22–26). The scan page also says a face service and a vision model read the photo (`scan/page.tsx` around the consent/help text). Questionnaire with `skinType: "NotAType"` returned HTTP 400 and did not insert a row.

`POST /api/foundation-match` with an image body returned HTTP 401 while signed out. The route is built to reject images (`foundation-match/route.ts` lines 10–29 and 182–186). No website page calls it.

## 3. Evaluator assessment

**Strengths**

- The shop is a real loop: catalog, shades, stock, cart, guest and signed-in orders, Stripe test checkout, cancel, COD, restock alert, reviews, buy-again.
- Stock is reserved in the database and released if checkout cannot start.
- Skin copy stays on the product-guide side of the line. The questionnaire, chat system prompt, privacy page, and routine prompt all say it is not a diagnosis. Photos are not written to `image_url`.
- Looks, the bag, and favourites are account features a phone demo can open on the web through the bridge.
- Product images fall back to a name card for blank, Open Beauty Facts, picsum, and placeholder URLs, and again if a photo fails to load (`product-visual.ts` lines 23–30, `ProductImageFace.tsx` lines 20–21). Today’s catalog is not using those placeholder URLs, and the 8 sampled files responded.
- Chat does not show provider error text. Admin data APIs reject a missing token.

**Weaknesses**

- The two AI fallbacks an examiner will hit are broken today: chat’s Groq model id, and skin vision’s retired `gemini-2.5-flash`.
- Guest checkout disagrees with itself about email.
- `/try-on` exists, is easy to miss, and tells a different story from the home page and the help page.
- Several “missing” URLs are HTTP 200. Brand filters split the same brand. Admin chrome looks open.
- Rate limits and the empty-cart guard live in one process or in the browser, so they are not visible to a curl of the page.

**Likely questions**

- Where is the live try-on? Answer: the phone. The website page is a lipstick/blush DeepAR preview and is not in the menu.
- Did you store my face? Answer: the skin log stores the profile and routine, not the picture. The picture is sent to Face++ and, if that fails, to a vision model. Say that plainly.
- How accurate is the skin result? Do not quote a percent. The UI should not add one.
- What if the model is down? Routine code falls through to rules. Chat, in this run, did not.
- Is checkout real? Stripe is in test mode. Say so before anyone types a card.
- Why do two Clinique filters exist, and why are 170 products out of stock?

## 4. Recommended new website features

Only three. None of these is a new payment provider, ads, a diagnosis, face-photo storage, an accuracy score, or a port of the phone camera.

1. **Foundation shade finder on the web** — What: a page or a foundation product block where the shopper picks a skin hex (or samples a local canvas) and sees ranked `fnd_` shades. Why: `POST /api/foundation-match` already does this and refuses photos, and no website screen calls it. How it fits: the phone keeps landmark sampling; the laptop demo still shows the matcher. Effort: M. Priority: high.
2. **“For your skin” on the catalog** — What: a filter or sort that uses the saved skin type and finish already passed into `ProductsClient` (`ProductsClient.tsx` around lines 1668–1673). Why: the profile is collected and then easy to ignore while browsing. How it fits: it joins skin analysis to the shop without another model. Effort: S. Priority: high.
3. **Catalog reply when chat providers fail** — What: if Gemini and Groq both fail, run the existing product search from the shopper’s last sentence and show those cards plus the one-sentence failure line. Why: this run had no model answer at all, and the tool already knows the catalog. How it fits: the advisor still works on demo day without a third provider. Effort: M. Priority: high.

## 5. Roadmap

**Must-fix (demo blockers)**

| Item | Impact | Effort |
| --- | --- | --- |
| T01 Groq chat model id | Chat works when Gemini is busy | S |
| T02 Vision model default, and bad-image vs busy | Photo scan fails honestly | S |
| T03 Guest email required in the form | Guest checkout completes | S |

**Quick UI wins**

| Item | Impact | Effort |
| --- | --- | --- |
| T06 One brand per filter | Filters match shopper expectations | S |
| T09 Label or hide `/try-on` so the story matches the phone | Fewer “where is the AR?” moments | S |
| T07 Admin sign-in wall | The admin screen does not look empty and public | S |
| T13 Chat panel width and button names | Usable on a phone width | S |
| T08 Stop returning Postgres text | Cleaner errors | S |

**High-impact features**

| Item | Impact | Effort |
| --- | --- | --- |
| Foundation finder (section 4) | A web-only result the phone API already supports | M |
| Catalog “for your skin” | Analysis changes what the shop shows | S |
| Chat catalog fallback | Advisor survives a 503 | M |

**Polish**

| Item | Impact | Effort |
| --- | --- | --- |
| T04 and T05 real 404s | Cleaner direct links | S |
| T11 titles | Sharper shared links | S |
| T11 Stripe public error sentence | No raw Stripe text | S |
| T10 Show the 400 face sentence on the scan page | Clearer retake guidance | S |

## 6. Demo day checklist

- Use the already-running site. Do not start a second `npm run dev`.
- Sign in with the demo account before skin, looks, or checkout. Show `/auth/bridge` only as the path the phone uses.
- Catalog: pick a product whose stock is above zero (170 products are at zero). Show a shade, add to cart, and the name-card only if a photo fails.
- Skin: prefer the questionnaire if the photo step says it is busy. Do not claim a percent. Say the photo is not stored.
- Chat: ask one short product question. If the failure sentence appears, use search on `/products` instead of retrying in a loop (12/min).
- Looks: open a look that exists, copy the link, and buy it only if the shades are in stock.
- Checkout: fill email for a guest. Use a Stripe test card only. Do not use a real card. Cancel once to show `/checkout/cancel`. Leave COD as a spoken option unless you want an unpaid order in the list.
- If you open `/try-on`, say it is lipstick and blush in the browser and that the live look is on the phone. Deny-camera was not verified in a browser.
- Admin: sign in as the admin account before showing `/admin`. A signed-out visit shows zeros.
- Have `/support` and `/privacy` ready for “is this medical?” and “do you keep the photo?”
