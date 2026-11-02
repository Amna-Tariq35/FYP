# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: skin-and-tryon.spec.ts >> results page shows profile, then quick routine, then personalized upgrade
- Location: tests\skin-and-tryon.spec.ts:42:5

# Error details

```
Error: results document

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 404
```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Report not found" [level=1] [ref=e3]
  - paragraph [ref=e4]: This report could not be found.
  - paragraph [ref=e5]:
    - link "Back to skin analysis" [ref=e6] [cursor=pointer]:
      - /url: /skin-analysis
```

# Test source

```ts
  1   | import path from "node:path";
  2   | import { expect, test } from "@playwright/test";
  3   | import { ANALYSIS_ID, analysisPayload, fulfillJson, installAiMocks } from "./helpers";
  4   | 
  5   | test.beforeEach(async ({ page }) => {
  6   |   await installAiMocks(page);
  7   | });
  8   | 
  9   | async function completeQuestionnaire(page: import("@playwright/test").Page) {
  10  |   await page.goto("/skin-analysis/questionnaire");
  11  |   await page.getByRole("heading", { name: "Dry", exact: true }).click();
  12  |   await page.getByRole("button", { name: "Next" }).click();
  13  |   await page.getByRole("button", { name: "Dryness" }).click();
  14  |   await page.getByRole("button", { name: "Next" }).click();
  15  |   await page.getByRole("button", { name: "Next" }).click();
  16  |   await page.getByRole("button", { name: /Analyze Skin/ }).click();
  17  | }
  18  | 
  19  | test("questionnaire submit uses the mocked API", async ({ page }) => {
  20  |   let posted = false;
  21  |   await page.route("**/api/skin-analysis", async (route) => {
  22  |     if (route.request().method() !== "POST") return route.fallback();
  23  |     posted = true;
  24  |     const body = route.request().postDataJSON() as { method?: string; skinType?: string };
  25  |     expect(body.method).toBe("questionnaire");
  26  |     expect(body.skinType).toBe("Dry");
  27  |     await fulfillJson(route, {
  28  |       sessionId: ANALYSIS_ID,
  29  |       userSkinType: "Dry",
  30  |       mainConcerns: ["dryness"],
  31  |       summary: "mocked questionnaire",
  32  |       engine: "questionnaire",
  33  |       confidence: "high",
  34  |     });
  35  |   });
  36  | 
  37  |   await completeQuestionnaire(page);
  38  |   await page.waitForURL(new RegExp(`/skin-analysis/results/${ANALYSIS_ID}`));
  39  |   expect(posted).toBe(true);
  40  | });
  41  | 
  42  | test("results page shows profile, then quick routine, then personalized upgrade", async ({ page }) => {
  43  |   const order: string[] = [];
  44  |   await page.route(`**/api/skin-analysis/${ANALYSIS_ID}`, async (route) => {
  45  |     await fulfillJson(route, analysisPayload());
  46  |   });
  47  |   await page.route("**/api/generate-routine", async (route) => {
  48  |     const body = route.request().postDataJSON() as { quick?: boolean };
  49  |     if (body.quick) {
  50  |       order.push("quick");
  51  |       await fulfillJson(route, {
  52  |         success: true,
  53  |         data: {
  54  |           amRoutine: [{ name: "Quick cleanser", product_key: "mock-cleanser", brand: "Mock", category: "cleanser", price: 8 }],
  55  |           pmRoutine: [],
  56  |           summary: "Quick",
  57  |           source: "rules",
  58  |         },
  59  |       });
  60  |       return;
  61  |     }
  62  |     order.push("ai");
  63  |     await new Promise((resolve) => setTimeout(resolve, 600));
  64  |     await fulfillJson(route, {
  65  |       success: true,
  66  |       data: {
  67  |         amRoutine: [{ name: "Personal moisturizer", product_key: "mock-moisturizer", brand: "Mock", category: "moisturizer", price: 12 }],
  68  |         pmRoutine: [],
  69  |         summary: "Personal",
  70  |         source: "ai",
  71  |       },
  72  |     });
  73  |   });
  74  | 
  75  |   const response = await page.goto(`/skin-analysis/results/${ANALYSIS_ID}`);
> 76  |   expect(response?.status(), "results document").toBe(200);
      |                                                  ^ Error: results document
  77  |   const profile = page.getByText("Skin profile", { exact: true });
  78  |   await expect(profile).toBeVisible();
  79  |   const before = await profile.boundingBox();
  80  |   await expect(page.getByText("Quick routine")).toBeVisible();
  81  |   const afterQuick = await profile.boundingBox();
  82  |   expect(Math.abs((before?.y ?? 0) - (afterQuick?.y ?? 0))).toBeLessThan(8);
  83  |   await expect(page.getByText("Personalized for you")).toBeVisible();
  84  |   const afterPersonal = await profile.boundingBox();
  85  |   expect(Math.abs((before?.y ?? 0) - (afterPersonal?.y ?? 0))).toBeLessThan(8);
  86  |   expect(order[0]).toBe("quick");
  87  |   expect(order).toContain("ai");
  88  | });
  89  | 
  90  | test("skin questionnaire refresh and back stay on a usable page", async ({ page }) => {
  91  |   await page.goto("/skin-analysis");
  92  |   await page.locator('a[href="/skin-analysis/questionnaire"]').click();
  93  |   await expect(page.getByText("Step 1 of 4")).toBeVisible();
  94  |   await page.getByRole("heading", { name: "Dry", exact: true }).click();
  95  |   await page.getByRole("button", { name: "Next" }).click();
  96  |   await expect(page.getByText("Step 2 of 4")).toBeVisible();
  97  |   await page.reload();
  98  |   await expect(page.getByRole("heading", { name: "Skin Analysis" })).toBeVisible();
  99  |   await expect(page.getByText("Step 1 of 4")).toBeVisible();
  100 |   await page.goBack();
  101 |   await expect(page).toHaveURL(/\/skin-analysis$/);
  102 |   await page.goForward();
  103 |   await expect(page.getByRole("heading", { name: "Skin Analysis" })).toBeVisible();
  104 | });
  105 | 
  106 | test("camera denial shows the upload fallback", async ({ page }) => {
  107 |   await page.goto("/skin-analysis/scan");
  108 |   await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  109 |   await expect(page.getByText("Camera access denied or unavailable.")).toBeVisible({ timeout: 20_000 });
  110 |   await expect(page.getByRole("button", { name: "Upload Photo Instead" })).toBeVisible();
  111 | });
  112 | 
  113 | test("a hung camera shows the upload fallback", async ({ page }) => {
  114 |   await page.addInitScript(() => {
  115 |     const hang = new Promise<MediaStream>(() => undefined);
  116 |     navigator.mediaDevices.getUserMedia = () => hang;
  117 |   });
  118 |   await page.goto("/skin-analysis/scan");
  119 |   await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  120 |   await expect(page.getByText("Camera access denied or unavailable.")).toBeVisible({ timeout: 20_000 });
  121 |   await expect(page.getByRole("button", { name: "Upload Photo Instead" })).toBeVisible();
  122 | });
  123 | 
  124 | test("an invalid scan file shows the friendly message", async ({ page }) => {
  125 |   await page.goto("/skin-analysis/scan");
  126 |   await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  127 |   await page.locator('input[type="file"]').setInputFiles({
  128 |     name: "notes.txt",
  129 |     mimeType: "text/plain",
  130 |     buffer: Buffer.from("this is not a photo"),
  131 |   });
  132 |   await expect(page.getByText("The photo could not be read. Please try again.")).toBeVisible();
  133 | });
  134 | 
  135 | test("mocked FACE_NOT_CLEAR shows the server message", async ({ page }) => {
  136 |   test.setTimeout(90_000);
  137 |   let apiCalled = false;
  138 |   await page.route("**/api/skin-analysis", async (route) => {
  139 |     if (route.request().method() !== "POST") return route.fallback();
  140 |     apiCalled = true;
  141 |     await fulfillJson(
  142 |       route,
  143 |       {
  144 |         success: false,
  145 |         error: "Face not detected clearly. Please use a straight, well-lit, front-facing photo.",
  146 |         code: "FACE_NOT_CLEAR",
  147 |       },
  148 |       400,
  149 |     );
  150 |   });
  151 |   await page.goto("/skin-analysis/scan");
  152 |   await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  153 |   const posted = page.waitForRequest(
  154 |     (request) => request.method() === "POST" && request.url().includes("/api/skin-analysis"),
  155 |   );
  156 |   await page.locator('input[type="file"]').setInputFiles(
  157 |     path.join(process.cwd(), "tests", "fixtures", "scan-face.jpg"),
  158 |   );
  159 |   await posted;
  160 |   await expect(
  161 |     page.getByText("Face not detected clearly. Please use a straight, well-lit, front-facing photo."),
  162 |   ).toBeVisible({ timeout: 20_000 });
  163 |   expect(apiCalled).toBe(true);
  164 | });
  165 | 
  166 | test("try-on with camera denied shows the friendly message, retry, and products link", async ({ page }) => {
  167 |   await page.goto("/try-on");
  168 |   await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  169 |   await page.getByRole("button", { name: "Start camera" }).click();
  170 |   await expect(
  171 |     page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  172 |   ).toBeVisible({ timeout: 20_000 });
  173 |   await expect(page.getByText("Starting Camera…")).toBeHidden();
  174 |   await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  175 |   await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
  176 | });
```