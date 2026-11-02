# 10-minute demo script

Evaluator walkthrough for the website only. The Android app is the full camera. Do not read secrets, passwords, or API keys aloud. Never type a real card.

Times are a guide. If a step fails, use the fallback and move on.

## Before the room

- Restart the production server. Run `npm run build`, then `npm run start -- -H 127.0.0.1 -p 3010`. Do not start a second `npm run dev` if one is already running.
- Warm the cache: open Home, Products, and 2–3 product or skin profiles you will actually show, so the first request in the room is not a cold start. The routine cache is in memory and is empty after a restart.
- Check Gemini, Groq, and Face++ quotas in their dashboards. If a quota is spent, plan the questionnaire and the rules routine, not a live photo.
- Sign in as the signed-in demo account in the browser you will project. Sign in as the admin account in a second tab or be ready to. Do not put passwords on the slide or in the chat.
- Stripe is test mode. Say that before anyone touches checkout. Never use a real card.

## 0:00 Home

Click **Home** (or open `/`).

Say: “This is the shop. The phone has the full camera. The site is catalog, skin guidance, checkout, and a lipstick and blush preview.”

Point at **Browse Products** and **Lipstick and blush preview**. Read the line that the full camera is in the Android app.

If the hero is slow: the image is cached after the first load. Do not refresh in a loop.

## 1:00 Catalog and filters

Click **Products**.

Open the **Brand** filter and choose **Clinique**. Say: “One brand, one entry. Case differences are folded.”

Turn on **For your skin**. Say: “This uses a saved skin type when someone is signed in. Signed out, it does not invent a profile.”

If the list is empty or spinning: clear the brand filter, or say the catalog cache is warming and wait one reload. Do not claim a live model ranked this grid.

## 2:30 Product and shade

Open one in-stock product (stock above zero). Pick a shade.

Say: “Price is USD. Shade, stock, and reviews are on the product. Add to cart is local until checkout.”

Click **Add to cart**.

If the photo fails: the name card is the fallback. Say that and continue.

## 3:30 Try-on preview

Nav **Try-On**, or Home **Lipstick and blush preview**.

Say: “Browser preview is lipstick and blush only. DeepAR starts when I click Start camera, not when the page opens. The Android app is the full camera.”

Click **Start camera**. If the browser asks, allow it for a few seconds, then stop.

If the prompt sits there or permission is denied: click **Browse shades without camera** (while the prompt is open) or use the shade list and **Browse products**. Say the shades still work and the phone has the live camera. Do not keep waiting on the prompt.

## 4:30 Skin photo and questionnaire

Nav **Skin Analysis**. Open **Instant AI Photo Analysis** (`/skin-analysis/scan`).

Click **I Agree, Open Camera**. Say: “The photo is sent for a product suggestion. It is not stored as the picture, and this is not a diagnosis.”

If the camera prompt does not finish: click **Skip, upload a photo instead** (same upload as **Upload Photo**). If the servers are busy or the face is not clear: open **Comprehensive Skin Questionnaire** and finish it. Prefer the questionnaire when quota is low.

Say the questionnaire is the reliable demo path.

## 6:00 Results and routine

On the results page, point at the skin profile.

Say: “A rules routine shows immediately as Quick routine. If the model answers, the label becomes Personalized for you. If the model is slow or out of quota, Quick routine is the answer we keep. No accuracy percent.”

If the report 404s: the id was not saved. Go back and submit the questionnaire once. Do not paste a guessed id.

## 7:00 Chat, three questions

Click **Open chat** (AI Beauty Advisor).

1. A category, for example “lipstick”. Say: “It should name products from the catalog.”
2. A price that will relax, for example “blush under $1”. Say: “Nothing in the catalog is under a dollar. The honest line is that these are the closest, and the cheapest blush we measured was $4.”
3. Nonsense, for example “asdfgh”. Say: “No cards. It says it cannot match that and points at the catalog.”

If the reply is “I could not answer just now”: quota or a provider timeout. Use **Products** search instead of sending again. The limit is 12 chats a minute on this process.

## 8:00 Cart and guest checkout

Open the cart. Continue to checkout.

Say: “Guest checkout needs an email. Payment is Stripe test mode. Never use a real card. Stop if the form looks like a live charge.”

Fill shipping with made-up demo details and a guest email you are willing to show. Click **Continue to payment**. Choose **Card**. Click **Place order**.

On Stripe, use the well-known test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code. If you do not want to complete payment, cancel and show `/checkout/cancel` instead. Cash on delivery can be mentioned; it does not take a card and does not mark the order paid.

If Stripe errors: say test mode or the session failed, and do not retry with a real card.

## 9:00 Tracking, phone looks, admin

From the success page, open order tracking (`/order/track` with the guest link the success page shows). Say: “A guest follows the order with that link. A signed-in shopper uses My orders.”

Looks and the makeup bag: switch to the Android app and open the bag and a saved look. Say: “The website does not replace the phone camera. A look link is readable by anyone who has the id.”

If the phone is not in the room: open `/makeup-bag` and `/my-looks` on the site and say those are the account lists, not the live camera.

Sign out, or use a private window, and open `/admin`. Say: “Signed out, the screen is Admin sign-in required. Data APIs reject a missing token.” Then sign in as the admin account if you still have time. Do not show the password.

## If the room asks

- Where is live try-on? The phone. This site’s camera is lipstick and blush.
- Did you store my face? The skin log stores the profile and routine, not the picture. The picture is sent to a face service and, if needed, a vision model.
- How accurate? Do not quote a percent.
- What if the model is down? Rules routine, or catalog cards in chat.
- Is checkout real? Stripe test mode only.
