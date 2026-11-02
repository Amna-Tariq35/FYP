# Phase 1 measurement report

Measurement only. Application source under `src/` was not changed. No orders, Stripe sessions, or database rows were created. The production server started for this pass was stopped at the end. The dev server was not running and was not killed.

Command to rerun the browser tests, with the production server already listening:

```bash
cd ar-makeup-web
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:3010
npm run test:e2e
```

`npm run test:e2e` is `playwright test`. The config default base URL is `http://127.0.0.1:3010`.

## 1. Environment

| Item | Value |
| --- | --- |
| Build | `npm run build` succeeded. Next.js 16.1.4 (Turbopack). Compile 12.2s, full build about 41s. `.env.local` was loaded at build time. |
| Server | `npm run start -- -p 3010` on `127.0.0.1:3010`. Stopped when measurement finished (node pid 3840). |
| Machine | Windows 11 Pro 10.0.26200, AMD Ryzen 5 7430U, about 7.4 GB visible RAM. Node v24.13.0, npm 10.8.2. |
| Lighthouse | `npx lighthouse` 13.6.0, system Chrome. Not added as a dependency. Mobile: simulated throttling, RTT 150 ms, about 1.6 Mbps, CPU 4x. Desktop preset: simulated throttling, RTT 40 ms, 10 Mbps, CPU 1x. 18/18 reports. An earlier attempt failed because the CLI was quoted wrong; those numbers were discarded and the runs below are the successful ones. |
| Playwright | `@playwright/test` 1.64.1 and `@axe-core/playwright` 4.14.0 installed as devDependencies. Chromium, Firefox, and WebKit all ran. The first browser install failed on `Winldd` (`ENOTFOUND cdn.playwright.dev`). A retry downloaded Winldd and the suite ran. |
| Not run | Live `POST /api/skin-analysis` questionnaire (it inserts `skin_analysis_logs`). Live `POST /api/generate-routine` (no readable existing analysis id). Missing `NEXT_PUBLIC_DEEPAR_LICENSE_KEY` (inlined at build time; a second `next start` cannot remove it). Checkout tab order (the keyboard test stopped before that step). Real phone camera and a real face photo. |

## 2. Lighthouse

Scores are 0–100. LCP, FCP, and TBT are Lighthouse display values. CLS is unitless.

| Page | Form | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT | FCP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | mobile | 69 | 96 | 100 | 100 | 14.0 s | 0 | 270 ms | 1.1 s |
| `/` | desktop | 89 | 96 | 100 | 100 | 2.2 s | 0 | 10 ms | 0.3 s |
| `/products` | mobile | 75 | 85 | 81 | 100 | 6.1 s | 0 | 170 ms | 1.2 s |
| `/products` | desktop | 97 | 79 | 81 | 100 | 1.2 s | 0 | 0 ms | 0.3 s |
| `/products/fnd_maybelline_fitme_liquid` | mobile | 81 | 96 | 96 | 100 | 4.1 s | 0 | 270 ms | 1.1 s |
| `/products/fnd_maybelline_fitme_liquid` | desktop | 100 | 96 | 96 | 100 | 0.8 s | 0 | 0 ms | 0.3 s |
| `/skin-analysis` | mobile | 73 | 100 | 100 | 100 | 4.9 s | 0 | 370 ms | 1.1 s |
| `/skin-analysis` | desktop | 98 | 96 | 100 | 100 | 1.2 s | 0 | 0 ms | 0.3 s |
| `/skin-analysis/questionnaire` | mobile | 91 | 93 | 100 | 100 | 1.1 s | 0 | 370 ms | 1.1 s |
| `/skin-analysis/questionnaire` | desktop | 100 | 93 | 100 | 100 | 0.3 s | 0 | 10 ms | 0.3 s |
| `/try-on` | mobile | 51 | 86 | 96 | 100 | 5.5 s | 0 | 2,230 ms | 1.1 s |
| `/try-on` | desktop | 84 | 86 | 96 | 100 | 1.5 s | 0.009 | 290 ms | 0.3 s |
| `/cart` | mobile | 92 | 95 | 100 | 100 | 1.1 s | 0 | 360 ms | 1.1 s |
| `/cart` | desktop | 100 | 95 | 100 | 100 | 0.3 s | 0 | 0 ms | 0.3 s |
| `/checkout/shipping` | mobile | 81 | 93 | 100 | 63 | 3.8 s | 0 | 360 ms | 1.1 s |
| `/checkout/shipping` | desktop | 99 | 93 | 100 | 63 | 0.8 s | 0.044 | 10 ms | 0.3 s |
| `/support` | mobile | 93 | 93 | 100 | 100 | 1.1 s | 0 | 310 ms | 1.1 s |
| `/support` | desktop | 100 | 93 | 100 | 100 | 0.3 s | 0 | 10 ms | 0.3 s |

