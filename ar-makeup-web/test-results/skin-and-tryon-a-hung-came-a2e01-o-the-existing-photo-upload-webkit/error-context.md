# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: skin-and-tryon.spec.ts >> a hung camera permission can skip to the existing photo upload
- Location: tests\skin-and-tryon.spec.ts:303:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Skip, upload a photo instead' })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Skip, upload a photo instead' }) with timeout 15000ms
  - waiting for getByRole('button', { name: 'Skip, upload a photo instead' })

```

```yaml
- banner:
  - link "AR Makeup":
    - /url: /
  - navigation:
    - link "Home":
      - /url: /
    - link "Products":
      - /url: /products
    - link "Try-On":
      - /url: /try-on
    - link "Skin Analysis":
      - /url: /skin-analysis
  - link "Makeup Bag":
    - /url: /makeup-bag
    - img
  - link "Favourites":
    - /url: /account/favourites
    - img
  - link "Cart":
    - /url: /cart
    - img
  - button "Account":
    - img
- heading "Face Mesh Scanner" [level=2]
- button "Upload Photo"
- paragraph: Camera access denied or unavailable.
- button "Upload Photo Instead"
- button "Open chat"
- alert
```

# Test source

```ts
  210 |     (request) => request.method() === "POST" && request.url().includes("/api/skin-analysis"),
  211 |   );
  212 |   await page.locator('input[type="file"]').setInputFiles(
  213 |     path.join(process.cwd(), "tests", "fixtures", "scan-face.jpg"),
  214 |   );
  215 |   await posted;
  216 |   await expect(
  217 |     page.getByText("Face not detected clearly. Please use a straight, well-lit, front-facing photo."),
  218 |   ).toBeVisible({ timeout: 20_000 });
  219 |   expect(apiCalled).toBe(true);
  220 | });
  221 | 
  222 | test("try-on with camera denied shows the friendly message, retry, and products link", async ({ page }) => {
  223 |   await page.goto("/try-on");
  224 |   await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  225 |   await page.getByRole("button", { name: "Start camera" }).click();
  226 |   await expect(
  227 |     page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  228 |   ).toBeVisible({ timeout: 20_000 });
  229 |   await expect(page.getByText("Starting Camera…")).toBeHidden();
  230 |   await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  231 |   await expect(page.getByRole("link", { name: "Browse products" })).toBeVisible();
  232 | });
  233 | 
  234 | test("a slow permission grant does not fail try-on", async ({ page, browserName }) => {
  235 |   test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  236 |   test.setTimeout(40_000);
  237 |   await page.addInitScript(() => {
  238 |     const stream = () => {
  239 |       const canvas = document.createElement("canvas");
  240 |       canvas.width = 32;
  241 |       canvas.height = 32;
  242 |       const context = canvas.getContext("2d");
  243 |       if (context) {
  244 |         context.fillStyle = "#c8a";
  245 |         context.fillRect(0, 0, 32, 32);
  246 |       }
  247 |       return canvas.captureStream(8);
  248 |     };
  249 |     navigator.mediaDevices.getUserMedia = () =>
  250 |       new Promise((resolve) => {
  251 |         window.setTimeout(() => resolve(stream()), 20_000);
  252 |       });
  253 |   });
  254 |   await page.goto("/try-on");
  255 |   await page.getByRole("button", { name: "Start camera" }).click();
  256 |   await expect(page.getByText("Starting Camera…")).toBeVisible();
  257 |   await page.waitForTimeout(19_000);
  258 |   await expect(
  259 |     page.getByText("We couldn't start the camera. You can still browse shades here, or look through the catalog."),
  260 |   ).toHaveCount(0);
  261 |   await expect(page.getByText("Still starting...")).toHaveCount(0);
  262 |   await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  263 | });
  264 | 
  265 | test("a hang after permission shows try-on retry at about 12s", async ({ page, browserName }) => {
  266 |   test.skip(browserName !== "chromium", "camera timer proof recorded on Chromium");
  267 |   test.setTimeout(40_000);
  268 |   await page.addInitScript(() => {
  269 |     const stream = () => {
  270 |       const canvas = document.createElement("canvas");
  271 |       canvas.width = 32;
  272 |       canvas.height = 32;
  273 |       const context = canvas.getContext("2d");
  274 |       if (context) {
  275 |         context.fillStyle = "#c8a";
  276 |         context.fillRect(0, 0, 32, 32);
  277 |       }
  278 |       return canvas.captureStream(8);
  279 |     };
  280 |     let calls = 0;
  281 |     navigator.mediaDevices.getUserMedia = () => {
  282 |       calls += 1;
  283 |       if (calls === 1) return Promise.resolve(stream());
  284 |       return new Promise<MediaStream>(() => undefined);
  285 |     };
  286 |   });
  287 |   await page.goto("/try-on");
  288 |   const started = Date.now();
  289 |   await page.getByRole("button", { name: "Start camera" }).click();
  290 |   await page.waitForTimeout(4_500);
  291 |   await expect(page.getByText("Still starting...")).toHaveCount(0);
  292 |   await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  293 |   await expect(page.getByText("Still starting...")).toBeVisible({ timeout: 4_000 });
  294 |   const hintAt = Date.now() - started;
  295 |   expect(hintAt).toBeGreaterThanOrEqual(5_000);
  296 |   expect(hintAt).toBeLessThan(9_000);
  297 |   await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 8_000 });
  298 |   const retryAt = Date.now() - started;
  299 |   expect(retryAt).toBeGreaterThanOrEqual(11_000);
  300 |   expect(retryAt).toBeLessThan(16_000);
  301 | });
  302 | 
  303 | test("a hung camera permission can skip to the existing photo upload", async ({ page }) => {
  304 |   await page.addInitScript(() => {
  305 |     navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
  306 |   });
  307 |   await page.goto("/skin-analysis/scan");
  308 |   await page.getByRole("button", { name: "I Agree, Open Camera" }).click();
  309 |   const skip = page.getByRole("button", { name: "Skip, upload a photo instead" });
> 310 |   await expect(skip).toBeVisible();
      |                      ^ Error: expect(locator).toBeVisible() failed
  311 |   await page.waitForTimeout(2_000);
  312 |   await expect(skip).toBeVisible();
  313 |   await expect(page.getByText("Still starting...")).toHaveCount(0);
  314 |   await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  315 |   const chooserPromise = page.waitForEvent("filechooser");
  316 |   await skip.click();
  317 |   const chooser = await chooserPromise;
  318 |   await chooser.setFiles({
  319 |     name: "notes.txt",
  320 |     mimeType: "text/plain",
  321 |     buffer: Buffer.from("this is not a photo"),
  322 |   });
  323 |   await expect(page.getByText("The photo could not be read. Please try again.")).toBeVisible();
  324 | });
  325 | 
  326 | test("a hung camera permission can leave try-on on the shade list", async ({ page }) => {
  327 |   await page.addInitScript(() => {
  328 |     navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
  329 |   });
  330 |   await page.goto("/try-on");
  331 |   await page.getByRole("button", { name: "Start camera" }).click();
  332 |   const escape = page.getByRole("button", { name: "Browse shades without camera" });
  333 |   await expect(escape).toBeVisible();
  334 |   await page.waitForTimeout(2_000);
  335 |   await expect(escape).toBeVisible();
  336 |   await expect(page.getByText("Still starting...")).toHaveCount(0);
  337 |   await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  338 |   await expect(page.getByText("Select Shade")).toBeVisible();
  339 |   const shade = page.locator(".shade-item").first();
  340 |   await expect(shade).toBeVisible();
  341 |   await shade.click();
  342 |   await expect(shade).toHaveClass(/selected/);
  343 |   await escape.click();
  344 |   await expect(page.getByText("Starting Camera…")).toBeHidden();
  345 |   await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  346 |   await expect(page.getByText("Live Preview", { exact: true })).toHaveCount(0);
  347 |   await expect(shade).toHaveClass(/selected/);
  348 | });
  349 | 
  350 | test("missing DeepAR license is not isolatable on this production build", async () => {
  351 |   test.skip(
  352 |     true,
  353 |     "NEXT_PUBLIC_DEEPAR_LICENSE_KEY is inlined at build time from .env.local. A second next start cannot remove it without rebuilding. Not verified.",
  354 |   );
  355 | });
  356 | 
```