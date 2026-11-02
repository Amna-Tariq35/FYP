# Website audit and plan

Scope: `ar-makeup-web` only. This is the audit as of the original measurement, plus the later fixes.

The original findings stay as history. Read sections 1 and 2 that way: the first pass was HTTP against `http://localhost:3000`, or reading code, and nothing was clicked. The current state is in **Work since Batch 4** and **Performance**. The assessment, the roadmap, and the demo checklist are aligned to that later state. A status is Fixed only where the cited check actually ran.

Stripe keys in `.env.local` are test-mode (`sk_test` / `pk_test`). Secret values are not copied here. No payment was created.

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

The first pass did not click a browser. A later browser check is cited only on the rows that name one.

| ID | Feature | Scenario | Expected vs Actual | Severity | Suggested fix | Status | Verified by |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Chat | Empty `messages: []`, then one 4,000-character user message | Empty input should be ignored in the widget, and a real message should get a short product answer or the public failure sentence. Empty POST returned HTTP 200 in ~10ms with “I could not answer just now. Please try again.” (`src/lib/chat/public-error.ts` line 2). The long POST also returned that sentence (HTTP 200, ~27s). Server log: Gemini `gemini-3.8-flash` HTTP 503, then Groq `qwen-3.6-27b` HTTP 404 “model does not exist”. Widget disables empty send (`Chatbot.tsx` lines 228–233, 431). Limit is 12/min (`src/app/api/chat/route.ts` line 248). | High | Point Groq at a model this key can call. Keep the one-sentence failure. Gemini 503 is not retried in chat (routine retry is separate). | Fixed | curl: Groq models GET and a completion; 503 retry was code trace. Public sentence kept. Not a browser test. |
| T02 | Skin photo | Garbage `imageBase64` (`aaaa`) | A bad image should say the photo cannot be read, and offer the questionnaire. Face++ returned `IMAGE_ERROR_UNSUPPORTED_FORMAT` (`src/app/api/skin-analysis/route.ts` lines 354–372). That string does not match `IMAGE_FILE`, so it is not turned into `FACE_NOT_CLEAR`. Gemini vision then called the default `gemini-2.5-flash` (`route.ts` line 384; `GEMINI_VISION_MODEL` is unset) and Google returned 404, telling the caller to use `gemini-3.8-flash`. Public result was HTTP 503 `PHOTO_ANALYSIS_UNAVAILABLE` (“busy”), not a bad-photo error. The scan page would show the questionnaire fallback for that code (`scan/page.tsx` lines 117–122). A real face photo was not sent. | High | Default the vision fallback to `gemini-3.8-flash`. Treat unsupported-image errors as `FACE_NOT_CLEAR` (400), not as “busy”. | Fixed | curl: imageBase64 aaaa returned HTTP 400 with code FACE_NOT_CLEAR. Not a browser test. |
| T03 | Checkout | Guest with no email | The form should not send a guest order the server will reject. Email is optional (`ShippingForm.tsx` lines 121–124). Payment copy says an email is only for tracking (`PaymentPanel.tsx` lines 255–268). `POST /api/orders` requires an email when there is no user (`src/app/api/orders/route.ts` lines 191–192). | High | Require email for guests on the shipping step, matching the server. | Fixed | code trace only. Not a browser test. |
| T04 | Catalog | `/products/not-a-real-key` | HTTP 404 and the not-found page. `notFound()` runs (`src/app/products/[product_key]/page.tsx` line 37) and the RSC payload is the “Product not found” heading, but the status was HTTP 200. `/no-such-route` was a real 404. | Medium | Make the missing-product response a 404. | Fixed | curl: `/products/not-a-real-key` HTTP 404; real key `fnd_maybelline_fitme_liquid` HTTP 200. `notFound()` alone stayed HTTP 200, so `src/proxy.ts` returns the 404. Not a browser test. |
| T05 | Looks and skin report | Direct bad ids | A missing look or report should not look like a successful page to a crawler. Both URLs were HTTP 200 shells. The look “not found” UI is client-side after Supabase (`src/app/looks/[id]/page.tsx` lines 490–501). `GET /api/skin-analysis/not-a-real-id` was HTTP 404; the page then shows “Could not load this report” (`results/[sessionId]/page.tsx` lines 324–331). That second step was not clicked. | Medium | Return 404 from the server once the id is known to be missing. | Fixed | curl: bad look id and a missing uuid HTTP 404; a real look HTTP 200, including `?action=buy`; `/auth/bridge` HTTP 200. Bad skin id and a missing uuid HTTP 404; a guest report (null user_id) HTTP 200; a signed-out request for someone else’s report HTTP 404 with the same body as a missing id. Signed-in owner path is a code trace of `ownsLog`. Look page file was not edited. Not a browser test. |
| T06 | Catalog filters | Brand list | One entry per brand. Facets include both `Clinique` and `CLINIQUE`, and the same for Becca, Estée Lauder, Shiseido, Smashbox, Supergoop!, Too Faced. Brands are stored with `Set.add` and no case fold (`src/lib/catalog/listing.ts` line 267). | Medium | Fold brand keys when building facets, and filter with the same fold. | Fixed | curl: facets had 0 case-duplicates; brand=Clinique returned 59 products. Not a browser test. |
| T07 | Admin | Open `/admin` with no session | A locked screen. The HTML is HTTP 200. `GET /api/admin/dashboard` and `GET /api/admin/orders` returned 401. The page still finishes loading and keeps zeroed stats when the response is not ok (`src/app/admin/page.tsx` lines 51–64). Admin identity is `user.email === "admin@makeup.com"` (`src/lib/adminAuth.ts` line 22). Later Playwright Chromium shows “Admin sign-in required” and no alert. | Medium | If the dashboard call is 401/403, render a sign-in gate instead of a zero dashboard. | Fixed in Chromium | Playwright Chromium: “Admin sign-in required”. No alert. Curl of dashboard and orders returned 401 without a session. Products page left as-is. |
| T08 | Guest order | `GET /api/orders/guest?guest_token=not-a-token` | “Order not found” and nothing else. Actual body included `details`: `invalid input syntax for type uuid`. That is `orderErr.message` (`src/app/api/orders/guest/route.ts` lines 52–55). | Medium | Drop `details` from the public JSON. | Fixed | curl: guest token not-a-token returned HTTP 404 `{"error":"Order not found."}`. Not a browser test. |
| T09 | Try-on | Camera denied, no camera, or the page is hard to find | A shopper should find try-on, and a denied camera should still show shades. Nav links are only Home, Products, and Skin Analysis (`Navbar.tsx` lines 56–62). Home and support say the full camera is the Android app (`MobileCTA.tsx` lines 17–20, `support/page.tsx` lines 21–27). `/try-on` is HTTP 200 and is not linked. On init failure the overlay is “Could not initialize camera” plus retry (`try-on/page.tsx` lines 178–182 and 430). There is no still-image shade preview. DeepAR is lipstick and blush only. The license key is hardcoded in the client component (lines 37–38). The key is not repeated here. This path was not clicked. Later: DeepAR starts when the shopper clicks Start camera, not on first paint. If the camera prompt never resolves, “Browse shades without camera” keeps the selected shade, turns the camera off, and does not start DeepAR. | Medium | Either link `/try-on` and label it “lipstick and blush preview”, or remove it from the demo story. Keep the phone as the live AR. On camera failure, keep the shade list usable. Move the license to an env var. | Fixed in Chromium | Production build: DeepAR starts on Start camera, not on first paint. Playwright Chromium: `getUserMedia` never resolves; “Browse shades without camera”; a shade stays selected; the camera returns to off; the Live Preview badge does not appear. Nav, home, and the license env are a code trace. Key not printed. Firefox was not launched for this test. |
| T10 | Skin scan | Camera denied or a file that is not a face | Denied camera offers upload (`scan/page.tsx` lines 296–304). A non-image fails image decode and shows “The photo could not be read” (lines 139–141). A 400 from the API, including a clear face error, is replaced with that same generic sentence (lines 124–125). Not clicked. | Medium | Show the server’s face-not-clear sentence when the status is 400. | Fixed | curl body included FACE_NOT_CLEAR; scan page behavior is a code trace. Not a browser test. |
| T11 | Checkout | Empty cart, invalid fields, double submit, out of stock, payment failure | Empty `POST /api/orders` with `{}` was HTTP 400 “Missing shipping info.” `POST /api/checkout` with `{}` was 400 “Missing orderId”. A fake order id was 404 “Order not found.” No Stripe session was created. The shipping form blocks empty required fields (`ShippingForm.tsx` lines 29–45, 86–99). Empty cart is a client redirect (`CheckoutGuard.tsx` lines 24–29) while `GET /checkout/shipping` is still HTTP 200. Double submit is blocked with `placingRef` during the request, then cleared in `finally` before navigation (`PaymentPanel.tsx` lines 49–50 and 174–176). Out of stock is a 409 after `reserve_product_stock` fails (`orders/route.ts` lines 198–214, `db/005_commerce_inventory.sql` lines 81–82). A failed Stripe create returns `stripeError.message` to the browser (`checkout/route.ts` lines 122–123). Stock and Stripe failure were not executed, so no order row was reserved. | Medium for the raw Stripe message and the empty-cart HTTP 200; the guards themselves match the code | Keep stock checks. Return a fixed sentence for Stripe failures. Optional: don’t serve the shipping form until the cart has a selection. | Fixed | Stripe public sentence and stock release are a code trace. Empty cart on shipping and payment is a code trace of CheckoutGuard (not clicked). Success and cancel pages were not changed. Not a browser test. |
| T12 | SEO | Titles, robots, sharing | Home `<title>` is “AR Makeup” and the description is “Try shades on a live camera…”. No `og:` tags (`src/app/layout.tsx` lines 17–19). `/robots.txt` and `/sitemap.xml` are 404. Product, cart, and account routes reuse the root title. Support, privacy, and terms set their own titles. | Low | Unique titles on product and skin results. Add a short robots file if the demo will be public. | Fixed | curl: `/robots.txt` and `/sitemap.xml` HTTP 200. Home title `AR Makeup`; product title uses the product name and brand. Skin results title `Skin results`. og:title, og:description, og:type present; no og:image. Sitemap lists public static pages only. Product URLs were left out: the catalog helper returns 9 rows per page. Not a browser test. |
| T13 | Chat widget | Narrow screen and keyboard access | The panel is `w-[360px]` inside `fixed bottom-6 right-6` (`Chatbot.tsx` line 243), so it is wider than a 320px screen. The open and send buttons have no accessible name (lines 260–263 and 443–447). | Low | Cap width with `w-[min(360px,calc(100vw-2rem))]` and add `aria-label`s. | Fixed | code trace. Not a browser test. |
| T14 | Chat and skin limits | Burst traffic | Limits are in-memory (`src/lib/skin-analysis/rate-limit.ts` line 4): chat 12/min, skin 10/min, routine 8/min. A dev-server restart clears them. Not load-tested. | Low | Fine for one demo machine. Don’t describe it as a shared quota. | Not fixed (accepted for demo) | code trace. In-memory limits are a note, not a fix. Not a browser test. |

