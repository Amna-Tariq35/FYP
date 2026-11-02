import path from "node:path";
import { expect, test } from "@playwright/test";
import { ANALYSIS_ID, analysisPayload, fulfillJson, installAiMocks } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installAiMocks(page);
});

async function completeQuestionnaire(page: import("@playwright/test").Page) {
  await page.goto("/skin-analysis/questionnaire");
  await page.getByRole("heading", { name: "Dry", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Dryness" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Analyze Skin/ }).click();
}

test("questionnaire submit uses the mocked API", async ({ page }) => {
  let posted = false;
  await page.route("**/api/skin-analysis", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posted = true;
    const body = route.request().postDataJSON() as { method?: string; skinType?: string };
    expect(body.method).toBe("questionnaire");
    expect(body.skinType).toBe("Dry");
    await fulfillJson(route, {
      sessionId: ANALYSIS_ID,
      userSkinType: "Dry",
      mainConcerns: ["dryness"],
      summary: "mocked questionnaire",
      engine: "questionnaire",
      confidence: "high",
    });
  });

  await completeQuestionnaire(page);
  await page.waitForURL(new RegExp(`/skin-analysis/results/${ANALYSIS_ID}`));
  expect(posted).toBe(true);
});

test("results page shows profile, then quick routine, then personalized upgrade", async ({ page }) => {
  const order: string[] = [];
  await page.route(`**/api/skin-analysis/${ANALYSIS_ID}`, async (route) => {
    await fulfillJson(route, analysisPayload());
  });
  await page.route("**/api/generate-routine", async (route) => {
    const body = route.request().postDataJSON() as { quick?: boolean };
    if (body.quick) {
      order.push("quick");
      await fulfillJson(route, {
        success: true,
        data: {
          amRoutine: [{ name: "Quick cleanser", product_key: "mock-cleanser", brand: "Mock", category: "cleanser", price: 8 }],
          pmRoutine: [],
          summary: "Quick",
          source: "rules",
        },
      });
      return;
    }
    order.push("ai");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await fulfillJson(route, {
      success: true,
      data: {
        amRoutine: [{ name: "Personal moisturizer", product_key: "mock-moisturizer", brand: "Mock", category: "moisturizer", price: 12 }],
        pmRoutine: [],
        summary: "Personal",
        source: "ai",
      },
    });
  });

  const response = await page.goto(`/skin-analysis/results/${ANALYSIS_ID}`);
  expect(response?.status(), "results document").toBe(200);
  const profile = page.getByText("Skin profile", { exact: true });
  await expect(profile).toBeVisible();
  const before = await profile.boundingBox();
  await expect(page.getByText("Quick routine")).toBeVisible();
  const afterQuick = await profile.boundingBox();
  expect(Math.abs((before?.y ?? 0) - (afterQuick?.y ?? 0))).toBeLessThan(8);
  await expect(page.getByText("Personalized for you")).toBeVisible();
  const afterPersonal = await profile.boundingBox();
  expect(Math.abs((before?.y ?? 0) - (afterPersonal?.y ?? 0))).toBeLessThan(8);
  expect(order[0]).toBe("quick");
  expect(order).toContain("ai");
});

test("skin questionnaire refresh and back stay on a usable page", async ({ page }) => {
  await page.goto("/skin-analysis");
  await page.locator('a[href="/skin-analysis/questionnaire"]').click();
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await page.getByRole("heading", { name: "Dry", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Skin Analysis" })).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/skin-analysis$/);
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Skin Analysis" })).toBeVisible();
});

test("camera denial shows the upload fallback", async ({ page }) => {
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  await expect(page.getByText("Camera access denied or unavailable.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Upload Photo Instead" })).toBeVisible();
});

test("a hung camera shows the upload fallback", async ({ page }) => {
  await page.addInitScript(() => {
    const hang = new Promise<MediaStream>(() => undefined);
    navigator.mediaDevices.getUserMedia = () => hang;
  });
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  await expect(page.getByText("Camera access denied or unavailable.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Upload Photo Instead" })).toBeVisible();
});

test("an invalid scan file shows the friendly message", async ({ page }) => {
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a photo"),
  });
  await expect(page.getByText("The photo could not be read. Please try again.")).toBeVisible();
});

test("mocked FACE_NOT_CLEAR shows the server message", async ({ page }) => {
  test.setTimeout(90_000);
  let apiCalled = false;
  await page.route("**/api/skin-analysis", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    apiCalled = true;
    await fulfillJson(
      route,
      {
        success: false,
        error: "Face not detected clearly. Please use a straight, well-lit, front-facing photo.",
        code: "FACE_NOT_CLEAR",
      },
      400,
    );
  });
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  const posted = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/api/skin-analysis"),
  );
  await page.locator('input[type="file"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "scan-face.jpg"),
  );
  await posted;
  await expect(
    page.getByText("Face not detected clearly. Please use a straight, well-lit, front-facing photo."),
  ).toBeVisible({ timeout: 20_000 });
  expect(apiCalled).toBe(true);
});

test("try-on with camera denied shows the friendly message, retry, and products link", async ({ page }) => {
  await page.goto("/try-on");
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(
    page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Starting Camera…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
});

test("a hung try-on camera shows retry instead of staying on starting", async ({ page }) => {
  await page.addInitScript(() => {
    const hang = new Promise<MediaStream>(() => undefined);
    navigator.mediaDevices.getUserMedia = () => hang;
  });
  await page.goto("/try-on");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(
    page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Starting Camera…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("missing DeepAR license is not isolatable on this production build", async () => {
  test.skip(
    true,
    "NEXT_PUBLIC_DEEPAR_LICENSE_KEY is inlined at build time from .env.local. A second next start cannot remove it without rebuilding. Not verified.",
  );
});