Pages under 90, with the strongest measured causes (Lighthouse audits, not guesses):

- `/` mobile performance 69: LCP 14.0 s. `image-delivery-insight` estimates 1,640 KiB savings. The hero request was ` /images/hero_model.png`, transfer 1,842,028 bytes. Also unused JavaScript, about 196 KiB.
- `/` desktop performance 89: LCP 2.2 s, same hero and unused JavaScript (about 196 KiB).
- `/products` mobile performance 75: LCP 6.1 s, TBT 170 ms, unused JavaScript about 195 KiB.
- `/products` accessibility 79 desktop / 85 mobile: color contrast, heading order, unlabeled price-range inputs, unlabeled `<select>`. Mobile also has a link with no accessible name (wishlist control).
- `/products` best practices 81 both forms: one HTTP image, `http://beautyofjoseon.com/cdn/shop/files/01_0805__-_EU_UK.jpg`.
- Product page mobile performance 81: LCP 4.1 s, TBT 270 ms, unused JavaScript about 194 KiB.
- `/skin-analysis` mobile performance 73: LCP 4.9 s, TBT 370 ms, unused JavaScript about 183 KiB.
- `/try-on` mobile performance 51: LCP 5.5 s, TBT 2,230 ms, max FID 1,390 ms, TTI 14.8 s, unused JavaScript about 243 KiB. Network included `/effects/makeup.deepar` (2,151,668 bytes), `deepar.wasm` from jsDelivr (about 594 KB), Google Fonts CSS, and `https://api.developer.deepar.ai/validate`.
- `/try-on` desktop performance 84: LCP 1.5 s, TBT 290 ms, total weight 3,428 KiB. Accessibility 86 both forms: contrast, heading order, no `main` landmark, unlabeled `<select>`.
- `/checkout/shipping` mobile performance 81: LCP 3.8 s, TBT 360 ms. SEO 63 both forms: `is-crawlable` failed because `robots.txt` disallows `/checkout`.

## 2b. API latency

Times are milliseconds from `fetch` on this machine against port 3010. Median is the middle of 5 runs. The first catalog request after the server printed Ready is separate from the 5-run set.

| Endpoint | Status | Median | Worst | Note |
| --- | --- | --- | --- | --- |
| `GET /api/catalog/products?page=1` cold | 200 | 740 | — | First catalog request after start. One sample. |
| same, immediate warm | 200 | 10 | — | Second request. |
| `GET /api/catalog/products?page=1` | 200 | 12 | 74 | 5 later runs. 1,123 products, page size 9. |
| `GET /api/catalog/products?brand=Clinique` | 200 | 9 | 706 | 59 matches. Returned `brand` values were `CLINIQUE`. |
| `GET /api/catalog/products?q=lipstick` | 200 | 7 | 467 | |
| `GET /api/catalog/products?forSkin=1&skinType=Dry` | 200 | 5 | 996 | `forSkin=1` is required or `skinType` is ignored. |
| `GET /api/catalog/lookup?keys=fnd_maybelline_fitme_liquid` | 200 | 5 | 345 | |
| `POST /api/skin-analysis` invalid questionnaire | 400 | 8 | 23 | Body `{"method":"questionnaire"}`. Does not insert. Message: "Please check your skin type and concerns, then try again." |
| `POST /api/skin-analysis` valid questionnaire | — | — | — | Skipped to avoid inserting a row. |
| `GET /api/skin-analysis/1dded255-3500-4010-8039-fc44816d0c50` | 404 | 163 | 222 | Body `{"error":"Analysis not found."}`. No existing id was readable without creating one. |
| `GET /api/orders/guest?guest_token=not-a-token` | 404 | 144 | 193 | Body `{"error":"Order not found."}`. |
| `POST /api/chat` normal | 200 | 2,853 | — | One call. Text: combination-skin moisturizer question. Server log: `[chat] gemini/gemini-3.5-flash-lite`, first token 1,489 ms. Not a 429. |
| `POST /api/chat` product | 200 | 1,865 | — | One call. Text: red lipstick under $20. Same provider, first token 669 ms. Not a 429. |
| `POST /api/generate-routine` | — | — | — | Skipped. It needs an analysis id. The known id 404s, and a successful call would write `routine_snapshot`. |