Routine chain was read, not run, so it did not spend a Gemini call: `gemini-3.8-flash`, a second call only on 503, then Groq `openai/gpt-oss-120b` with the compact payload, then the rules routine (`src/lib/skin-analysis/ai-engine.ts` lines 92–112 and 198–247). A skin log insert sets `image_url: null` (`skin-analysis/route.ts` lines 306–309). Privacy copy matches that (`privacy/page.tsx` lines 22–26). The scan page also says a face service and a vision model read the photo (`scan/page.tsx` around the consent/help text). Questionnaire with `skinType: "NotAType"` returned HTTP 400 and did not insert a row.

`POST /api/foundation-match` with an image body returned HTTP 401 while signed out. The route is built to reject images (`foundation-match/route.ts` lines 10–29 and 182–186). No website page calls it.

## New website features

| ID | Feature | Status | Verified by |
| --- | --- | --- | --- |
| A | For your skin | Done | curl catalog ranking; signed-out HTML `userProfile` null; prompt UI code trace. Not a browser test. |
| B | Chat catalog fallback | Done | curl empty, normal, and a forced failure that was then reverted. Not a browser test. |
| C | Shade match on account | Done | signed-out curl of `GET /api/account/shade-match` returned 401; signed-in row is a code trace. Not a browser test. |

