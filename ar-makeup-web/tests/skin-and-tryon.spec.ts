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

test("a slow permission grant does not fail the skin scan", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  test.setTimeout(40_000);
  await page.addInitScript(() => {
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#c8a";
        context.fillRect(0, 0, 32, 32);
      }
      return canvas.captureStream(8);
    };
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.setTimeout(() => resolve(stream()), 20_000);
      });
  });
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  await expect(page.getByText("Starting camera…")).toBeVisible();
  await page.waitForTimeout(19_000);
  await expect(page.getByText("Camera access denied or unavailable.")).toHaveCount(0);
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("a hang after permission shows skin-scan retry at about 12s", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  test.setTimeout(40_000);
  await page.addInitScript(() => {
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#c8a";
        context.fillRect(0, 0, 32, 32);
      }
      return canvas.captureStream(8);
    };
    let calls = 0;
    navigator.mediaDevices.getUserMedia = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(stream());
      return new Promise<MediaStream>(() => undefined);
    };
  });
  await page.goto("/skin-analysis/scan");
  const started = Date.now();
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  await page.waitForTimeout(4_500);
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByText("Still starting...")).toBeVisible({ timeout: 4_000 });
  const hintAt = Date.now() - started;
  expect(hintAt).toBeGreaterThanOrEqual(5_000);
  expect(hintAt).toBeLessThan(9_000);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 8_000 });
  const retryAt = Date.now() - started;
  expect(retryAt).toBeGreaterThanOrEqual(11_000);
  expect(retryAt).toBeLessThan(16_000);
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
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
});

test("a slow permission grant does not fail try-on", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  test.setTimeout(40_000);
  await page.addInitScript(() => {
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#c8a";
        context.fillRect(0, 0, 32, 32);
      }
      return canvas.captureStream(8);
    };
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.setTimeout(() => resolve(stream()), 20_000);
      });
  });
  await page.goto("/try-on");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByText("Starting Camera…")).toBeVisible();
  await page.waitForTimeout(19_000);
  await expect(
    page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  ).toHaveCount(0);
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("a hang after permission shows try-on retry at about 12s", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  test.setTimeout(40_000);
  await page.addInitScript(() => {
    const stream = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#c8a";
        context.fillRect(0, 0, 32, 32);
      }
      return canvas.captureStream(8);
    };
    let calls = 0;
    navigator.mediaDevices.getUserMedia = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(stream());
      return new Promise<MediaStream>(() => undefined);
    };
  });
  await page.goto("/try-on");
  const started = Date.now();
  await page.getByRole("button", { name: "Start camera" }).click();
  await page.waitForTimeout(4_500);
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByText("Still starting...")).toBeVisible({ timeout: 4_000 });
  const hintAt = Date.now() - started;
  expect(hintAt).toBeGreaterThanOrEqual(5_000);
  expect(hintAt).toBeLessThan(9_000);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 8_000 });
  const retryAt = Date.now() - started;
  expect(retryAt).toBeGreaterThanOrEqual(11_000);
  expect(retryAt).toBeLessThan(16_000);
});

test("a hung camera permission can skip to the existing photo upload", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera escape hatch recorded on Chromium");
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
  });
  await page.goto("/skin-analysis/scan");
  await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  const skip = page.getByRole("button", { name: "Skip, upload a photo instead" });
  await expect(skip).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(skip).toBeVisible();
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  const chooserPromise = page.waitForEvent("filechooser");
  await skip.click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a photo"),
  });
  await expect(page.getByText("The photo could not be read. Please try again.")).toBeVisible();
});

test("a hung camera permission can leave try-on on the shade list", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "camera escape hatch recorded on Chromium");
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
  });
  await page.goto("/try-on");
  await page.getByRole("button", { name: "Start camera" }).click();
  const escape = page.getByRole("button", { name: "Browse shades without camera" });
  await expect(escape).toBeVisible();
  await page.waitForTimeout(2_000);
  await expect(escape).toBeVisible();
  await expect(page.getByText("Still starting...")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByText("Select Shade")).toBeVisible();
  const shade = page.locator(".shade-item").first();
  await expect(shade).toBeVisible();
  await shade.click();
  await expect(shade).toHaveClass(/selected/);
  await escape.click();
  await expect(page.getByText("Starting Camera…")).toBeHidden();
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  await expect(page.getByText("Live Preview", { exact: true })).toHaveCount(0);
  await expect(shade).toHaveClass(/selected/);
});

test("missing DeepAR license is not isolatable on this production build", async () => {
  test.skip(
    true,
    "NEXT_PUBLIC_DEEPAR_LICENSE_KEY is inlined at build time from .env.local. A second next start cannot remove it without rebuilding. Not verified.",
  );
});
