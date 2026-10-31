import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  UIMessage,
  convertToModelMessages,
  stepCountIs,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { clientKey, rateLimit } from "@/src/lib/skin-analysis/rate-limit";
import { loadShopperMatchProfile } from "@/src/lib/catalog/product-profile-matching";
import { asStringList } from "@/src/lib/skin-analysis/product-shape";
import { CHAT_FAILURE_MESSAGE, CHAT_WAIT_MESSAGE, friendlyChatError } from "@/src/lib/chat/public-error";

const CHAT_MODEL = "gemini-3.8-flash";
const DEFAULT_GROQ_CHAT_MODEL = "openai/gpt-oss-120b";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGES_IN_CONTEXT = 10;
const SUPABASE_RESULTS_LIMIT = 5;

// ─── Provider Clients ────────────────────────────────────────────────────────
const google = createGoogleGenerativeAI({
  apiKey: process.env.CHATBOT_GOOGLE_KEY ||"",
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || "",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function trimMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_MESSAGES_IN_CONTEXT) return messages;
  return messages.slice(-MAX_MESSAGES_IN_CONTEXT);
}

function providerStatus(error: unknown): number | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
      cause?: unknown;
      lastError?: unknown;
      response?: { status?: unknown };
    };
    if (typeof record.status === "number") return record.status;
    if (typeof record.statusCode === "number") return record.statusCode;
    if (typeof record.response?.status === "number") return record.response.status;
    current = record.cause ?? record.lastError;
  }
  return undefined;
}

function isGeminiBusy(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      status?: unknown;
      statusCode?: unknown;
      message?: unknown;
      cause?: unknown;
      lastError?: unknown;
      response?: { status?: unknown };
    };
    if (record.status === 503 || record.statusCode === 503 || record.response?.status === 503) {
      return true;
    }
    if (typeof record.message === "string" && /\b503\b/.test(record.message)) return true;
    current = record.cause ?? record.lastError;
  }
  return false;
}

function logProviderFailure(label: string, error: unknown) {
  console.error(label, providerStatus(error) ?? "");
}

function groqChatModel() {
  const configured = process.env.GROQ_CHAT_MODEL?.trim();
  return configured || DEFAULT_GROQ_CHAT_MODEL;
}

function localChatReply(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "local";
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: () => friendlyChatError(undefined),
  });
  return createUIMessageStreamResponse({ stream });
}

async function assertProviderStarted(result: {
  fullStream: AsyncIterable<{ type: string; error?: unknown }>;
}) {
  const iterator = result.fullStream[Symbol.asyncIterator]();
  while (true) {
    const next = await iterator.next();
    if (next.done) {
      throw new Error("empty model output");
    }
    const part = next.value;
    if (part.type === "error") {
      throw part.error instanceof Error ? part.error : new Error("provider failed");
    }
    if (
      part.type === "text-delta" ||
      part.type === "tool-call" ||
      part.type === "tool-input-start" ||
      part.type === "tool-input-delta"
    ) {
      void (async () => {
        try {
          while (!(await iterator.next()).done) {
            // Keep this branch moving so the reply stream is not stalled.
          }
        } catch {
          // The shopper-facing stream reports its own failure.
        }
      })();
      return;
    }
  }
}

function preferScore(
  row: { finish?: string | null; skin_type?: unknown },
  skinType?: string,
  finish?: string,
) {
  let score = 0;
  if (finish && typeof row.finish === "string" && row.finish.trim().toLowerCase() === finish.trim().toLowerCase()) {
    score += 2;
  }
  if (
    skinType &&
    asStringList(row.skin_type).some((value) => value.toLowerCase() === skinType.trim().toLowerCase())
  ) {
    score += 2;
  }
  return score;
}