## 3. Evaluator assessment

Current state. Numbers are the ones already measured. Original broken-fallback, HTTP 200, and open-admin notes are history in section 2.

**Strengths**

- The shop loop is in place: 1,123 products, shades, stock, cart, guest and signed-in orders, Stripe test checkout, cancel, cash on delivery, restock alerts, reviews, and buy-again. Stock is reserved in the database and released if checkout cannot start.
- Missing product and look URLs return HTTP 404 (curl). Brand facets are folded: Clinique is one entry and returned 59 products. Signed-out `/admin` is the “Admin sign-in required” screen in Chromium, with no alert. Data APIs still return 401 without a session.
- Skin copy says this is not a diagnosis. The skin log stores the profile and routine, not the picture. A rules routine shows at once as Quick routine. A model answer can change the label to Personalized for you.
- Chat stays on catalog products. After the model reorder, curled medians were about 0.8 s (normal 791 ms, product 891 ms, all `gemini-3.5-flash-lite`). Later live calls were 1.9–2.9 s (1,865 ms and 2,853 ms). If providers fail, the shopper gets catalog cards or the one public failure sentence.
- Home mobile Lighthouse is 89, LCP 3.6 s (was 69 / 14.0 s). Try-on is 74, LCP 3.7 s, TBT 620 ms (was 51 / TBT 2,230 ms). Catalog cold `GET /api/catalog/products?page=1` was 740 ms; the next request was about 10 ms.
- Website DeepAR is lipstick and blush only, and it starts on Start camera, not on first paint. If the prompt never resolves, Browse shades without camera keeps the shade list. The full camera is the Android app.

