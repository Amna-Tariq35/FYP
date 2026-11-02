import { expect, type Page, type Route } from "@playwright/test";

export const CHAT_FAILURE = "I could not answer just now. Please try again.";

export function uiMessageStream(events: object[]) {
  const body =
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
    "data: [DONE]\n\n";
  return {
    status: 200,
    contentType: "text/event-stream",
    headers: {
      "cache-control": "no-cache",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body,
  };
}

export function chatTextStream(text: string, products?: unknown[]) {
  const events: object[] = [
    { type: "start", messageId: "local" },
    { type: "start-step" },
    { type: "text-start", id: "local" },
    { type: "text-delta", id: "local", delta: text },
    { type: "text-end", id: "local" },
  ];
  if (products) {
    events.push(
      {
        type: "tool-input-available",
        toolCallId: "catalog-fallback",
        toolName: "searchProducts",
        input: {},
      },
      {
        type: "tool-output-available",
        toolCallId: "catalog-fallback",
        output: { success: true, products, message: "" },
      },
    );
  }
  events.push({ type: "finish-step" }, { type: "finish", finishReason: "stop" });
  return uiMessageStream(events);
}

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Default mocks so a test cannot spend a real model call. */
export async function installAiMocks(page: Page) {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill(chatTextStream("Mocked reply from the beauty advisor."));
  });
  await page.route("**/api/generate-routine", async (route) => {
    await fulfillJson(route, {
      success: true,
      data: {
        amRoutine: [{ name: "Mock cleanser", product_key: "mock-cleanser", brand: "Mock", category: "cleanser", price: 8 }],
        pmRoutine: [],
        summary: "Mock routine",
        source: "rules",
      },
    });
  });
  await page.route("**/api/skin-analysis", async (route) => {
    if (route.request().method() === "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(
      route,
      { success: false, error: "Please check your skin type and concerns, then try again." },
      400,
    );
  });
  await page.route("**/api/skin-analysis/*", async (route) => {
    await fulfillJson(route, { error: "Analysis not found." }, 404);
  });
  await page.route("**/api/checkout", (route) => route.abort());
  await page.route("**/api/orders", (route) => {
    if (route.request().method() === "POST") return route.abort();
    return route.fallback();
  });
  await page.route("**/api/orders/**", (route) => {
    if (route.request().method() === "POST") return route.abort();
    return route.fallback();
  });
}

export async function seedCart(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ar_makeup_cart_v1",
      JSON.stringify({
        items: [
          {
            product_key: "fnd_maybelline_fitme_liquid",
            shade_key: "no-shade",
            shade_name: "No Shade",
            quantity: 1,
            selected: true,
            name: "Fit Me Liquid Foundation",
            brand: "Maybelline",
            price: 10,
            image_url: null,
            stock_quantity: 20,
          },
        ],
      }),
    );
  });
}

export async function expectNoHorizontalScroll(page: Page) {
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
}

export const ANALYSIS_ID = "11111111-1111-4111-8111-111111111111";

export function analysisPayload() {
  return {
    analysis: {
      id: ANALYSIS_ID,
      method: "questionnaire",
      skin_type: "Dry",
      concern_scores: {
        version: 2,
        main_concerns: ["dryness"],
        concerns: [{ tag: "dryness", severity: 0.5, source: "questionnaire" }],
        severity_scores: { dryness: 0.5 },
        engine: "questionnaire",
        confidence: "high",
        heuristics: null,
        allergies: [],
        pregnant: false,
      },
      ai_summary: "Based on your answers, this profile is dry, focused on dryness.",
      routine_snapshot: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}
