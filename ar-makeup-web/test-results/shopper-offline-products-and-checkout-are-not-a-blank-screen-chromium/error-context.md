# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: shopper.spec.ts >> offline products and checkout are not a blank screen
- Location: tests\shopper.spec.ts:168:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 20
Received:   0
```

# Test source

```ts
  75  |   await page.locator("#address").blur();
  76  |   await expect(page.getByText("Address is required.")).toBeVisible();
  77  |   await page.locator("#city").focus();
  78  |   await page.locator("#city").blur();
  79  |   await expect(page.getByText("City is required.")).toBeVisible();
  80  |   await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  81  | 
  82  |   await page.locator("#email").fill("guest@example.com");
  83  |   await page.locator("#name").fill("Guest Shopper");
  84  |   await page.locator("#phone").fill("03001234567");
  85  |   await page.locator("#address").fill("1 Test Street");
  86  |   await page.locator("#city").fill("Lahore");
  87  |   await page.locator("#country").fill("Pakistan");
  88  |   await page.getByRole("button", { name: "Continue to payment" }).click();
  89  |   await expect(page).toHaveURL(/\/checkout\/payment/);
  90  |   await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  91  |   await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
  92  |   expect(posts).toEqual([]);
  93  | });
  94  | 
  95  | test("empty cart on shipping shows the empty message", async ({ page }) => {
  96  |   await page.goto("/checkout/shipping");
  97  |   await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  98  | });
  99  | 
  100 | test("missing catalog, look, and report ids are HTTP 404; robots and sitemap are 200", async ({ page }) => {
  101 |   for (const path of ["/products/not-a-real-key", "/looks/abc", "/skin-analysis/results/not-a-real-id"]) {
  102 |     const response = await page.goto(path);
  103 |     expect(response?.status(), path).toBe(404);
  104 |   }
  105 |   for (const path of ["/robots.txt", "/sitemap.xml"]) {
  106 |     const response = await page.goto(path);
  107 |     expect(response?.status(), path).toBe(200);
  108 |   }
  109 | });
  110 | 
  111 | test("refresh and browser history keep checkout usable", async ({ page }) => {
  112 |   await seedCart(page);
  113 |   await page.goto("/cart");
  114 |   await page.goto("/checkout/shipping");
  115 |   await page.locator("#email").fill("guest@example.com");
  116 |   await page.locator("#name").fill("Guest Shopper");
  117 |   await page.locator("#phone").fill("03001234567");
  118 |   await page.locator("#address").fill("1 Test Street");
  119 |   await page.locator("#city").fill("Lahore");
  120 |   await page.getByRole("button", { name: "Continue to payment" }).click();
  121 |   await expect(page).toHaveURL(/\/checkout\/payment/);
  122 |   await page.goBack();
  123 |   await expect(page).toHaveURL(/\/checkout\/shipping/);
  124 |   await expect(page.locator("#email")).toHaveValue("guest@example.com");
  125 |   await page.reload();
  126 |   await expect(page.locator("#name")).toHaveValue("Guest Shopper");
  127 |   await page.goForward();
  128 |   await expect(page).toHaveURL(/\/checkout\/payment/);
  129 |   await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
  130 | });
  131 | 
  132 | test("narrow viewports do not scroll horizontally", async ({ page }) => {
  133 |   const overflows: { width: number; path: string; scrollWidth: number; clientWidth: number }[] = [];
  134 |   for (const size of [
  135 |     { width: 375, height: 812 },
  136 |     { width: 320, height: 640 },
  137 |   ]) {
  138 |     await page.setViewportSize(size);
  139 |     for (const path of ["/", "/products", "/products/fnd_maybelline_fitme_liquid", "/cart", "/skin-analysis", "/try-on", "/checkout/shipping"]) {
  140 |       await page.goto(path);
  141 |       const box = await page.evaluate(() => ({
  142 |         scrollWidth: document.documentElement.scrollWidth,
  143 |         clientWidth: document.documentElement.clientWidth,
  144 |       }));
  145 |       if (box.scrollWidth > box.clientWidth + 1) overflows.push({ width: size.width, path, ...box });
  146 |     }
  147 |     await page.goto("/");
  148 |     await page.getByRole("button", { name: "Open chat" }).click();
  149 |     const panel = page.locator("div.h-\\[560px\\]");
  150 |     await expect(panel).toBeVisible();
  151 |     const box = await panel.boundingBox();
  152 |     expect(box).not.toBeNull();
  153 |     expect(box!.x).toBeGreaterThanOrEqual(-1);
  154 |     expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  155 |     await expect(page.getByPlaceholder("Ask for beauty recommendations...")).toBeVisible();
  156 |     const pageBox = await page.evaluate(() => ({
  157 |       scrollWidth: document.documentElement.scrollWidth,
  158 |       clientWidth: document.documentElement.clientWidth,
  159 |     }));
  160 |     if (pageBox.scrollWidth > pageBox.clientWidth + 1) {
  161 |       overflows.push({ width: size.width, path: "/ chat open", ...pageBox });
  162 |     }
  163 |   }
  164 |   console.log("OVERFLOW", JSON.stringify(overflows));
  165 |   expect(overflows).toEqual([]);
  166 | });
  167 | 
  168 | test("offline products and checkout are not a blank screen", async ({ page, context }) => {
  169 |   await page.goto("/products");
  170 |   await expect(page.getByRole("heading", { name: "Makeup Collection" })).toBeVisible();
  171 |   await context.setOffline(true);
  172 |   await page.reload({ waitUntil: "commit" }).catch(() => undefined);
  173 |   const productsText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  174 |   console.log("OFFLINE_PRODUCTS", productsText.slice(0, 220));
> 175 |   expect(productsText.length).toBeGreaterThan(20);
      |                               ^ Error: expect(received).toBeGreaterThan(expected)
  176 | 
  177 |   await context.setOffline(false);
  178 |   await seedCart(page);
  179 |   await page.goto("/checkout/shipping");
  180 |   await expect(page.locator("#email")).toBeVisible();
  181 |   await context.setOffline(true);
  182 |   await page.reload({ waitUntil: "commit" }).catch(() => undefined);
  183 |   const checkoutText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  184 |   console.log("OFFLINE_CHECKOUT", checkoutText.slice(0, 220));
  185 |   expect(checkoutText.length).toBeGreaterThan(20);
  186 | });
  187 | 
```