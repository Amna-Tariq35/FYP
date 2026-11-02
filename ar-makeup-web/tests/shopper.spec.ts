import { expect, test } from "@playwright/test";
import { installAiMocks, seedCart } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installAiMocks(page);
});

test("browse products, Clinique filter is one entry, add a product to cart", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Makeup Collection" })).toBeVisible();

  const cliniqueValues = await page.locator('input[name="brand"]').evaluateAll((els) =>
    els
      .map((el) => (el as HTMLInputElement).value)
      .filter((value) => /clinique/i.test(value)),
  );
  expect(cliniqueValues).toEqual(["Clinique"]);

  const filtered = page.waitForResponse(
    (response) => response.url().includes("/api/catalog/products") && response.url().includes("brand=Clinique"),
  );
  await page.locator("label.filter-radio-label").filter({ hasText: /^Clinique$/ }).click();
  const response = await filtered;
  const body = (await response.json()) as { products?: { brand?: string }[] };
  expect((body.products ?? []).length).toBeGreaterThan(0);
  expect((body.products ?? []).every((product) => /clinique/i.test(product.brand ?? ""))).toBe(true);
  await expect(page.locator(".products-grid").getByText("Clinique", { exact: true }).first()).toBeVisible();
  const productLink = page.locator('.products-grid a[href^="/products/"]').first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  await expect(page).toHaveURL(/\/products\/.+/);

  const needsShade = page.getByRole("button", { name: "Select a shade to continue" });
  if (await needsShade.isVisible()) {
    await page.locator("button:has(span.h-3.w-3)").first().click();
  }
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("button", { name: /Added to cart/ })).toBeVisible();
});

test("cart quantity changes and remove leaves the empty state", async ({ page }) => {
  await seedCart(page);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Fit Me Liquid Foundation")).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.locator("span").filter({ hasText: /^2$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(page.locator("span").filter({ hasText: /^1$/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("guest checkout validates required fields and stops before payment", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(orders|checkout)/.test(request.url())) {
      posts.push(request.url());
    }
  });
  await seedCart(page);
  await page.goto("/checkout/shipping");
  await expect(page.locator("#email")).toBeVisible();

  await page.locator("#email").focus();
  await page.locator("#email").blur();
  await expect(page.getByText("Email is required for guest checkout.")).toBeVisible();
  await page.locator("#name").focus();
  await page.locator("#name").blur();
  await expect(page.getByText("Full name is required.")).toBeVisible();
  await page.locator("#phone").focus();
  await page.locator("#phone").blur();
  await expect(page.getByText("Phone number is required.")).toBeVisible();
  await page.locator("#address").focus();
  await page.locator("#address").blur();
  await expect(page.getByText("Address is required.")).toBeVisible();
  await page.locator("#city").focus();
  await page.locator("#city").blur();
  await expect(page.getByText("City is required.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();

  await page.locator("#email").fill("guest@example.com");
  await page.locator("#name").fill("Guest Shopper");
  await page.locator("#phone").fill("03001234567");
  await page.locator("#address").fill("1 Test Street");
  await page.locator("#city").fill("Lahore");
  await page.locator("#country").fill("Pakistan");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/checkout\/payment/);
  await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
  expect(posts).toEqual([]);
});

test("empty cart on shipping shows the empty message", async ({ page }) => {
  await page.goto("/checkout/shipping");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("missing catalog, look, and report ids are HTTP 404; robots and sitemap are 200", async ({ page }) => {
  for (const path of ["/products/not-a-real-key", "/looks/abc", "/skin-analysis/results/not-a-real-id"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
});

test("refresh and browser history keep checkout usable", async ({ page }) => {
  await seedCart(page);
  await page.goto("/cart");
  await page.goto("/checkout/shipping");
  await page.locator("#email").fill("guest@example.com");
  await page.locator("#name").fill("Guest Shopper");
  await page.locator("#phone").fill("03001234567");
  await page.locator("#address").fill("1 Test Street");
  await page.locator("#city").fill("Lahore");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/checkout\/payment/);
  await page.goBack();
  await expect(page).toHaveURL(/\/checkout\/shipping/);
  await expect(page.locator("#email")).toHaveValue("guest@example.com");
  await page.reload();
  await expect(page.locator("#name")).toHaveValue("Guest Shopper");
  await page.goForward();
  await expect(page).toHaveURL(/\/checkout\/payment/);
  await expect(page.getByRole("button", { name: "Place order" })).toBeVisible();
});

test("narrow viewports do not scroll horizontally", async ({ page }) => {
  const overflows: { width: number; path: string; scrollWidth: number; clientWidth: number }[] = [];
  for (const size of [
    { width: 375, height: 812 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(size);
    for (const path of ["/", "/products", "/products/fnd_maybelline_fitme_liquid", "/cart", "/skin-analysis", "/try-on", "/checkout/shipping"]) {
      await page.goto(path);
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (box.scrollWidth > box.clientWidth + 1) overflows.push({ width: size.width, path, ...box });
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Open chat" }).click();
    const panel = page.locator("div.h-\\[560px\\]");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
    await expect(page.getByPlaceholder("Ask for beauty recommendations...")).toBeVisible();
    const pageBox = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (pageBox.scrollWidth > pageBox.clientWidth + 1) {
      overflows.push({ width: size.width, path: "/ chat open", ...pageBox });
    }
  }
  console.log("OVERFLOW", JSON.stringify(overflows));
  expect(overflows).toEqual([]);
});

test("offline products and checkout are not a blank screen", async ({ page, context }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Makeup Collection" })).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: "commit" }).catch(() => undefined);
  const productsText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  console.log("OFFLINE_PRODUCTS", productsText.slice(0, 220));
  expect(productsText.length).toBeGreaterThan(20);

  await context.setOffline(false);
  await seedCart(page);
  await page.goto("/checkout/shipping");
  await expect(page.locator("#email")).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: "commit" }).catch(() => undefined);
  const checkoutText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  console.log("OFFLINE_CHECKOUT", checkoutText.slice(0, 220));
  expect(checkoutText.length).toBeGreaterThan(20);
});