The worst catalog sample was almost always the first run of a new query (706, 467, 996, 345 ms). The next four runs were 4–13 ms.

### Cache headers actually sent

| Resource | Cache-Control | ETag |
| --- | --- | --- |
| `GET /api/catalog/products` | `private, max-age=0, must-revalidate` | none |
| Product page `/products/fnd_maybelline_fitme_liquid` | `private, no-cache, no-store, max-age=0, must-revalidate` | none |
| `/` , `/try-on`, `/skin-analysis`, `/skin-analysis/scan` | `s-maxage=31536000` and `x-nextjs-cache: HIT` on the static HTML | weak/strong etag present on `/` |
| `/images/hero_model.png` | `public, max-age=0` | `W/"1c1a4f-19bf0c6bd25"` |
| `/images/product_placeholder.png` | `public, max-age=0` | weak etag present |
| `/effects/makeup.deepar` | `public, max-age=0` | weak etag present |
| `/_next/static/chunks/16eba5f93bcc6292.js` | `public, max-age=31536000, immutable` | weak etag present |

No `Cache-Control` on the 404 skin and guest-order JSON responses.

## 2c. Playwright

Full run: 120 tests, 42 passed, 37 failed, 41 skipped, 5.4 minutes, 2 workers. Skips are axe and the keyboard test on Firefox and WebKit (recorded on Chromium only) plus the missing-license test on every browser. A targeted Chromium rerun then measured the brand filter, overflow per page, admin, and Escape. Those rerun results are marked below.

