import { expect, test } from "@playwright/test";
import { installAiMocks } from "./helpers";

test("fake camera getUserMedia still resolves on try-on", async ({ page }) => {
  await installAiMocks(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const mark = (value: "ok" | "error") => {
      (window as Window & { __gum?: string }).__gum = value;
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      try {
        const stream = await original(constraints);
        mark("ok");
        return stream;
      } catch (error) {
        mark("error");
        throw error;
      }
    };
  });

  await page.goto("/try-on");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as Window & { __gum?: string }).__gum ?? ""), {
      timeout: 20_000,
    })
    .toBe("ok");
});