**Weaknesses**

- Free-tier Gemini, Groq, and Face++ quotas are real. `gemini-3.8-flash` returned 429 and is not a proven working model.
- The routine cache and the chat, skin, and routine rate limits live in one process. A restart clears them. T14 is not fixed. Do not call that a shared quota.
- Catalog prices are USD. A saved look is publicly readable by id.
- Chromium offline reload of products and checkout is a blank document. Firefox and WebKit still have test limits. The camera escape hatch was not repeated in a real Firefox window. WebKit back from the questionnaire stayed on the questionnaire.
- Not verified on a real phone or with a real face. No Content-Security-Policy and no HSTS. Supabase sign-in was code-traced, not clicked, for these notes. Guest email, the Stripe public error sentence, and the chat panel width are code traces, not browser tests.

**Likely questions**

- Where is the live try-on? The Android app. This site is lipstick and blush. DeepAR starts on Start camera. Use Browse shades without camera if the prompt hangs.
- Did you store my face? The log stores the profile and routine, not the picture. The picture is sent to Face++ and, if needed, a vision model. A real selfie was not sent.
- How accurate is the skin result? Do not quote a percent. Quick routine is the rules result. Personalized for you only after a model answer.
- What if the model is down? The routine stays on the rules result. Chat can show catalog cards. Free-tier quota is the practical limit. Curled chat after the reorder was about 0.8 s median; later live calls were 1.9–2.9 s.
- Is checkout real? Stripe is test mode. Say so before a card. Guest checkout needs an email. The hosted Stripe page and a signed-in order were not completed in these notes.
- Why is the first catalog load slower? Cold catalog was 740 ms; warm was about 10 ms. Home LCP is 3.6 s, down from 14.0 s. 170 products were at zero stock in the original census.

## 4. Recommended new website features

History only. These were the three recommendations from the first pass. None of them is a new payment provider, ads, a diagnosis, face-photo storage, an accuracy score, or a port of the phone camera.

1. **Foundation shade finder on the web** — Not built: the phone app already has it; replaced by the read-only shade-match card on `/account`. What was proposed: a page or a foundation product block where the shopper picks a skin hex (or samples a local canvas) and sees ranked `fnd_` shades. `POST /api/foundation-match` already does this and refuses photos. The phone keeps landmark sampling. Effort: M. Priority was high.
2. **“For your skin” on the catalog** — Done. A filter uses the saved skin type when someone is signed in. Signed out, it does not invent a profile. Effort was S.
3. **Catalog reply when chat providers fail** — Done. If the model path fails, the shopper gets catalog cards or the one-sentence failure line. Effort was M.

## 5. Roadmap

Status is taken from the test table and from **Work since Batch 4**. Code trace is not a browser pass.

**Done**

