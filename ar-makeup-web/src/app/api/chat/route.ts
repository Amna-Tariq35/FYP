import {
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

const PROVIDER_FALLBACK =
  "AI Assistant is currently undergoing quick maintenance. Please try again in a moment.";

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

function buildErrorResponse(
  code: "RATE_LIMIT" | "SERVER_ERROR" | "BAD_REQUEST",
  message: string,
  status: number,
  retryAfterSeconds = 0
): Response {
  return new Response(
    JSON.stringify({
      code,
      message,
      retryAfter: retryAfterSeconds,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
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
      console.error("[chat/route] stream failed", error);
      return PROVIDER_FALLBACK;
    },
  });
}

// ─── Route Handler (Gemini First -> Groq Fallback) ──────────────────────────
export async function POST(req: Request) {
  const limit = rateLimit(`chat:${clientKey(req)}`, 12, 60_000);
  if (!limit.ok) {
    return buildErrorResponse(
      "RATE_LIMIT",
      "High traffic detected. Please wait a few seconds before retrying.",
      429,
      60,
    );
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return buildErrorResponse("BAD_REQUEST", "Messages array is required.", 400);
    }
  } catch {
    return buildErrorResponse("BAD_REQUEST", "Invalid JSON payload.", 400);
  }

  const trimmedMessages = trimMessages(messages);
  const modelMessages = await convertToModelMessages(trimmedMessages);
  const tools = { searchProducts };
  const shopper = await loadShopperMatchProfile(await createSupabaseServerClient());
  const systemPrompt =
    shopper && (shopper.skinType || shopper.finish)
      ? `${SYSTEM_PROMPT}\n\nThe signed-in shopper's stored skin type is "${shopper.skinType ?? "not set"}" and finish preference is "${shopper.finish ?? "not set"}". When you call searchProducts, pass skinType and finish so matching products are preferred.`
      : SYSTEM_PROMPT;

  let isGeminiQuotaExceeded = false;

  // 1. ATTEMPT GEMINI FIRST
  try {
    console.log("Attempting Chat with Gemini...");
    const result = streamText({
      model: google("gemini-3.5-flash"),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(3),
    });

    return chatStream(result);
  } catch (geminiErr: any) {
    console.warn("Gemini failed. Attempting Groq fallback...", geminiErr?.message || geminiErr);

    if (
      geminiErr?.status === 429 ||
      geminiErr?.message?.includes("quota") ||
      geminiErr?.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      isGeminiQuotaExceeded = true;
    }

    // 2. FALLBACK TO GROQ
    try {
      console.log("Attempting Chat with Groq Fallback...");
      const result = streamText({
        model: groq("qwen-3.6-27b"),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(3),
        providerOptions: {
          groq: { parallel_tool_calls: false },
        },
      });

      return chatStream(result);
    } catch (groqErr: any) {
      console.error("[chat/route] All AI Providers Failed:", groqErr?.message || groqErr);

      const isGroqQuotaExceeded =
        groqErr?.status === 429 ||
        groqErr?.message?.includes("rate") ||
        groqErr?.message?.includes("quota");

      // Categorized Error Responses
      if (isGeminiQuotaExceeded || isGroqQuotaExceeded) {
        return buildErrorResponse(
          "RATE_LIMIT",
          "High traffic detected. Please wait a few seconds before retrying.",
          429,
          10
        );
      }

      return buildErrorResponse(
        "SERVER_ERROR",
        PROVIDER_FALLBACK,
        503
      );
    }
  }
}