| Test | Chromium | Firefox | WebKit | Note |
| --- | --- | --- | --- | --- |
| Cart quantity up/down and remove to empty | pass | pass | pass | Seeded local cart. No order created. |
| Guest checkout validation, then payment screen, no pay | pass | pass | pass | Email, name, phone, address, and city errors shown. Continue stayed disabled until valid. Landed on `/checkout/payment`. No `POST /api/orders` or `/api/checkout`. |
| Empty cart on `/checkout/shipping` | pass | pass | pass | Heading "Your cart is empty". |
| 404s and robots/sitemap | pass | pass | pass | `/products/not-a-real-key`, `/looks/abc`, `/skin-analysis/results/not-a-real-id` were HTTP 404. `/robots.txt` and `/sitemap.xml` were 200. |
| Checkout back, forward, refresh | pass | pass | pass | Saved shipping values survived back and reload. Place order was not clicked. |
| Questionnaire mocked submit | pass | pass | pass | Navigated to the mocked results id. |
| Results profile, quick routine, then personalized, CLS | fail | fail | fail | Document was HTTP 404. Proxy rejects an id that is not in `skin_analysis_logs`. CLS was not measured. No row was inserted. |
| Questionnaire refresh and back | pass | pass | pass | Refresh returns to step 1. Back returns to `/skin-analysis`. |
| Scan camera denied shows upload | pass | fail | pass | Firefox still showed the scanner and "Upload Photo" after 15s, not "Camera access denied or unavailable." |
| Invalid scan file | pass | pass | pass | "The photo could not be read. Please try again." |
| Mocked `FACE_NOT_CLEAR` | fail | fail | fail | The server sentence was not shown within 45s. Chromium stayed on the camera-denied upload fallback. The mocked API was not confirmed as called. |
| Try-on camera denied | pass | fail | pass | Chromium and WebKit showed the friendly sentence, Try again, and Browse products. Firefox stayed on "Starting Camera…" for 30s. |
| Missing DeepAR env | skipped | skipped | skipped | Not verified. See security notes. |
| Chat open, mocked reply | pass | pass | pass | |
| Chat total failure plus catalog card | pass | pass | pass | Sentence "I could not answer just now. Please try again." and a product card. Typing indicator stopped. |
| Chat 30s hang | pass | pass | pass | Fake clock. Try again appeared. "Thinking..." stopped. |
| Sign-in and sign-up validation | pass | pass | pass | Empty and `not-an-email` blocked by the browser. Supabase was aborted. No account created. |
| Signed-out prompts | partial | partial | partial | `/my-orders` shows "Sign in to continue". `/account/routines` shows the sign-in sentence. `/makeup-bag` redirects to `/auth/sign-in?next=/makeup-bag`. |
| `/admin` signed out | fail | fail | fail | Does not show "Admin sign-in required". A follow-up saw `alert("Access Denied! You are not an admin.")` and then the home page. |
| Brand filter, open product, add to cart | fail in suite, measured in follow-up | fail | fail | The radio exists with value `Clinique` exactly once, but CSS is `display: none`, so `.check()` never clicks. Clicking the label does filter. Follow-up on Chromium: 9 links before, then only Clinique product URLs, card text `CLINIQUE`, Add to cart succeeded. |
| Narrow viewports | fail | fail | fail | Follow-up on Chromium listed every page. Only `/products` at 320px overflowed: scrollWidth 352, clientWidth 320. 375px was clean on all listed pages. 320px was clean on `/`, the Fit Me product, `/cart`, `/skin-analysis`, `/try-on`, and `/checkout/shipping`. |
| Chat panel at 375 and 320 | pass in follow-up | not remeasured | not remeasured | Panel stayed inside the viewport width and the input was visible. |
| Offline reload | fail | pass | pass | Chromium reload produced an empty document (0 characters). Firefox and WebKit still showed the products and checkout text. There is no in-app offline screen; the passing browsers simply kept the last page. |
| Axe, 9 pages × 2 widths | fail | skipped | skipped | Violations below. |
| Keyboard | fail | skipped | skipped | Home logo link had a 2px solid focus outline. Brand radios are `display: none` and focusing the label left focus on `body`. The disabled add-to-cart control also left focus on `body`. Escape left the chat open (follow-up). Checkout tab order was not run. |

## 2d. Axe (Chromium)

Every audited page had at least one violation. Firefox and WebKit were not run for axe.

| Page | 1280px | 375px |
| --- | --- | --- |
| `/` | serious color-contrast (rose button, muted text); moderate region | same contrast pattern; moderate region |
| `/products` | serious contrast; moderate heading-order; critical label on both price sliders; serious scrollable-region-focusable on filter lists; critical select-name | serious contrast; moderate heading-order; serious link-name on the wishlist control; critical select-name. Slider/scrollable-region items were not in this 375 snapshot. |
| Fit Me product | serious color-contrast | serious color-contrast |
| `/skin-analysis` | serious color-contrast | serious color-contrast, including `h1` |
| `/skin-analysis/questionnaire` | serious contrast; moderate landmark-one-main; moderate region | same |
| `/try-on` | serious contrast on the camera message and retry; moderate heading-order; moderate landmark-one-main; moderate region; critical select-name | same, plus the products link contrast |
| `/cart` | serious color-contrast | serious color-contrast |
| `/checkout/shipping` | serious contrast; serious label-content-name-mismatch on `a[aria-label="Cart"]`; moderate landmark-one-main; moderate region | same |
| `/support` | serious contrast; moderate landmark-one-main; moderate region | same |

Keyboard that was actually traced: Tab from `/` landed on the "AR Makeup" link with `outline: solid 2px`. Brand radios cannot be focused because `.filter-radio-input { display: none }`. Escape does not close the chat. Checkout field order was not executed.

## 2e. Security checks

Response headers on `/`, `/try-on`, `/skin-analysis/scan`, the catalog API, and a static JS chunk:

| Header | Sent |
| --- | --- |
| Content-Security-Policy | no |
| X-Frame-Options | no |
| X-Content-Type-Options | no |
| Referrer-Policy | no |
| Permissions-Policy | no |
| Strict-Transport-Security | no |

Camera is not mentioned in any response header. There is no Permissions-Policy that allows camera for this origin, and none that denies it. The browser default applies. `/try-on` and `/skin-analysis/scan` do call `getUserMedia` from the page itself.

`NEXT_PUBLIC_` names in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_DEEPAR_LICENSE_KEY`. The anon key and Stripe publishable key are meant to be public. The DeepAR license is not a server secret, but it is compiled into the client. In `.next/static/chunks/16eba5f93bcc6292.js`, next to `makeup.deepar`, there is a 225-character string literal. Value not printed. A second production process from this build cannot hide it.

Grep of `.next/static` (values not printed):

| Pattern | Result |
| --- | --- |
| `sk_live` | no matches |
| `sk_test` | no matches |
| `service_role` | no matches |
| `AIza` | no matches |
| `gsk_` | no matches |
| `eyJ` | 2 matches in `.next/static/chunks/575f5bd4e7d3132a.js` |

Unauthenticated status codes. None of these bodies contained a stack, SQL text, or `error.message`.

| Route | Status | Body (short) |
| --- | --- | --- |
| `GET /api/admin/dashboard` | 401 | Unauthorized: No token provided |
| `GET /api/admin/orders` | 401 | same |
| `GET /api/admin/orders/not-a-real-id` | 401 | same |
| `POST /api/admin/orders/status` `{}` | 401 | same |
| `POST /api/admin/products/create` `{}` | 401 | same |
| `POST /api/admin/products/update` `{}` | 401 | same |
| `POST /api/admin/products/toggle` `{}` | 401 | same |
| `POST /api/admin/products/restock-notify` `{}` | 401 | same |
| `GET /api/orders` | 401 | Unauthorized |
| `GET /api/orders/not-a-real-id` | 401 | Unauthorized |
| `POST /api/orders` `{}` | 400 | Missing shipping info. |
| `POST /api/orders/cancel` `{}` | 400 | Missing order_id |
| `GET /api/orders/not-a-real-id/buy-again` | 405 | empty |
| `POST /api/orders/not-a-real-id/buy-again` `{}` | 401 | Unauthorized |
| `GET /api/beauty-profile` | 401 | Unauthorized |
| `POST /api/beauty-profile` `{}` | 401 | Unauthorized |
| `GET /api/account/shade-match` | 401 | Sign in to see your shade match. |
| `GET /api/account/repeats` | 401 | Unauthorized |
| `GET /api/product-restock-alerts` | 401 | Sign in to see your restock alerts. |

Bad bodies, none of which returned 500:

| Request | Status | Client message |
| --- | --- | --- |
| `POST /api/chat` invalid JSON | 200 stream | local failure stream, no model |
| `POST /api/chat` `text/plain` | 200 stream | local failure stream, no model |
| `POST /api/chat` `{messages:[]}` | 200 stream | local failure stream, no model |
| `POST /api/chat` about 2 MB pad plus empty messages | 200 stream | no model |
| `POST /api/skin-analysis` broken JSON | 400 | Invalid request. |
| `POST /api/skin-analysis` script and SQL-like strings | 400 | Please check your skin type and concerns, then try again. |
| `POST /api/skin-analysis` `text/plain` | 400 | Invalid request. |
| `POST /api/skin-analysis` 200,000-character skin type | 400 | Please check your skin type and concerns, then try again. |

Rate limits, from code and from a burst that does not call a model:

- Skin: `rateLimit` runs before validation, 10 requests per 60 seconds per server process. Invalid bodies count. In one window that already had 4 invalid posts, the next 15 were 6 times HTTP 400 and then 9 times HTTP 429 with "Too many analysis requests. Please wait a minute and try again."
- Chat: the limiter is 12 per 60 seconds and it also counts empty messages, which return before any model call. It does not return HTTP 429. Over the limit it returns HTTP 200 and the stream text "Please wait a moment and try again." A follow-up empty post after the burst confirmed that sentence and status 200.

## 3. Caching and speed plan

Not implemented.

| Opportunity | Where | What to do | Expected gain, from these numbers |
| --- | --- | --- | --- |
| Hero image | `public/images/hero_model.png`, `src/components/home/Hero.tsx` | Resize and serve WebP/AVIF. `images.unoptimized: true` in `next.config.ts` sends the original 1.8 MB PNG. `Cache-Control` is `max-age=0`. | Lighthouse estimates 1,640 KiB. Mobile LCP was 14.0 s and this file was the LCP request. A roughly 150 KB image at the same throttling should bring LCP down by several seconds. |
| Catalog API | `src/app/api/catalog/products/route.ts` and `lookup/route.ts` | The route is `force-dynamic` with `private, max-age=0`. Cold query was 740 ms and warm repeats were about 5–12 ms. Cache the JSON for a short public TTL, or cache `getCatalogPage` in memory keyed by the query. | Repeat views drop from a cold 740 ms toward the warm 10 ms. First page is 8 KB, so the win is the database round trip, not bytes. |
| Product HTML | `src/app/products/[product_key]/page.tsx` | Response is `no-store`. The page reads Supabase on every request. Use a short `revalidate` once the product payload is stable. | Repeat product views skip the database. Warm lookup of one key was already 5 ms, so the gain is mostly TTFB under load, not the 0.8 s desktop LCP. |
| DeepAR | `src/app/try-on/page.tsx` | `import("deepar")` is dynamic, so other pages do not download it. The effect still starts in `useEffect` on every visit. Lighthouse loaded 2.15 MB `makeup.deepar`, about 594 KB wasm, and a license check. Mobile TBT was 2,230 ms and performance was 51. | Start the SDK on a button press. That removes the 2.15 MB effect and the wasm from first load and should cut most of the 2.2 s TBT. |
| Remote product images | catalog `image_url`, `ProductImageFace` | First `/products` HTML has 9 images, all `loading="lazy"`, none with width/height. The parent has `aspect-ratio: 4/3`, and measured CLS was 0. One image is HTTP. `next/image` is used, but the optimizer is off. | Fix the `http://` URL. That is the best-practices 81. Optimizer or a sized CDN URL would cut the 6.1 s mobile LCP. |
| Static JS | `/_next/static` | Already `immutable` for one year. Initial HTML referenced about 1.30–1.42 MB of JS. Largest client chunks were 404 KB, 272 KB, 231 KB, 224 KB, and 202 KB. `/skin-analysis` was the heaviest measured document (1,424,110 bytes of scripts). | Unused-JS audits were about 180–243 KiB. Code-splitting the chat widget and framer-motion off the first screen is the realistic cut. |
| Public files over 300 KB | `public/` | `product_placeholder.png` 2,295,438 bytes. `hero_model.png` 1,841,743 bytes. `effects/makeup.deepar` 2,151,368 bytes (effect, not an image). No other image in `public/` or the build output was over 300 KB. | Compressing the placeholder matters when an image URL fails. The hero matters on every home view. |

