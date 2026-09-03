# AR Makeup Web - Context for Gemini

## 1. What This Project Is

AR Makeup Web is a Next.js cosmetics e-commerce website with an AI-assisted beauty experience. It combines:

- A browsable makeup and skincare catalogue
- Product detail pages with shade selection
- Browser-local cart and checkout
- Stripe card payment and cash-on-delivery checkout
- Supabase authentication and persistence
- DeepAR virtual makeup try-on
- MediaPipe face-landmark validation and browser-side skin heuristics
- Face++ and Gemini-based skin analysis
- AI-generated AM/PM skincare routines
- A streamed Gemini/Groq skincare chatbot with product search
- Saved looks, shareable look pages, favourites, makeup bag, orders, and admin tools

The project is a web client and server in one Next.js App Router application. It is not a Flutter app, although some authentication/design comments refer to a Flutter client using the same Supabase project.

## 2. Technology Stack

- Next.js 16.1.4 with App Router
- React 19.2.3
- TypeScript, with `strict: false` in `tsconfig.json`
- Tailwind CSS v4 and `src/app/global.css`
- Supabase JS and `@supabase/ssr`
- Stripe (`stripe` server SDK and `@stripe/stripe-js` client SDK)
- DeepAR 5 for virtual try-on
- MediaPipe Tasks Vision for face landmarks
- Gemini through `@google/genai`, `@ai-sdk/google`, and Vercel AI SDK
- Groq through `groq-sdk` and `@ai-sdk/groq`
- Resend for order email
- Zod for some request/response validation
- Framer Motion and Lucide React for UI
- `react-webcam` for camera capture

Package manager files for both pnpm and npm exist. `package.json` defines the authoritative scripts.

## 3. How To Run

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run start
npm run lint
npm run typecheck
npm run verify:phase0
```

There is no automated test suite or `test` script in the current repository. Validation is primarily TypeScript, ESLint, build, and the Phase 0 Supabase probe.

The current README is still the default create-next-app README and is not an accurate product specification. This file is the more useful source of project context.

## 4. Top-Level Structure

```text
src/app/                 Pages, layouts, route handlers, and global styling
src/components/          Reusable UI components grouped by feature
src/hooks/               Client hooks such as cart/session state
src/lib/                 Supabase, Stripe, catalog, image, auth, and analysis logic
src/store/               Browser localStorage state for cart and shipping
src/types/               Shared TypeScript domain types
public/effects/          DeepAR effect asset (`makeup.deepar`)
public/images/           Product and UI images
scripts/                 Data import, image fetching, and verification scripts
data/                    CSV/JSON source data
 db/                     Supabase SQL/RLS migrations and design notes