| Item | Status |
| --- | --- |
| T01 Groq chat model, then the chat reorder | Done (curl). Medians about 0.8 s after the reorder; later live calls 1.9–2.9 s |
| T02 Bad image vs busy | Done (curl): garbage image is HTTP 400 `FACE_NOT_CLEAR` |
| T03 Guest email required on the form | Done (code trace only) |
| T04 and T05 real 404s | Done (curl) |
| T06 One brand per filter | Done (curl). Clinique returned 59 products |
| T07 Admin sign-in wall | Done in Chromium. “Admin sign-in required”. No alert |
| T08 No Postgres text on a bad guest token | Done (curl) |
| T09 Try-on story | Done in Chromium for the camera path. DeepAR starts on Start camera. “Browse shades without camera” if the prompt never resolves. Nav and the license env are a code trace |
| T10 Face-not-clear sentence on the scan page | Done (code trace; the 400 body was curled) |
| T11 Stripe public error sentence | Done (code trace only) |
| T12 Titles, robots, sitemap | Done (curl). The old roadmap row called this T11. No `og:image`. Product URLs were left out of the sitemap |
| T13 Chat panel width and button names | Done (code trace only) |
| Catalog “for your skin” | Done |
| Chat catalog fallback | Done |

**Remaining**

| Item | Status |
| --- | --- |
| T14 In-memory chat, skin, and routine limits | Not fixed (accepted for demo). A restart clears them |
| Foundation finder (section 4) | Not built. The phone app already has it. The website surface is the read-only shade-match card on `/account` |
| `gemini-3.8-flash` | Quota unverified (429). Not a proven working model |
| Chromium offline reload | Blank document for products and checkout. No in-app offline screen |
| Firefox and WebKit | Test limits remain. The camera escape hatch was not repeated in Firefox. WebKit back from the questionnaire stayed on the questionnaire |
| CSP and HSTS | Not set |
| Real device | See the list at the end |

## 6. Demo day checklist

Matches `DEMO_SCRIPT.md`. Speak the fallback and move on. Do not read passwords or keys.

- Production server on port 3010: `npm run build`, then `npm run start -- -H 127.0.0.1 -p 3010`. Do not start a second `npm run dev`. Warm Home, Products, and the pages you will show. The routine cache is empty after a restart. Check Gemini, Groq, and Face++ quotas. If a quota is spent, use the questionnaire and Quick routine.
- Sign in as the demo account in the projected browser. Keep the admin account in a second tab. Stripe is test mode. Never use a real card.
- Home: the phone has the full camera. The site is catalog, skin guidance, checkout, and a lipstick and blush preview. Point at **Browse Products** and **Lipstick and blush preview**.
- Products: Brand **Clinique** is one entry. **For your skin** uses a saved skin type when signed in, and does not invent one when signed out. Prices are USD. Open one in-stock product, pick a shade, and add to cart. The name card is the fallback if a photo fails.
- Try-on: nav **Try-On**, or the home preview link. DeepAR starts on **Start camera**, lipstick and blush only. If the prompt sits or permission is denied, click **Browse shades without camera**. The full camera is the Android app.
- Skin: the photo is sent for a product suggestion, is not stored as the picture, and is not a diagnosis. If the camera prompt does not finish, **Skip, upload a photo instead**. If the servers are busy or the face is not clear, use the questionnaire. On results, Quick routine shows at once. Personalized for you only if the model answers. No accuracy percent. If the report 404s, submit the questionnaire again. Do not paste a guessed id.
- Chat, three questions: “lipstick” (catalog products); “blush under $1” (closest matches; the cheapest measured blush was $4); “asdfgh” (no cards, points at the catalog). If the failure sentence appears, use Products search. The limit is 12 chats a minute on this process.
- Guest checkout needs an email. Card uses the Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code, or cancel and show `/checkout/cancel`. Cash on delivery does not mark the order paid. Guest tracking is the link on the success page. A signed-in shopper uses My orders.
- Looks: on the phone, open the bag and a saved look. A look link is readable by anyone with the id. If the phone is not in the room, `/makeup-bag` and `/my-looks` are the account lists, not the live camera.
- Admin: signed out, or in a private window, `/admin` says “Admin sign-in required”. No alert. Sign in as admin only if time remains. Do not show the password.
- If asked: live try-on is the phone; the photo is not stored; no percent; a down model means the rules routine or catalog cards; checkout is test mode.

## Work since Batch 4

These rows are the later checks. “Fixed” is used only where the cited check actually ran. “Code trace only” was not re-run in the browser.

