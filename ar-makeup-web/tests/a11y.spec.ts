import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { installAiMocks, seedCart } from "./helpers";

const pages = [
  "/",
  "/products",
  "/products/fnd_maybelline_fitme_liquid",
  "/skin-analysis",
  "/skin-analysis/questionnaire",
  "/try-on",
  "/cart",
  "/checkout/shipping",
  "/support",
];

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "axe and keyboard checks recorded on Chromium");
  await installAiMocks(page);
});

async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "", outline: "", shadow: "", text: "" };
    const style = getComputedStyle(el);
    return {
      tag: el.tagName,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      shadow: style.boxShadow,
      text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 80),
    };
  });
}

test.describe("axe", () => {
  for (const width of [1280, 375]) {
    for (const path of pages) {
      test(`${path} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        if (path.startsWith("/checkout")) await seedCart(page);
        await page.goto(path);
        await page.locator("body").waitFor();
        const results = await new AxeBuilder({ page }).analyze();
        const compact = results.violations.map((violation) => ({
          impact: violation.impact,
          id: violation.id,
          help: violation.help,
          nodes: violation.nodes.slice(0, 5).map((node) => node.target.join(" ")),
        }));
        if (compact.length > 0) console.log(`AXE ${path} ${width}`, JSON.stringify(compact));
        const ignored = new Set([
          "color-contrast",
          "heading-order",
          "region",
          "landmark-one-main",
          "landmark-unique",
          "label-content-name-mismatch",
        ]);
        const blocking = compact.filter((violation) => !ignored.has(violation.id));
        expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      });
    }
  }
});

test("keyboard: nav, filters, add to cart, chat escape, checkout tab order", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  const navFocus = await focusRing(page);
  console.log("FOCUS_NAV", JSON.stringify(navFocus));
  expect(navFocus.outline.includes("none") && navFocus.shadow === "none").toBe(false);

  await page.goto("/products");
  const hiddenRadio = await page.locator('input[name="brand"]').first().evaluate((el) => getComputedStyle(el).display);
  console.log("FILTER_RADIO_DISPLAY", hiddenRadio);
  await page.locator("label.filter-radio-label").first().focus();
  const filterFocus = await focusRing(page);
  console.log("FOCUS_FILTER", JSON.stringify(filterFocus));

  await page.goto("/products/fnd_maybelline_fitme_liquid");
  const shade = page.getByRole("button").filter({ has: page.locator("span.h-3") }).first();
  if (await shade.isVisible()) await shade.click();
  const add = page.getByRole("button", { name: /Add to cart|Select a shade to continue|Out of stock/ });
  await expect(add).toBeVisible();
  await add.focus();
  const addFocus = await focusRing(page);
  console.log("FOCUS_ADD", JSON.stringify(addFocus));
  if (await add.isEnabled()) expect(addFocus.tag).toBe("BUTTON");

  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "AI Beauty Advisor" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "AI Beauty Advisor" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open chat" })).toBeFocused();

  await seedCart(page);
  await page.goto("/checkout/shipping");
  await page.locator("#email").focus();
  const order: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    order.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id || ""));
    await page.keyboard.press("Tab");
  }
  console.log("CHECKOUT_TAB", order.join(","));
  expect(order.slice(0, 5)).toEqual(["email", "name", "phone", "address", "city"]);
  const emailFocus = await page.locator("#email").evaluate((el) => {
    el.focus();
    const style = getComputedStyle(el);
    return { outline: style.outlineStyle, shadow: style.boxShadow };
  });
  console.log("FOCUS_CHECKOUT_EMAIL", JSON.stringify(emailFocus));
  expect(emailFocus.outline !== "none" || emailFocus.shadow !== "none").toBe(true);
});