mask.html                Separate/static mask-related HTML asset or experiment
next.config.ts           Next.js configuration
```

## 5. Page Routes

### Storefront and discovery

- `/` - Home page. Composes `Hero`, `FeatureCards`, `SharedLookQuickOpen`, and `Footer`.
- `/products` - Catalogue page. Server fetches catalogue data; `ProductsClient` handles client filtering, search-like interactions, pagination, wishlist, and recently viewed state.
- `/products/[product_key]` - Product detail page with product information, shades, quantity, and add-to-cart behavior.
- `/looks/[id]` - Public saved-look detail page. Reads a saved look and its items, then supports buying the look by adding its products/shades to the local cart.
- `/my-looks` - Authenticated user's saved-look gallery.
- `/try-on` - DeepAR virtual try-on experience for makeup effects such as lipstick/blush. It uses the public DeepAR effect asset and camera/browser APIs.

### Skin analysis and recommendations

- `/skin-analysis` - Chooses analysis mode.
- `/skin-analysis/questionnaire` - Three-step self-assessment flow.
- `/skin-analysis/scan` - Webcam/upload scan flow. Validates the face with MediaPipe, runs browser CV heuristics, uploads/encodes the image, and submits analysis.
- `/skin-analysis/results/[sessionId]` - Displays the stored analysis, concerns, score, summary, routine, and product/cart actions.

### Cart, checkout, and orders

- `/cart` - Local cart review and totals.
- `/checkout/shipping` - Shipping information form stored in localStorage.
- `/checkout/payment` - Selects payment method and creates an order/Stripe session.
- `/checkout/success` - Receipt, payment verification, cart clearing, and confirmation email trigger.
- `/checkout/cancel` - Stripe cancellation result.
- `/my-orders` - Authenticated order history.
- `/my-orders/[id]` - Authenticated order details.
- `/order/track` - Guest order lookup using a guest token.

### Authentication and support

- `/auth/sign-in` - Supabase password sign-in.
- `/auth/sign-up` - Supabase password sign-up.
- `/auth/bridge` - Flutter-to-web session bridge. Receives access/refresh tokens in a URL fragment, validates the internal `next` path, removes the fragment, calls `setSession`, and hard-navigates.
- `/support` - Support page.

### Admin

- `/admin` - Dashboard.
- `/admin/products` - Product list.
- `/admin/products/new` - Product creation.
- `/admin/products/[id]` - Product editing.
- `/admin/orders` - Admin order list.
- `/admin/orders/[id]` - Admin order detail/status actions.

`src/app/layout.tsx` is the global layout. It loads the Navbar, children, and the global Chatbot. Metadata still has the default create-next-app title/description and should be updated if branding matters.

## 6. Important Components

- `src/components/layout/Navbar.tsx` - Global navigation, auth/session-aware controls, cart count, and links.
- `src/components/layout/AuthShell.tsx` - Shared auth page shell.
- `src/components/home/*` - Home hero, feature cards, footer, mobile CTA, and shared-look quick open.
- `src/components/products/ProductsClient.tsx` - Main client-side catalogue behavior.
- `src/components/products/ProductCard.tsx` - Product card and product actions.
- `src/components/products/ProductFilters.tsx` - Catalogue filter controls.
- `src/components/products/Pagination.tsx` - Catalogue pagination.
- `src/components/products/AddToCartPanel.tsx` - Product/shade/quantity cart action.
- `src/components/checkout/*` - Guard, shell, steps, shipping, payment, order summary, receipt, and buy-look banner.
- `src/components/orders/MyOrdersClient.tsx` - Order history client UI.
- `src/components/orders/OrderDetailClient.tsx` - Order detail and cancellation UI.
- `src/components/chatbot/Chatbot.tsx` - Persistent streamed AI chatbot UI.

## 7. Supabase Clients and Authentication

`src/lib/supabase/client.ts` exports a browser client created with `createBrowserClient` and the public `NEXT_PUBLIC_*` credentials.

`src/lib/supabase/server.ts` exports:

- `createSupabaseServerClient()` - Cookie-aware SSR/server client using the anon key. This preserves the logged-in user's auth context and should be used for normal user operations.
- `createSupabaseAnonWithHeaders(headers)` - An anon client with custom headers. Used for guest-token RLS flows.

`src/hooks/useSession.ts` exposes session state, including loading, signed-in, and signed-out states. Normal sign-in uses Supabase `signInWithPassword`; sign-up uses `signUp`.

Admin access is currently email-based, not role-based. `src/lib/adminAuth.ts` and the admin layout use the hardcoded email `admin@makeup.com`. Preserve this behavior only if intentionally maintaining the current prototype; role-based authorization is the safer future design.

## 8. Catalog Data and Queries

`src/lib/catalog/queries.ts` is the main browser catalogue query module:

- `getProducts()` reads `makeup_products` in batches of 1,000 to work around the Supabase row limit.
- `getCategories()` calls the `get_distinct_categories` RPC.
- `getProductByKey(product_key)` reads one product.
- `getShadesByProductKey(product_key)` reads `product_shades` ordered by creation time.

`src/lib/catalog/image.ts` centralizes product image URL/fallback handling.

Catalog TypeScript types are in `src/types/catalog.ts`:

- `MakeupProduct`: product key, name, brand, category, description, image, price, skin-friendly/active flags, finish.
- `ProductShade`: shade key, product key, shade name, optional hex.

There are also look-specific `Product`, `SavedLook`, `SavedLookItem`, and `LookItemWithProduct` types in `src/types/index.ts`. A saved look can outlive a deleted/de-listed product or shade; resolved product/shade fields may therefore be null.

## 9. Browser State: Cart, Shipping, Wishlist

`src/store/cart.ts` is the source of truth for the browser cart. It uses localStorage key:

```text
ar_makeup_cart_v1
```

Cart items contain a stable identity made from:

```text
product_key + "__" + (shade_key ?? "no-shade")
```

Adding the same product/shade increases quantity. Quantity zero removes an item. Display fields such as name, brand, image, shade name, and price are cached in the item for UI/checkout display.

Exported cart operations include `loadCart`, `saveCart`, `clearCart`, `addToCart`, `updateQuantity`, `removeFromCart`, `getCartCount`, and `getCartSubtotal`.

`src/store/checkoutShipping.ts` stores normalized shipping data under:

```text
ar_makeup_checkout_shipping_v1
```

Default country is Pakistan. Known shipping fields are email, name, phone, address, city, and country; unknown fields are discarded.

Wishlist and recently viewed behavior in the current web UI is localStorage-based. It is separate from the Supabase `user_favourites` design in `db/002_phase1.sql`; do not assume that the UI is already persisted server-side.

## 10. API Route Contracts

All route handlers are under `src/app/api`.

### Orders

- `POST /api/orders` - Validates basic shipping/items, obtains the current user if available, supports authenticated and guest orders, inserts the order and order items, and returns order/guest information. Guest orders receive a generated UUID `guest_token`; guest item access uses `x-guest-token`.
- `GET /api/orders` - Authenticated, paginated order list.
- `GET /api/orders/[id]` - Authenticated order details and items.
- `PATCH /api/orders/[id]` - Authenticated cancellation of orders currently in `placed` status.
- `GET /api/orders/guest?guest_token=...` - Guest order lookup using the token.
- `POST /api/orders/cancel` - Service-role cancellation endpoint. It currently has insufficient caller authorization and should be treated as security-sensitive.

Order domain types are in `src/types/order.ts` / `src/types/orders.ts` (the repository contains both naming forms). Status values are `draft`, `placed`, `paid`, `failed`, and `cancelled`. Currency is currently hardcoded to `USD`, and shipping fee is currently zero.

`CreateOrderPayload` contains shipping and client cart item fields. The current implementation stores display data from the client, so server-side catalogue re-pricing is a required hardening task before production.

### Stripe checkout

- `POST /api/checkout` - Creates a Stripe Checkout Session from client-provided items and `orderId`.
- `POST /api/checkout/verify` - Retrieves a Stripe session and marks an order paid after client success flow.
- `POST /api/stripe/webhook` - Node runtime Stripe webhook. Verifies the Stripe signature and handles `checkout.session.completed` using session metadata `orderId`.

The success page calls verification and then triggers email sending. The webhook is an independent payment confirmation path and should remain authoritative for production payment state.

### Skin analysis and routines

- `POST /api/skin-analysis` - Accepts questionnaire or photo analysis, handles dry-skin confirmation, uses Face++ first for photos and Gemini Vision fallback, logs analysis, and upserts an authenticated user's skin profile.
- `POST /api/generate-routine` - Accepts `userSkinType`, `concernScores`, and `analysisId`, loads skincare products, generates an AM/PM routine, and saves a routine snapshot.

### Chatbot

- `POST /api/chat` - Streams a Gemini-first/Groq-fallback conversation. It trims context to 10 messages and exposes a `searchProducts` tool capped at 5 Supabase results. The system prompt defines a premium AI beauty/clinical skincare assistant.

### Email

- `POST /api/send-order-email` - Sends an order confirmation via Resend. It is currently unauthenticated and must be treated as a security-sensitive endpoint.

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/orders`
- `GET /api/admin/orders/[id]`
- `POST /api/admin/orders/status`
- `POST /api/admin/products/create`
- `POST /api/admin/products/update`
- `POST /api/admin/products/toggle`

Admin routes use service-role Supabase access after `verifyAdmin`/admin authorization. Product create/update also handles shade insertion/deletion.

## 11. Skin Analysis Pipeline

There are two analysis modes.

### 11.1 Questionnaire mode

The questionnaire collects user-selected skin type/concerns/severity. It does not use computer vision or AI vision. It directly persists the selected profile and concern scores through `/api/skin-analysis`, then the results/routine flow can use those values.

### 11.2 Photo mode: browser stage

`src/app/skin-analysis/scan/page.tsx` accepts webcam or uploaded images.

`src/lib/skin-analysis/face-mesh.ts` loads MediaPipe Tasks Vision from the model/CDN and validates:

- A face must exist.
- Exactly one face is expected.
- The face must be large enough.
- Image luminance must be acceptable.

It exposes landmark regions for forehead, nose/T-zone, left cheek, right cheek, chin, and under-eye areas. It can also draw landmarks on a canvas.

`src/lib/skin-analysis/cv-heuristics.ts` then runs browser-side analysis. Important design decision: it first calibrates against the same face/photo rather than using universal brightness thresholds. Calibration includes median grayscale, grayscale standard deviation, and baseline red dominance.

Region metrics:

- Oiliness: specular/highlight ratio plus luminance variation
- Redness: red-channel dominance relative to that face's baseline
- Texture: Sobel gradient variance above a contrast-aware noise floor
- Dark circles: cheek-vs-under-eye luminance difference with contrast-aware tolerance
- Hydration: derived from texture and distance of oiliness from a target balance

Weighted aggregate metrics:

- Oiliness: forehead 40%, T-zone 45%, chin 15%
- Redness: average of left cheek, right cheek, chin
- Texture: left cheek 35%, right cheek 35%, T-zone 15%, forehead 15%
- Hydration is clamped to 15..95
- Overall score is clamped to 25..98

The browser analysis returns `DetailedSkinAnalysis` with overall score, DB-compatible skin type, primary concerns, aggregate metrics, and region breakdown.

### 11.3 Photo mode: server stage

`src/app/api/skin-analysis/route.ts` uses this priority:

1. Face++ as primary photo analysis engine.
2. Merge/augment with browser MediaPipe metrics where available, especially redness.
3. Gemini Vision fallback if Face++ fails or is unavailable.
4. The old Groq text-only fallback is intentionally disabled because a text-only model cannot reliably infer skin condition from an image.

`src/lib/skin-analysis/facepp-mapper.ts` maps Face++ response values:

- Face++ skin type `0` -> `Oily`
- `1` -> `Dry`
- `2` -> `Normal`
- `3` -> `Combination`

Face++ concern flags require value `1` and confidence greater than `0.5`. The mapper handles both numeric and string flag values. It checks acne, dark circles, skin spots/dark spots/hyperpigmentation, blackheads, and four pore regions.

Face++ does not provide redness or hydration directly. Redness can come from the browser CV metrics; hydration/dryness remains limited and should not be described as a clinical diagnosis.

Decision/override rules in the analysis flow include:

- High redness can override the final type to `Sensitive`.
- Acne plus pore/blackhead signals can override to `Acne-Prone`.
- A `Normal` result may trigger a post-analysis dry-skin confirmation question.
- Dry confirmation can update the stored analysis and concern tags.

Valid analysis labels/tags are defined in `/api/skin-analysis/route.ts` and `src/types/skin-analysis.ts`. Preserve those exact values when adding recommendations or database filters.

Analysis records are written to `skin_analysis_logs`. Authenticated users also get an upsert into `user_skin_profiles` through the cookie-aware server client.

## 12. Routine Recommendation Logic

Skincare product shape and routine types are in `src/lib/skin-analysis/recommend.ts`.

Valid routine categories are exactly:

```text
Cleanser
Treatment
Eye cream
Moisturizer
sunscreen
```

`src/lib/skin-analysis/scoring.ts` calculates a 0..100 product match score:

- Skin type compatibility contributes up to 35 points.
- Concern/tag compatibility contributes up to 65 points.
- Exact skin type match = 35 points.
- Universal/all-skin-types match = 25 points.
- Mismatch = 5 points.
- Concern tags are normalized through `CONCERN_TAG_MAP`.
- A concern array from photo analysis is treated as weight 1.0 per concern.
- A questionnaire concern object uses its numeric severity scores.
- One matched tag for a concern has 50% efficiency; two or more reach 100% efficiency.
- No positive concerns gives a 30-point base for the concern portion.

`src/lib/skin-analysis/candidate-selector.ts`:

- Scores all DB products.
- Keeps up to three candidates per category.
- AM candidates require `am_safe === true`.
- PM candidates require `pm_safe === true`; sunscreen is excluded from PM.
- Sort order is score, number of matched tags, then exact skin-type match over universal match.

`src/lib/skin-analysis/reasoning.ts` generates human-readable reasons. Priority is:

1. Serious top concern plus matched tags: targets the concern and names a benefit tag.
2. Multiple/single matched tags: describes benefits.
3. Skin type match: says it fits the skin profile.
4. Generic daily-routine fallback.

`src/lib/skin-analysis/ai-engine.ts` sends only shortlisted candidates to Gemini first and Groq second. The AI is instructed to choose strictly from candidate IDs and to produce:

- AM: Cleanser -> Treatment -> Eye cream -> Moisturizer -> sunscreen
- PM: Cleanser -> Treatment -> Eye cream -> Moisturizer
- A summary
- A match reason and score per chosen product

The result is reassembled against the local candidate `productMap`, so invented IDs are dropped. It is returned as AM/PM routine plus summary and stored as a `routine_snapshot` by the API route.

Important: AI routine prose must not invent concerns not present in the user profile. This constraint is explicitly encoded in the routine system prompt.

## 13. Virtual Try-On

`src/app/try-on/page.tsx` owns the current web try-on flow. It uses `react-webcam`/browser camera access and DeepAR. The effect asset is `public/effects/makeup.deepar`.

The DeepAR license key is currently embedded in client-side code. Treat it as exposed and move to a safer/appropriate configuration if the deployment requires key protection. Do not assume a client-side key is secret.

## 14. Saved Looks and Makeup Bag Model

`db/001_phase0_rls.sql` protects the public catalog and saved-look model:

- `makeup_products`: public read, no public writes
- `product_shades`: public read, no public writes
- `saved_looks`: public read for share links; authenticated owner-only insert/update/delete
- `saved_look_items`: public read; owner-only writes through the parent saved look

The current Phase 0 sharing model is unlisted UUID sharing: knowing the look UUID is enough to read it. The SQL includes a commented opt-in `is_public` hardening design, but that is not implemented.

`db/002_phase1.sql` adds/enforces owner-only:

- `user_favourites`
- `makeup_bags`
- `makeup_bag_items`
- Extended `user_skin_profiles` fields: undertone, depth level, skin tone hex, Monk scale, coverage, finish, allergies, source

Important database decisions:

- PostgreSQL NULL uniqueness requires expression indexes using `coalesce(shade_key, '')` for favourites and makeup bag items.
- Makeup bag items inherit ownership through their parent bag.
- A user may have only one default makeup bag through a partial unique index.
- `source` for bag items is one of `manual`, `purchase`, `try_on`.
- `source` for profiles is one of `analysis`, `manual`, `both`.

## 15. Database Caveat

The tracked SQL files do NOT define the complete base schema for:

- `orders`
- `order_items`
- `skin_analysis_logs`
- Existing base columns/tables for all catalogue/profile tables

They also do not contain complete RLS policies for orders or analysis logs. The application assumes those tables/policies exist in the connected Supabase project. Before changing ownership, privacy, checkout, or analysis behavior, inspect the live Supabase schema and policies.

The SQL comments mention `npm run verify:phase1`, but that script does not exist in `package.json`. Only `verify:phase0` is currently exposed.

## 16. Data and Utility Scripts

- `scripts/seed-skin-products.ts` - Reads `data/cosmetics.csv`, derives tags from ingredients, and upserts skincare products in batches of 200.
- `scripts/fetch-real-images.ts` - Uses SerpAPI image search to fill missing product images.
- `scripts/verify-phase0.ts` - Checks anonymous catalogue/look reads and expected RLS write failures.
- `src/app/update-images.ts` - Another image update utility using SerpAPI/Google-related environment variables.
- `data/cosmetics.csv` - Skincare/cosmetics source data.
- `data/dermstore_data.json` - Additional product/source data.

## 17. Environment Variables

Referenced variables include:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY
GROQ_SKINCARE_API_KEY
CHATBOT_GOOGLE_KEY
GROQ_API_KEY
FACEPP_API_KEY
FACEPP_API_SECRET
RESEND_API_KEY
SERPAPI_KEY
GOOGLE_API_KEY
SEARCH_ENGINE_ID
```

`.env.local` is ignored by git. Never commit secrets, service-role keys, Stripe secrets, Face++ secrets, or AI keys. Server-only keys must not be imported into client components.

## 18. Current Known Risks and Gaps

These are current repository realities and should be considered before making changes:

1. `/api/orders` trusts client-supplied price, product name, brand, image, and totals. A user can manipulate prices in the browser.
2. `/api/checkout` also uses client-provided prices instead of re-querying the catalogue.
3. `/api/orders/cancel` uses the service role without sufficient caller authentication/ownership checks.
4. `/api/checkout/verify` should verify that Stripe session metadata `orderId` equals the submitted order ID.
5. `/api/generate-routine` accepts an analysis ID and should verify that the authenticated user owns that analysis.
6. Results pages read analysis records directly from the browser; privacy depends on live Supabase RLS not present in the tracked migrations.
7. The dry-skin confirmation update needs ownership checks.
8. `/api/send-order-email` is unauthenticated and builds HTML from request data; it needs authorization, validation, and output escaping/rate limiting.
9. Admin authorization is hardcoded email matching, not a database role/claim.
10. AI, chat, image upload, order, and email endpoints have no visible rate limiting.
11. Guest order behavior depends on RLS/RPC definitions absent from this checkout.
12. The DeepAR license key is client-visible.
13. Product type definitions and selected query columns are not perfectly aligned; loose TypeScript settings hide some issues.
14. The skin-analysis results area contains legacy/commented code and a deliberately disabled text-only fallback.
15. Inventory/restock and opt-in saved-look sharing are design/future work, not complete features.

When asked to fix one of these, prefer a root-cause server-side fix and preserve guest checkout/share behavior with explicit authorization rules.

## 19. Change Rules for Future AI Work

Before editing:

- Identify whether the behavior is controlled by a page, client component, API route, shared lib, store, or database policy.
- Read the nearby types and call sites before changing a public contract.
- Check whether the code is client or server. Do not move server secrets into client components.
- For Supabase changes, inspect both the query and the RLS policy/table schema.
- For checkout/payment changes, treat server/database values as authoritative; never trust browser prices or payment status.
- For analysis changes, preserve exact DB enum/tag strings and distinguish heuristic signals from AI/Face++ signals.
- For routine changes, preserve candidate filtering and validate that every selected ID came from the candidate set.
- Keep localStorage keys and cart item identity stable unless a migration is intentionally implemented.
- Add focused validation with `npm run typecheck`, `npm run lint`, or `npm run build`; use `npm run verify:phase0` after RLS-related work.
- Do not assume the current README describes the app.

## 20. Short System Prompt for Gemini

You are modifying an existing Next.js 16 App Router AR makeup e-commerce project. Preserve existing public route/API contracts and localStorage cart identity unless the task explicitly changes them. The app uses Supabase for auth/catalog/looks/orders/analysis, Stripe for payments, DeepAR for try-on, MediaPipe plus Face++/Gemini for skin analysis, and Gemini/Groq for routine/chat AI. Treat browser prices, client order status, analysis IDs, and email payloads as untrusted. Keep server secrets server-only. Before changing behavior, locate the owning abstraction and inspect its nearby types, call sites, and RLS assumptions. Use exact existing skin-type, concern, tag, and routine-category values. Validate with the narrowest relevant typecheck/lint/build or integration command.