Raw `<img>` (not `next/image`) is used in the chat cards, scan preview, results routine cards, looks, makeup bag, account repeats, and admin product screens. Product cards and the hero use `next/image` with `fill`, so the HTML has no width or height attributes. CLS on the measured pages was 0 or 0.044, so the missing attributes did not shift these runs. The checkout desktop CLS of 0.044 is the only non-zero layout shift recorded.

Third-party weight that actually loaded: Google Fonts CSS on `/try-on` (two stylesheets), DeepAR wasm and the license endpoint, and many shop CDNs for product photos. MediaPipe is loaded from jsDelivr and `storage.googleapis.com` only when a scan runs face detection (`src/lib/skin-analysis/face-mesh.ts`). It was not part of the Lighthouse pages.

## 4. Ranked problems

| ID | Severity | Where | Evidence | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- |
| P1 | Critical | `public/images/hero_model.png`, home LCP | Mobile LCP 14.0 s. File is 1,841,743 bytes and was the LCP request. Optimizer is off. Cache is `max-age=0`. | Ship a sized modern image and cache it. | S |
| P2 | High | `/try-on` | Mobile performance 51, TBT 2,230 ms. Page load fetched the 2.15 MB effect and 594 KB wasm. | Initialize DeepAR only after the user asks for the camera. | M |
| P3 | High | Security headers, `next.config.ts` | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy were absent on every probed response. | Set the headers. Allow camera for this origin on `/try-on` and `/skin-analysis/scan` only if a policy is added. | S |
| P4 | High | `src/app/admin/layout.tsx` | Signed-out visit alerts "Access Denied! You are not an admin." and `router.push("/")`. "Admin sign-in required" never stays on screen. The gate is the client email `admin@makeup.com`. APIs themselves returned 401. | Remove the alert. Show the sign-in screen. Keep authorization on the API. | S |
| P5 | High | `/products` accessibility | Axe critical: unlabeled price sliders and unlabeled select. Radios are `display: none`, so keyboard focus never lands on them. Filter lists are not keyboard-scrollable. | Label the controls and stop hiding the radio from the accessibility tree. | M |
| P6 | High | Chromium offline | Reloading `/products` while offline produced an empty document. No in-app offline message exists. | Catch a failed navigation and show the last catalog or a short error. | M |
| P7 | Medium | Catalog and product caching | Cold catalog 740 ms vs warm about 10 ms. Product HTML is `no-store`. | Short TTL for catalog JSON and product pages. | M |
| P8 | Medium | `/products` best practices | Score 81 because one product image is `http://beautyofjoseon.com/...`. | Store `https` image URLs. | S |
| P9 | Medium | `src/app/api/chat/route.ts` | Over-limit empty posts return HTTP 200 and "Please wait a moment and try again.", not 429. Skin does return 429. | Return 429 for the chat limiter too. | S |
| P10 | Medium | Chat widget | Escape left the panel open. Close button exists. | Close on Escape and return focus to the launcher. | S |
| P11 | Medium | 320px `/products` | scrollWidth 352 vs clientWidth 320. Other checked pages did not overflow. | Find the 32px overflow in the products toolbar or filter row. | S |
| P12 | Medium | DeepAR license | A long literal is in the public JS chunk because the key is `NEXT_PUBLIC_`. | Accept that the browser SDK needs it, or load the SDK from a server session so the key is not in the static file. | L |
| P13 | Low | Brand display | Filter value is one `Clinique`. Cards render `CLINIQUE`. API `brand` field for that filter was `CLINIQUE`. | Use the folded facet label on the card. | S |
| P14 | Low | `/checkout/shipping` SEO 63 | `robots.txt` disallows `/checkout`, so Lighthouse marks it not crawlable. | Leave it if checkout should stay out of the index. | S |
| P15 | Low | Color contrast | Serious contrast on home, products, product, skin, questionnaire, try-on, cart, checkout, and support. | Darken muted rose and gray text. | M |

## 5. What an evaluator would notice

The home page on a phone-sized, throttled run takes 14 seconds to show its main image because the hero PNG is 1.8 MB. The try-on page spends more than two seconds of main-thread time starting DeepAR before the person has really used the camera, and the performance score there was 51. The catalog itself is fast once warm, about 10 ms, but nothing is cached, so the first query after start was 740 ms and product pages are always `no-store`.

Shopping, guest checkout validation, 404s, the questionnaire mock, and the chat widget behaved correctly in Chromium, Firefox, and WebKit, and no payment request was sent. Signed-out `/admin` does not show the intended sign-in heading. It pops an alert and returns home. There are no standard security headers. Accessibility failures are widespread, mostly contrast, unlabeled filters, and a chat panel that ignores Escape.

What could not be verified on a real phone or with a real face: camera permission UI on a device, whether a clear face reaches the `FACE_NOT_CLEAR` server message (the desktop test never got that far), layout shift on a real skin-results page (that page 404s unless a log row already exists, and none was created), live routine-generation latency, and the screen when the DeepAR license is actually absent. Firefox also never left "Starting Camera…" on try-on, so that browser's camera-denied copy was not seen.