| Item | Status | Verified by |
| --- | --- | --- |
| Chat wait. The multi-minute hang was an unbounded Gemini/Groq wait. Order is now `gemini-3.5-flash-lite` first (`CHATBOT_GOOGLE_KEY`), `gemini-3.8-flash` second, Groq hedge `openai/gpt-oss-120b` on `GROQ_API_KEY`, then catalog cards. Routine and vision Gemini use `GEMINI_API_KEY`. Routine Groq uses `GROQ_SKINCARE_API_KEY` (not the chat key). Rate-limit keys are `chat:` and `routine:`. | Fixed for the reorder that was curled | Curl after the reorder: normal median 791 ms, worst 1,225 ms; product median 891 ms, worst 1,428 ms; every sample `gemini-3.5-flash-lite`. Later live production chat: 2,853 ms and 1,865 ms, same model. The widget was not browser-tested at the time of those speed curls. Later Playwright covered mocked chat only. |
| Chat tool-call abort (“??” bubble) | Fixed for the HTTP check | Curl HTTP 200 in 8.6 s with text and 5 cards. No browser click of that page. |
| Chat search. Synonyms map to real slugs. Relaxed filters return relaxed flags and honest copy. Currency is USD `$`. | Fixed for the curled examples | Blush under $1: “Nothing under $1.00, these are the closest”, 5 products, cheapest $4, 5.5 s. |
| Groq follow-ups. Resending full product JSON hit the 8,000 TPM limit. Follow-ups now send a short summary. | Fixed for the three curled follow-ups | After lipstick: cheaper 5 cards / 1.3 s, darker shade 5 / 1.4 s, dry skin 5 / 1.3 s. |
| Roman Urdu and nonsense | Fixed for those curls | Roman Urdu 10/10 with no catalog fallback. `asdfgh`: 0 cards, a no-match sentence and `/products`, 0.2 s. |
| Gemini thought-signature warning | Fixed for the one follow-up that was tested | That follow-up no longer logged the warning. Not a general proof for every chat. |
| Forced chat-failure code | Reverted | The force path was removed after the fallback check. Not left enabled. |
| Skin routine. Rules show at once as Quick routine; an AI result swaps the label to Personalized for you. In-memory routine cache is 6 h / 100 entries and is not a database table. Gemini hedges to Groq at 8 s. Photo JPEG is max 1,024 px. Face++ gets one 8 s try, then Gemini vision. `FACE_NOT_CLEAR` is still HTTP 400. | Not fully re-run | Code trace, plus earlier curls. Not all of this was repeated in the last session. Playwright’s results-page case is in the suite, and the latest full run did not prove it (see the test-limit row). |
| Routine and vision model chain. Defaults are `gemini-3.8-flash`, then `gemini-3.5-flash-lite`. A 404 skips that model for 10 minutes. A 429 skips it for 60 s. | `gemini-3.5-flash-lite` verified. `gemini-3.8-flash` is quota unverified, not proven working | Only `gemini-3.5-flash-lite` returned HTTP 200 for routine JSON and for vision. `gemini-3.8-flash` returned 429 and was not shown to succeed. |
| Chain deadlines after the prompt shrink | Code trace of the limits; one timed call | One healthy Gemini routine call was 9.7 s after the shrink. The chain aborts at 40 s Gemini / 18 s Groq / 50 s total, then the rules routine. No new median was measured for this note. |
| Production images and Lighthouse on port 3010 | Measured | Hero 1,841,743 bytes to WebP 40,820. Placeholder 2,295,438 bytes to WebP 113,400. Home mobile Lighthouse 89, LCP 3.6 s (was 69 / 14.0 s). Try-on 74, LCP 3.7 s, TBT 620 ms (was 51 / TBT 2,230 ms). |
| `Cache-Control` on `/images` and `/effects` | Measured | `public, max-age=86400, stale-while-revalidate=604800`. |
| Signed-out `/admin` | Fixed in Chromium | Playwright Chromium shows “Admin sign-in required”. No alert. |
| DeepAR start | Measured on the production build | DeepAR starts when the shopper clicks Start camera, not on first paint. |
| Security headers | Measured | `nosniff`, `strict-origin-when-cross-origin`, `SAMEORIGIN`, `camera=(self)`, `microphone=()`, `geolocation=()`. No CSP. No HSTS. |
| Supabase auth | Code trace only | Not a browser sign-in test. |
| Axe | Fixed for the recorded pages | 9 pages at 375 and 1,280 after contrast, heading, and main fixes: no remaining violations after fades settled. |
| Client bundle auth role | Inspected | JWT role in the client bundle is `anon`. The token was not printed. |
| Camera timers | Fixed in Chromium for the scripted cases | Playwright: a 20 s delayed grant does not fail the page. A hang after grant shows Retry in 11–16 s. “Still starting...” is at 6 s, and only after `getUserMedia` resolves. |
| Camera permission prompt that never resolves (Firefox) | Fixed for the scripted Chromium case | This wrap-up. Playwright Chromium, `getUserMedia` never resolves. Scan shows “Skip, upload a photo instead” and that control uses the existing file input (invalid file ends on “The photo could not be read. Please try again.”). Try-on shows “Browse shades without camera”; a shade stays selected; the camera returns to off; the Live Preview badge does not appear, so DeepAR did not start. No timer is armed until `getUserMedia` resolves. Firefox was not launched for this test. |
| Full Playwright, latest run before this escape hatch | Recorded, not all green | 77 passed, 49 skipped, 7 failed. The failures were classified as test limits: Chromium offline reload is a blank document; skin results 404 because `skinGuard` rejects unknown ids before the mock; Firefox camera prompt never resolves (the escape hatch above is the product fix; that Firefox click was not repeated here); WebKit back stayed on the questionnaire. |
| Catalog latency | From the Phase 1 report, not re-measured here | Cold `GET /api/catalog/products?page=1` 740 ms. The next request was about 10 ms. |