// ─── SINGLE SMART TOOL: For Both Makeup & Skincare ───────────────────────────
const searchProducts = tool({
  description:
    "Fetch makeup AND skincare products from the unified database catalog based on user preferences.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        "e.g. foundation, lipstick, cleanser, moisturizer, sunscreen, eye cream"
      ),
    skinType: z
      .string()
      .optional()
      .describe("e.g. Oily, Dry, Combination, Normal"),
    itemForm: z
      .string()
      .optional()
      .describe("e.g. Liquid, Powder, Stick, Cream, Serum"),
    tags: z
      .string()
      .optional()
      .describe(
        "e.g. acne, hydrating, matte, anti-aging, vegan (matches with DB tags)"
      ),
    colorFamily: z
      .string()
      .optional()
      .describe("e.g. Red, Pink, Nude (Mostly for makeup)"),
    undertone: z.string().optional().describe("e.g. Warm, Cool, Neutral"),
    finish: z
      .string()
      .optional()
      .describe("e.g. matte, dewy, satin. Prefer products with this finish."),
  }),
  execute: async ({
    category,
    skinType,
    itemForm,
    tags,
    colorFamily,
    undertone,
    finish,
  }) => {
    try {
      const supabase = await createSupabaseServerClient();
      const stored = await loadShopperMatchProfile(supabase);
      const preferredSkin = skinType || stored?.skinType || undefined;
      const preferredFinish = finish || stored?.finish || undefined;

      let query = supabase
        .from("makeup_products")
        .select(
          "id, product_key, name, brand, category, price, image_url, finish, skin_type, product_shades(id, shade_name, color_family, skin_tone, undertone, shade_hex)"
        )
        .eq("is_active", true)
        .limit(SUPABASE_RESULTS_LIMIT);

      if (category) query = query.ilike("category", `%${category}%`);
      if (skinType) query = query.ilike("skin_type", `%${skinType}%`);
      if (itemForm) query = query.ilike("item_form", `%${itemForm}%`);
      if (tags) query = query.ilike("tags", `%${tags}%`);

      if (colorFamily)
        query = query.ilike("product_shades.color_family", `%${colorFamily}%`);
      if (undertone)
        query = query.ilike("product_shades.undertone", `%${undertone}%`);

      const { data, error } = await query;

      if (error) {
        console.error("[searchProducts] Supabase error:", error.message);
        return {
          success: false,
          products: [],
          message: "Database error occurred.",
        };
      }

      const products = (data ?? [])
        .filter((row) => typeof row.product_key === "string" && row.product_key.length > 0)
        .sort((a, b) => preferScore(b, preferredSkin, preferredFinish) - preferScore(a, preferredSkin, preferredFinish));

      if (products.length === 0) {
        return {
          success: true,
          products: [],
          message: "No matching products found.",
        };
      }

      return { success: true, products, message: "" };
    } catch (err) {
      console.error("[searchProducts] Unexpected error:", err);
      return {
        success: false,
        products: [],
        message: "Unexpected error fetching products.",
      };
    }
  },
});

// ─── System Prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a shopping guide for this store's makeup and skincare catalog.
You help people choose products. You are not a dermatologist, and you do not diagnose skin conditions or give clinical treatment advice.

STRICT RULES:
1. ALWAYS call the 'searchProducts' tool before answering product-related questions.
2. Extract context: If they say "I have acne and need a face wash", category="cleanser", tags="acne". If they want "red lipstick", category="lipstick", colorFamily="Red".
3. NEVER list plain text product IDs, database ids, or raw data. Product cards are rendered from tool results and must be identified only by product_key.
4. Keep your response conversational and short (1-2 sentences).
5. If someone asks for a medical diagnosis or treatment plan, say you can only help them shop for products.

FALLBACK RULE:
If the tool returns 0 products, DO NOT hallucinate products. Reply gracefully with:
"I couldn't find an exact match for that right now. Could we try looking for a different category or preference?"`;

function chatStream(result: { toUIMessageStreamResponse: (init?: { onError?: (error: unknown) => string }) => Response }) {
  return result.toUIMessageStreamResponse({
    onError: (error) => {
      logProviderFailure("[chat/route] stream failed", error);
      return friendlyChatError(error);
    },
  });
}

// ─── Route Handler (Gemini First -> Groq Fallback) ──────────────────────────
export async function POST(req: Request) {
  const limit = rateLimit(`chat:${clientKey(req)}`, 12, 60_000);
  if (!limit.ok) {
    return localChatReply(CHAT_WAIT_MESSAGE);
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return localChatReply(CHAT_FAILURE_MESSAGE);
    }
  } catch {
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }

  const trimmedMessages = trimMessages(messages);
  const modelMessages = await convertToModelMessages(trimmedMessages);
  const tools = { searchProducts };
  const shopper = await loadShopperMatchProfile(await createSupabaseServerClient());
  const systemPrompt =
    shopper && (shopper.skinType || shopper.finish)
      ? `${SYSTEM_PROMPT}\n\nThe signed-in shopper's stored skin type is "${shopper.skinType ?? "not set"}" and finish preference is "${shopper.finish ?? "not set"}". When you call searchProducts, pass skinType and finish so matching products are preferred.`
      : SYSTEM_PROMPT;

  const shared = {
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(3),
    maxRetries: 0,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const geminiAbort = new AbortController();
    try {
      const gemini = streamText({
        ...shared,
        model: google(CHAT_MODEL),
        abortSignal: geminiAbort.signal,
      });
      await assertProviderStarted(gemini);
      return chatStream(gemini);
    } catch (error) {
      geminiAbort.abort();
      logProviderFailure(
        attempt === 1 ? "[chat/route] Gemini failed" : "[chat/route] Gemini retry failed",
        error,
      );
      if (attempt === 1 && isGeminiBusy(error)) continue;
      break;
    }
  }

  const fallbackAbort = new AbortController();
  try {
    const fallback = streamText({
      ...shared,
      model: groq(groqChatModel()),
      abortSignal: fallbackAbort.signal,
      providerOptions: {
        groq: { parallel_tool_calls: false },
      },
    });
    await assertProviderStarted(fallback);
    return chatStream(fallback);
  } catch (groqErr) {
    fallbackAbort.abort();
    logProviderFailure("[chat/route] providers failed", groqErr);
    return localChatReply(CHAT_FAILURE_MESSAGE);
  }
}