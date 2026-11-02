import { expect, test } from "@playwright/test";
import { CHAT_FAILURE, chatTextStream, installAiMocks } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installAiMocks(page);
});

test("chat opens, sends a mocked message, and shows the reply", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(chatTextStream("A mocked lipstick suggestion."));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByPlaceholder("Ask for beauty recommendations...").fill("Need a lipstick");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Need a lipstick")).toBeVisible();
  await expect(page.getByText("A mocked lipstick suggestion.")).toBeVisible();
  await expect(page.getByText("Thinking...")).toHaveCount(0);
});

test("mocked total failure shows the failure sentence and catalog cards", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(
      chatTextStream(CHAT_FAILURE, [
        {
          id: "card-1",
          product_key: "fnd_maybelline_fitme_liquid",
          name: "Fit Me Liquid Foundation",
          brand: "Maybelline",
          category: "foundation",
          price: 10,
          currency: "USD",
        },
      ]),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByPlaceholder("Ask for beauty recommendations...").fill("foundation please");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(CHAT_FAILURE)).toBeVisible();
  await expect(page.getByText("Fit Me Liquid Foundation")).toBeVisible();
  await expect(page.getByText("Thinking...")).toHaveCount(0);
});

test("a hung chat shows Try again after the client timeout and stops typing", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.route("**/api/chat", () => new Promise(() => undefined));
  await page.getByRole("button", { name: "Open chat" }).click();
  await page.getByPlaceholder("Ask for beauty recommendations...").fill("hello there");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Thinking...")).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Thinking...")).toHaveCount(0);
});

test("sign-in and sign-up show validation errors without creating an account", async ({ page }) => {
  await page.route("**/*supabase.co/**", (route) => route.abort());
  await page.goto("/auth/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  const signInEmail = page.getByPlaceholder("you@example.com");
  await expect.poll(() => signInEmail.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);

  await signInEmail.fill("not-an-email");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(() => signInEmail.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);

  await page.goto("/auth/sign-up");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  const signUpEmail = page.getByPlaceholder("you@example.com");
  await expect.poll(() => signUpEmail.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await signUpEmail.fill("not-an-email");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(() => signUpEmail.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true);
});

test("signed-out protected pages prompt for sign-in and admin says sign-in required", async ({ page }) => {
  await page.goto("/my-orders");
  await expect(page.getByRole("link", { name: "Sign in to continue" })).toBeVisible();

  await page.goto("/account/routines");
  await expect(page.getByText("Sign in to see your saved skin routines.")).toBeVisible();

  await page.goto("/makeup-bag");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=(%2F|\/)makeup-bag/);

  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  for (const path of ["/admin", "/admin/orders", "/admin/products"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Admin sign-in required" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  }
  expect(dialogs).toEqual([]);
});