## Performance

Before and after, same machine, production port 3010 unless noted.

| Check | Before | After |
| --- | --- | --- |
| Home mobile Lighthouse | 69, LCP 14.0 s | 89, LCP 3.6 s |
| Try-on mobile Lighthouse | 51, TBT 2,230 ms | 74, LCP 3.7 s, TBT 620 ms |
| Hero image | 1,841,743 bytes | WebP 40,820 bytes |
| Product placeholder | 2,295,438 bytes | WebP 113,400 bytes |
| Chat after the model reorder | unbounded wait (the 4 minute bug) | normal median 791 ms, worst 1,225 ms; product median 891 ms, worst 1,428 ms; all `gemini-3.5-flash-lite` |
| Later live production chat | — | 2,853 ms and 1,865 ms, `gemini-3.5-flash-lite`. Widget was not clicked for those two curls |
| Routine | — | One healthy Gemini routine call 9.7 s after the shrink. Abort at 40 s Gemini / 18 s Groq / 50 s total, then rules. Not a new median |
| Catalog | — | Cold 740 ms, warm about 10 ms (Phase 1 report) |

## Known limitations

- Free-tier Gemini, Groq, and Face++ quotas are real. `gemini-3.8-flash` is quota unverified (429), not a proven model. Fallbacks are the other Gemini id, Groq, catalog cards, or the rules routine.
- Routine cache, chat and routine rate limits, and the 404/429 model skips live in one server process. A restart clears them. There is no routine cache table.
- Catalog prices are USD.
- Saved looks are publicly readable by id (`RLS` using `true`). Anyone with the link can open a look.
- Chromium offline reload of products and checkout is a blank document. Firefox and WebKit kept the last page in that test. There is no in-app offline screen.
- Firefox and WebKit still have test limits. The Firefox camera prompt that never resolves was not clicked again in a real Firefox window for the escape hatch. WebKit back from the questionnaire stayed on the questionnaire in the latest full run.
- Not verified on a real phone or with a real face.
- The website DeepAR preview is lipstick and blush only. The full camera is the Android app.
- No Content-Security-Policy and no HSTS.
- Supabase sign-in, sign-out, and the auth bridge were code-traced, not clicked, for the notes above.

## How to run the tests

Leave any `npm run dev` the user already started alone. Use a separate production process.

```bash
cd ar-makeup-web
npm run build
npm run start -- -H 127.0.0.1 -p 3010
```

In a second terminal, with that server already listening:

```bash
cd ar-makeup-web
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:3010
npm run test:e2e
```

PowerShell uses `$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3010"` instead of `set`. `npm run test:e2e` is `playwright test`. The config default base URL is `http://127.0.0.1:3010`. Stop only the production server you started for the run.

## Not verified on a real device

- A real selfie through Face++ and Gemini vision
- A real phone
- The Stripe hosted page
- The signed-in order flow
- Admin actions after the sign-in screen (Chromium checked the signed-out gate only: “Admin sign-in required”, no alert)
